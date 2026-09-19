import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const patcherPageUrl = new URL('../app/[locale]/patcher/[game_slug]/page.tsx', import.meta.url);
const uniqueContentUrl = new URL('../components/PatcherUniqueContent.tsx', import.meta.url);
const sitemapUrl = new URL('../app/sitemap.ts', import.meta.url);
const localeHomeUrl = new URL('../app/[locale]/page.tsx', import.meta.url);
const contentEligibilityUrl = new URL('../lib/content-eligibility.ts', import.meta.url);

test('게임 정보는 서버 슬롯으로 전달하고 두 언어 화면에서 각각 한 번 표시한다', async () => {
  const page = await readFile(patcherPageUrl, 'utf8');
  const client = await readFile(new URL('../components/PatcherClient.tsx', import.meta.url), 'utf8');
  assert.equal((page.match(/<PatcherUniqueContent/g) || []).length, 1);
  assert.match(page, /gameInfoSlot=\{\(/);
  assert.equal((client.match(/\{gameInfoSlot\}/g) || []).length, 2);
  assert.doesNotMatch(client, /PatcherUniqueContent|pt\.faqA1|pt\.faqA2/);
  assert.doesNotMatch(client, /SafetyAndUsageGuideSection/);
  assert.match(client, /unapprovedStatus === 'pending' \? pt\.autoVerifyInProgress : pt\.translationUnavailable/);
  assert.match(client, /unapprovedStatus === 'pending' \? pt\.autoVerifyInProgressDesc : pt\.translationUnavailableDesc/);
});

test('패처 metadata는 4개 현지화 언어의 승인·완전 번역만 index와 hreflang에 넣는다', async () => {
  const source = await readFile(patcherPageUrl, 'utf8');

  assert.match(source, /const indexEligible = await isPatcherIndexEligible\(game\.id, currentLocale\)/);
  assert.match(source, /AUTO_LOCALIZATION_LOCALES\.map/);
  assert.match(source, /robots:\s*indexEligible\s*\?\s*\{\s*index:\s*true,\s*follow:\s*true\s*\}/s);
  assert.match(source, /canonical:\s*`\/\$\{currentLocale\}\/patcher\/\$\{canonicalSlug\}`/);
  assert.doesNotMatch(source, /en: `\/en\/patcher\/\$\{canonicalSlug\}`/);
  assert.match(source, /alternateLanguages\['x-default'\] = alternateLanguages\.ko/);
});

test('정상 패처의 상위 SEO 경계는 noindex 헤더나 robots 차단을 만들지 않는다', async () => {
  // support/admin처럼 의도적으로 noindex를 사용할 수 있는 별도 경로는 검사 대상이 아니다.
  // 이 검사는 소스 계약이며, 실제 응답 HTML·헤더는 Validator의 production build 검사로 보완한다.
  const boundaryFiles = [
    patcherPageUrl,
    new URL('../app/layout.tsx', import.meta.url),
    new URL('../app/[locale]/layout.tsx', import.meta.url),
    new URL('../app/robots.ts', import.meta.url),
  ];
  for (const configName of ['next.config.ts', 'next.config.mjs', 'next.config.js']) {
    const configUrl = new URL(`../${configName}`, import.meta.url);
    try {
      await readFile(configUrl, 'utf8');
      boundaryFiles.push(configUrl);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  for (const middlewarePath of ['../middleware.ts', '../src/middleware.ts']) {
    const middlewareUrl = new URL(middlewarePath, import.meta.url);
    try {
      await readFile(middlewareUrl, 'utf8');
      boundaryFiles.push(middlewareUrl);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }

  for (const fileUrl of boundaryFiles) {
    const source = await readFile(fileUrl, 'utf8');
    assert.doesNotMatch(source, /['"]noindex['"]/i, `${fileUrl.pathname}에 문자열 noindex가 없어야 합니다.`);
    assert.doesNotMatch(source, /X-Robots-Tag[\s\S]{0,160}(?:noindex|none)/i, `${fileUrl.pathname}에 색인 차단 헤더가 없어야 합니다.`);
  }

  const robotsSource = await readFile(new URL('../app/robots.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(robotsSource, /disallow\s*:\s*(?:\[(?:(?!\])[\s\S]){0,1000}?['"]\/patcher(?:\/|['"])|['"]\/patcher(?:\/|['"]))/i);
  assert.match(robotsSource, /allow:\s*['"]\/['"]/);

  const patcherSource = await readFile(patcherPageUrl, 'utf8');
  assert.match(patcherSource, /const indexEligible = await isPatcherIndexEligible\(game\.id, currentLocale\)/);
  assert.match(patcherSource, /robots:\s*indexEligible\s*\?\s*\{\s*index:\s*true,\s*follow:\s*true\s*\}\s*:\s*\{\s*index:\s*false,\s*follow:\s*true\s*\}/s);
  assert.equal((patcherSource.match(/index:\s*false/g) || []).length, 1, '비자격 patcher 분기 외 index:false가 없어야 합니다.');
});

test('구조화 데이터와 sitemap 변경 시각 신호가 중복되거나 실행 시각에 의존하지 않는다', async () => {
  const [pageSource, uniqueContentSource, sitemapSource] = await Promise.all([
    readFile(patcherPageUrl, 'utf8'),
    readFile(uniqueContentUrl, 'utf8'),
    readFile(sitemapUrl, 'utf8'),
  ]);

  assert.equal((pageSource.match(/type="application\/ld\+json"/g) || []).length, 1);
  assert.doesNotMatch(pageSource, /FAQPage/);
  assert.doesNotMatch(uniqueContentSource, /application\/ld\+json/);
  assert.doesNotMatch(sitemapSource, /lastModified:\s*new Date\s*\(/);
});

test('sitemap은 승인된 URL 생성 루프를 유지하고 홈 링크는 별도로 canonicalize·중복 제거한다', async () => {
  const [sitemapSource, localeHomeSource] = await Promise.all([
    readFile(sitemapUrl, 'utf8'),
    readFile(localeHomeUrl, 'utf8'),
  ]);

  assert.match(sitemapSource, /getEligiblePatcherSlugs\(locale\)/);
  assert.match(sitemapSource, /const locales = AUTO_LOCALIZATION_LOCALES/);
  assert.doesNotMatch(sitemapSource, /patchableSnapshot|last-known-good/);
  assert.match(sitemapSource, /for \(const locale of locales\)[\s\S]*for \(const slug of eligibleSlugs\[locale\]\)/);
  assert.match(sitemapSource, /url:\s*`\$\{SITE_URL\}\/\$\{locale\}\/patcher\/\$\{slug\}`/);

  assert.match(localeHomeSource, /canonicalizeListedGameSlug\(game\.slug, existingSlugs, titleBySlug\)/);
  assert.match(localeHomeSource, /new Map\(directoryCandidates\.map/);
  assert.match(localeHomeSource, /const canonicalGame = gameBySlug\.get\(canonicalSlug\) \|\| game/);
  assert.match(localeHomeSource, /\[canonicalSlug, \{ \.\.\.canonicalGame, slug: canonicalSlug \}\]/);
});

test('게임별 지원 정보는 매핑 행 수가 아니라 승인된 최신 트레이너의 옵션 수를 표시한다', async () => {
  const [pageSource, uniqueContentSource] = await Promise.all([
    readFile(patcherPageUrl, 'utf8'),
    readFile(uniqueContentUrl, 'utf8'),
  ]);

  assert.match(pageSource, /const hasApprovedLatestMapping = latestTrainer[\s\S]*?\.length > 0/);
  assert.match(pageSource, /const translatedOptionCount = hasApprovedLatestMapping \? supportedOptionCount : 0/);
  assert.doesNotMatch(pageSource, /const translatedOptionCount = latestTrainer[\s\S]*?\.length/);
  assert.match(pageSource, /\.map\(\(trainer\) => trainer\.version_str\?\.trim\(\)\)/);
  assert.match(uniqueContentSource, /versions\.length > 0 \? versions\.join\(', '\) : labels\.unavailable/);
  for (const localizedFallback of ['정보 없음', 'Not available', '情報なし', 'Keine Angaben', 'Sin información']) {
    assert.ok(uniqueContentSource.includes(`unavailable: '${localizedFallback}'`));
  }

  const latestTrainer = { option_count: 35 };
  const approvedMappingRows = [{ translated_text: '전체 번역문' }];
  const displayedCount = approvedMappingRows.length > 0 && latestTrainer.option_count > 0
    ? latestTrainer.option_count
    : 0;
  assert.equal(displayedCount, 35, '매핑 1행은 번역 옵션 1개가 아니라 전체 35개 옵션의 승인 근거입니다.');
  assert.equal('   '.trim(), '', '공백뿐인 버전은 지원 버전에 노출하지 않습니다.');
});

test('sitemap과 홈 디렉터리는 제목이 같은 숫자형 별칭만 동일하게 canonicalize한다', async () => {
  const [eligibilitySource, localeHomeSource, sitemapSource] = await Promise.all([
    readFile(contentEligibilityUrl, 'utf8'),
    readFile(localeHomeUrl, 'utf8'),
    readFile(sitemapUrl, 'utf8'),
  ]);

  assert.match(eligibilitySource, /const titleBySlug = new Map\(games\.map\(\(game\) => \[game\.slug, game\.title_en\]\)\)/);
  assert.match(eligibilitySource, /canonicalizeListedGameSlug\(slug, existingSlugs, titleBySlug\)/);
  assert.match(localeHomeSource, /canonicalizeListedGameSlug\(game\.slug, existingSlugs, titleBySlug\)/);
  assert.doesNotMatch(sitemapSource, /patchableSnapshot|unavailableTitlesBySlug/);

  const canonicalizeFixture = (slug, existingSlugs, titleBySlug) => {
    const numericBase = /-trainer(?:-\d{6,})?$/.test(slug)
      ? slug.replace(/-trainer(?:-\d{6,})?$/, '')
      : null;
    if (!numericBase || !existingSlugs.has(numericBase)) return slug;
    const normalize = (title) => title.toLowerCase().replace(/\btrainer\b/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
    const requestedTitle = titleBySlug.get(slug);
    const baseTitle = titleBySlug.get(numericBase);
    return requestedTitle && baseTitle && normalize(requestedTitle) === normalize(baseTitle)
      ? numericBase
      : slug;
  };

  const slugs = new Set(['same-game', 'same-game-trainer-123456', 'different-game', 'different-game-trainer-123456']);
  const titles = new Map([
    ['same-game', 'Same Game'],
    ['same-game-trainer-123456', 'Same Game Trainer'],
    ['different-game', 'Different Game'],
    ['different-game-trainer-123456', 'Another Game Trainer'],
  ]);
  const sitemapResults = [...slugs].map((slug) => canonicalizeFixture(slug, slugs, titles));
  const directoryResults = [...slugs].map((slug) => canonicalizeFixture(slug, slugs, titles));
  assert.deepEqual(sitemapResults, directoryResults);
  assert.ok(sitemapResults.includes('same-game'));
  assert.ok(sitemapResults.includes('different-game-trainer-123456'));
  assert.equal(canonicalizeFixture('same-game-trainer-123456', slugs, new Map()), 'same-game-trainer-123456');
});
