import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = process.cwd();
const read = (file) => readFile(path.join(root, file), 'utf8');

/** `<Link ...>` 여는 태그 문자열을 모두 추출합니다. */
function extractLinkOpenTags(source) {
  return source.match(/<Link\b[\s\S]*?>/g) ?? [];
}

test('1. genres.ts 레지스트리는 10개 표준 장르 허브를 slug·DB명으로 정확히 해석한다', async () => {
  const script = `
    import { GENRE_HUBS, getGenreHubBySlug, getGenreSlugByDbName, getGenreHubSeoCopy } from './lib/i18n/genres.ts';
    const expected = [
      ['action', 'Action'],
      ['adventure', 'Adventure'],
      ['rpg', 'RPG'],
      ['indie', 'Indie'],
      ['strategy', 'Strategy'],
      ['simulation', 'Simulation'],
      ['casual', 'Casual'],
      ['early-access', 'Early Access'],
      ['racing', 'Racing'],
      ['sports', 'Sports'],
    ];
    const results = {
      count: GENRE_HUBS.length,
      bySlug: expected.map(([slug, dbName]) => getGenreHubBySlug(slug)?.dbName === dbName),
      byDbName: expected.map(([slug, dbName]) => getGenreSlugByDbName(dbName) === slug),
      byDbNameCaseInsensitive: getGenreSlugByDbName(' early access ') === 'early-access',
      unknownSlug: getGenreHubBySlug('non-existent-genre') === undefined,
      unknownDbName: getGenreSlugByDbName('Unknown Genre') === undefined,
      seoCopyLocales: ['ko', 'ja', 'de', 'es', 'en'].map((locale) => {
        const copy = getGenreHubSeoCopy(GENRE_HUBS[0], locale);
        return Boolean(copy.title && copy.description && copy.h1 && copy.intro);
      }),
    };
    console.log(JSON.stringify(results));
  `;
  const { stdout } = await execFileAsync(
    process.execPath,
    ['--experimental-strip-types', '--input-type=module', '-e', script],
    { cwd: root },
  );
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.count, 10, 'GENRE_HUBS는 정확히 10개여야 합니다.');
  assert.ok(parsed.bySlug.every(Boolean), '모든 10개 장르가 slug로 해석되어야 합니다.');
  assert.ok(parsed.byDbName.every(Boolean), '모든 10개 장르가 DB명으로 해석되어야 합니다.');
  assert.equal(parsed.byDbNameCaseInsensitive, true);
  assert.equal(parsed.unknownSlug, true);
  assert.equal(parsed.unknownDbName, true);
  assert.ok(parsed.seoCopyLocales.every(Boolean), '5개 언어 모두 SEO 카피가 비어 있지 않아야 합니다.');
});

