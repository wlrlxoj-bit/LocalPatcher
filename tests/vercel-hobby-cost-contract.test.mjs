import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), 'utf8');

/** `<Link ...>` 여는 태그 문자열을 모두 추출합니다. */
function extractLinkOpenTags(source) {
  return source.match(/<Link\b[\s\S]*?>/g) ?? [];
}

test('TOP 1: ISR 및 Data Cache TTL은 86400초로 상향되고 404 slug는 unstable_cache를 쓰지 않는다', async () => {
  const [supabaseSource, steamSource, homePageSource, patcherPageSource] = await Promise.all([
    read('lib/supabase.ts'),
    read('lib/steam.ts'),
    read('app/[locale]/page.tsx'),
    read('app/[locale]/patcher/[game_slug]/page.tsx'),
  ]);

  // lib/supabase.ts의 모든 unstable_cache는 86400초(24시간)를 사용하며 3600초 잔재가 없어야 합니다.
  assert.doesNotMatch(supabaseSource, /revalidate:\s*3600\b/);
  const supabaseRevalidates = supabaseSource.match(/revalidate:\s*86400\b/g) ?? [];
  assert.equal(supabaseRevalidates.length, 6, 'lib/supabase.ts의 6개 unstable_cache 모두 revalidate: 86400이어야 합니다.');

  // 임의의 404 봇 스캔 slug가 Data Cache Write를 유발하지 않도록 getGameBySlug·resolveGameSlugAlias는 unstable_cache 미사용
  assert.match(supabaseSource, /export async function getGameBySlug\(/);
  assert.match(supabaseSource, /export async function resolveGameSlugAlias\(/);
  assert.doesNotMatch(supabaseSource, /getGameBySlug\s*=\s*unstable_cache/);
  assert.doesNotMatch(supabaseSource, /resolveGameSlugAlias\s*=\s*unstable_cache/);
  assert.doesNotMatch(supabaseSource, /['"]game-by-slug['"]/);
  assert.doesNotMatch(supabaseSource, /['"]resolve-game-slug['"]/);

  // Steam 뉴스는 24시간(86400초) 캐시하고, 실시간 접속자는 기존 no-store 계약을 유지합니다.
  assert.match(steamSource, /GetNewsForApp[\s\S]*?next:\s*\{\s*revalidate:\s*86400\s*\}/);
  assert.doesNotMatch(steamSource, /revalidate:\s*3600\s*\*\s*6/);
  assert.match(steamSource, /GetNumberOfCurrentPlayers[\s\S]*?cache:\s*'no-store'/);

  // 홈·패처 페이지 모두 86400초 ISR 주기를 유지합니다.
  assert.match(homePageSource, /export const revalidate = 86400;/);
  assert.match(patcherPageSource, /export const revalidate = 86400;/);
});

test('TOP 2: 주요 내부 Link는 prefetch={false}를 지정하고 매핑 조회·영문 페이로드를 축소한다', async () => {
  const linkTargets = [
    ['layouts/Header.tsx', 11],
    ['layouts/Footer.tsx', 6],
    ['components/GameCard.tsx', 1],
    ['components/PatcherClient.tsx', 4],
  ];

  for (const [file, minCount] of linkTargets) {
    const source = await read(file);
    const linkTags = extractLinkOpenTags(source);
    assert.ok(linkTags.length >= minCount, `${file}의 <Link> 개수가 예상(${minCount})보다 적습니다.`);
    for (const tag of linkTags) {
      assert.match(tag, /\bprefetch=\{false\}/, `${file}의 <Link>에 prefetch={false}가 누락되었습니다: ${tag}`);
    }
  }

  const [supabaseSource, patcherPageSource] = await Promise.all([
    read('lib/supabase.ts'),
    read('app/[locale]/patcher/[game_slug]/page.tsx'),
  ]);

  // getMappingsForTrainer와 loadMappingsForTrainers는 select('*') 대신 명시적 공개 컬럼만 조회합니다.
  const requiredColumns = [
    'id',
    'trainer_id',
    'language_code',
    'offset_dec',
    'encoding',
    'original_text',
    'translated_text',
    'max_char_len',
    'is_approved',
  ];
  const mappingSelectMatches = supabaseSource.match(/from\('translation_mappings'\)\s*\.select\(([^)]+)\)/g) ?? [];
  assert.ok(mappingSelectMatches.length >= 2, 'translation_mappings 조회가 존재해야 합니다.');
  for (const match of mappingSelectMatches) {
    assert.doesNotMatch(match, /\.select\(\s*['"]\*['"]\s*\)/, 'translation_mappings 조회에 select("*")를 사용하지 않아야 합니다.');
  }
  const columnsDef = supabaseSource.match(/PUBLIC_TRANSLATION_MAPPING_COLUMNS\s*=\s*['"]([^'"]+)['"]/)?.[1] ?? '';
  for (const col of requiredColumns) {
    assert.ok(columnsDef.split(',').map((s) => s.trim()).includes(col), `필수 매핑 컬럼 누락: ${col}`);
  }

  // en 로케일 패처 페이지는 불필요한 매핑 DB 조회를 생략합니다.
  assert.match(
    patcherPageSource,
    /const mappingsMap = currentLocale !== 'en'\s*\?\s*await getMappingsForTrainers\(/,
  );
});

test('TOP 3: middleware matcher는 정적 자산·API·사이트맵·메타 파일·확장자 파일을 제외한다', async () => {
  const source = await read('middleware.ts');
  const matcherLiteral = source.match(/matcher:\s*\[\s*(?:\/\/[^\n]*\n\s*)*'([^']+)'/)?.[1];
  assert.ok(matcherLiteral, 'middleware.ts에서 matcher 패턴을 추출할 수 있어야 합니다.');

  const expectedTokens = [
    '_next/',
    'api/',
    'images/',
    'sitemap\\\\.xml$',
    'robots\\\\.txt$',
    'favicon\\\\.ico$',
    'icon\\\\.png$',
    'ads\\\\.txt$',
    'llms\\\\.txt$',
    '.*\\\\.[^/]+$',
  ];
  for (const token of expectedTokens) {
    assert.ok(matcherLiteral.includes(token), `middleware matcher에 제외 패턴 누락: ${token}`);
  }

  // JS 문자열 이스케이프(\\)를 정규식 소스로 복원해 실제 경로 매칭 동작을 검증합니다.
  const regex = new RegExp(`^${matcherLiteral.replace(/\\\\/g, '\\')}$`);
  for (const shouldMatch of ['/', '/ko', '/ko/patcher/cyberpunk-2077', '/patcher/elden-ring']) {
    assert.equal(regex.test(shouldMatch), true, `미들웨어 대상 경로가 매칭되어야 합니다: ${shouldMatch}`);
  }
  for (const shouldSkip of [
    '/_next/static/chunks/app.js',
    '/api/prices',
    '/images/hero.png',
    '/sitemap.xml',
    '/robots.txt',
    '/favicon.ico',
    '/icon.png',
    '/ads.txt',
    '/llms.txt',
    '/cover.webp',
  ]) {
    assert.equal(regex.test(shouldSkip), false, `정적/API 경로는 미들웨어 matcher에서 제외되어야 합니다: ${shouldSkip}`);
  }
  // getLocale는 'en'을 제외한 공개 현지화 로케일(ko, ja, de, es)만 자동 308 리다이렉트 대상으로 삼아야 합니다.
  assert.match(source, /const locales\s*=\s*\['en',\s*'ko',\s*'ja',\s*'de',\s*'es'\];/);
  assert.match(source, /const publicLocales\s*=\s*\['ko',\s*'ja',\s*'de',\s*'es'\];/);
  assert.match(source, /const defaultLocale\s*=\s*'ko';/);
  assert.match(source, /function getLocale\([\s\S]*?publicLocales\.includes\(locale\)/);
  assert.doesNotMatch(source, /function getLocale\([\s\S]*?\blocales\.includes\(locale\)/);
});

test('TOP 4: robots.ts는 AI·SEO 봇과 /api/·/*/admin·쿼리를 차단하되 /en/은 미차단하고 llms.txt는 /admin을 노출하지 않는다', async () => {
  const [robotsSource, llmsSource] = await Promise.all([
    read('app/robots.ts'),
    read('public/llms.txt'),
  ]);

  assert.match(robotsSource, /allow:\s*['"]\/['"]/);
  for (const disallowed of ['/api/', '/*/admin', '/*?*']) {
    assert.ok(robotsSource.includes(`'${disallowed}'`), `robots.ts disallow에 ${disallowed}가 포함되어야 합니다.`);
  }
  assert.doesNotMatch(
    robotsSource,
    /['"]\/en\/['"]/,
    'noindex /en/ 경로는 Googlebot이 색인 풀에서 제거할 수 있도록 robots.txt에서 차단하면 안 됩니다.',
  );
  assert.doesNotMatch(robotsSource, /['"]\/_next\//, 'Google 렌더링용 /_next/는 차단하면 안 됩니다.');
  assert.doesNotMatch(
    robotsSource,
    /disallow\s*:\s*(?:\[(?:(?!\])[\s\S]){0,1000}?['"]\/patcher(?:\/|['"])|['"]\/patcher(?:\/|['"]))/i,
    '정상 /patcher 경로는 차단하면 안 됩니다.',
  );

  const blockedBots = [
    'GPTBot',
    'ChatGPT-User',
    'CCBot',
    'Bytespider',
    'ClaudeBot',
    'anthropic-ai',
    'PerplexityBot',
    'AhrefsBot',
    'SemrushBot',
    'MJ12bot',
    'DotBot',
  ];
  for (const bot of blockedBots) {
    assert.ok(robotsSource.includes(`'${bot}'`), `robots.ts에 차단 대상 봇 누락: ${bot}`);
  }
  assert.match(robotsSource, /disallow:\s*['"]\/['"]/);

  assert.doesNotMatch(llmsSource, /Administrator Dashboard|\/admin\b/i, 'llms.txt에 관리자 경로가 노출되면 안 됩니다.');
  assert.doesNotMatch(llmsSource, /\/en\/patcher\//, 'llms.txt 예시에 비색인 /en/patcher/가 남아있으면 안 됩니다.');
  assert.match(llmsSource, /\/ko\/patcher\/cyberpunk-2077/);
});

test('TOP 5: next.config.ts는 전역 unoptimized를 활성화하고 공개 API 캐시 헤더를 적용한다', async () => {
  const [nextConfigSource, mappingsApiSource, pricesApiSource] = await Promise.all([
    read('next.config.ts'),
    read('app/api/v1/mappings/[trainer_id]/route.ts'),
    read('app/api/prices/route.ts'),
  ]);

  assert.match(nextConfigSource, /images:\s*\{[\s\S]*?unoptimized:\s*true/);
  assert.match(nextConfigSource, /remotePatterns:/);

  // /api/v1/mappings/[trainer_id]: 200은 공유 CDN 캐시, 400/500은 private, no-store
  assert.match(mappingsApiSource, /public, s-maxage=3600, stale-while-revalidate=86400/);
  assert.match(mappingsApiSource, /private, no-store/);
  assert.match(mappingsApiSource, /status:\s*200,\s*headers:\s*PUBLIC_CACHE_HEADERS/);
  assert.match(mappingsApiSource, /status:\s*400,\s*headers:\s*NO_STORE_HEADERS/);
  assert.match(mappingsApiSource, /status:\s*500,\s*headers:\s*NO_STORE_HEADERS/);

  // /api/prices: UNSUPPORTED_GAME(404)만 CDN 캐시 적용, 400/502/503 오류는 private, no-store 유지
  assert.match(
    pricesApiSource,
    /error:\s*'UNSUPPORTED_GAME'[\s\S]{0,120}status:\s*404,\s*headers:\s*SUCCESS_CACHE_HEADERS/,
  );
  assert.match(pricesApiSource, /status === 200 \? SUCCESS_CACHE_HEADERS : ERROR_CACHE_HEADERS/);
});