test('2. app/[locale]/genre/[genre]/page.tsx는 86400초 ISR·prefetch={false}·/en noindex·404 차단·JSON-LD를 준수한다', async () => {
  const source = await read('app/[locale]/genre/[genre]/page.tsx');

  // 24시간 ISR 및 40개 정적 파라미터 생성
  assert.match(source, /export const revalidate = 86400;/);
  assert.match(source, /export async function generateStaticParams\(\)/);
  assert.match(source, /for \(const locale of AUTO_LOCALIZATION_LOCALES\)/);
  assert.match(source, /for \(const hub of GENRE_HUBS\)/);

  // 알 수 없는 슬러그: DB·Data Cache 호출 전 즉시 noindex / notFound()
  assert.match(source, /if \(!hub\) \{\s*return \{ robots: \{ index: false, follow: false \} \};\s*\}/);
  assert.match(source, /if \(!hub\) \{\s*notFound\(\);\s*\}/);

  // /en은 noindex, follow; 4개 현지화 언어는 index, follow
  assert.match(source, /robots:\s*isIndexable \? \{ index: true, follow: true \} : \{ index: false, follow: true \}/);

  // 모든 내부 <Link>에 prefetch={false} 필수
  const linkTags = extractLinkOpenTags(source);
  assert.ok(linkTags.length >= 3, '장르 허브 페이지에는 브레드크럼·장르 스위처·홈 복귀 링크가 있어야 합니다.');
  for (const tag of linkTags) {
    assert.match(tag, /\bprefetch=\{false\}/, `장르 허브 <Link>에 prefetch={false} 누락: ${tag}`);
  }

  // 기존 86400초 캐시 재사용(새 unstable_cache 금지)
  assert.match(source, /getGamesWithTrainers\(\)/);
  assert.doesNotMatch(source, /unstable_cache/);

  // CollectionPage + BreadcrumbList @graph JSON-LD + \u003c 이스케이프
  assert.match(source, /'@type':\s*'CollectionPage'/);
  assert.match(source, /'@type':\s*'BreadcrumbList'/);
  assert.match(source, /'@graph':\s*\[/);
  assert.match(source, /\.replace\(\/<\/g,\s*'\\\\u003c'\)/);
});

test('3. sitemap·홈·PatcherUniqueContent는 /genre/ 허브로 prefetch={false} 내부 링크를 연결한다', async () => {
  const [sitemapSource, homeSource, uniqueContentSource] = await Promise.all([
    read('app/sitemap.ts'),
    read('app/[locale]/page.tsx'),
    read('components/PatcherUniqueContent.tsx'),
  ]);

  // sitemap: 40개 장르 허브 URL + hreflang + priority 0.85
  assert.match(sitemapSource, /import \{ GENRE_HUBS \} from '@\/lib\/i18n\/genres';/);
  assert.match(sitemapSource, /for \(const hub of GENRE_HUBS\)/);
  assert.match(sitemapSource, /url:\s*`\$\{SITE_URL\}\/\$\{locale\}\/genre\/\$\{hub\.slug\}`/);
  assert.match(sitemapSource, /priority:\s*0\.85/);
  assert.match(sitemapSource, /changeFrequency:\s*'weekly'/);
  assert.match(sitemapSource, /genreLanguages\['x-default'\]/);

  // 홈: 장르 허브 링크 바 + prefetch={false}
  assert.match(homeSource, /href=\{`\/\$\{currentLocale\}\/genre\/\$\{hub\.slug\}`\}/);
  const homeLinks = extractLinkOpenTags(homeSource);
  assert.ok(homeLinks.length >= 1, '홈페이지에 장르 허브 <Link>가 있어야 합니다.');
  for (const tag of homeLinks) {
    assert.match(tag, /\bprefetch=\{false\}/, `홈 <Link>에 prefetch={false} 누락: ${tag}`);
  }

  // PatcherUniqueContent: 인식된 장르를 /genre/ 허브 링크 배지로 렌더링 + prefetch={false}
  assert.match(uniqueContentSource, /getGenreSlugByDbName/);
  assert.match(uniqueContentSource, /href=\{`\/\$\{locale\}\/genre\/\$\{item\.genreSlug\}`\}/);
  const uniqueLinks = extractLinkOpenTags(uniqueContentSource);
  assert.ok(uniqueLinks.length >= 1, 'PatcherUniqueContent에 장르 허브 <Link>가 있어야 합니다.');
  for (const tag of uniqueLinks) {
    assert.match(tag, /\bprefetch=\{false\}/, `PatcherUniqueContent <Link>에 prefetch={false} 누락: ${tag}`);
  }
});

test('4. Supabase 마이그레이션 파일이 approved_translated_option_count >= option_count 조건을 포함한다', async () => {
  const migrationSource = await read(
    'supabase/migrations/202611220001_sync_patcher_snapshot_translated_option_count.sql',
  );

  assert.match(
    migrationSource,
    /create or replace function public\.refresh_patcher_index_eligibility_snapshot\(p_trainer_id bigint default null::bigint\)/i,
  );
  assert.match(migrationSource, /approved_option_count >= option_count/);
  assert.match(migrationSource, /approved_translated_option_count >= option_count/);
  assert.match(migrationSource, /mapping\.translated_text/);
});
