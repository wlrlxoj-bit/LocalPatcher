import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const eligibilityUrl = new URL('../lib/content-eligibility.ts', import.meta.url);
const sitemapUrl = new URL('../app/sitemap.ts', import.meta.url);
const patcherPageUrl = new URL('../app/[locale]/patcher/[game_slug]/page.tsx', import.meta.url);
const localeHomeUrl = new URL('../app/[locale]/page.tsx', import.meta.url);
const directoryUrl = new URL('../components/PatcherLinkDirectory.tsx', import.meta.url);
const headerUrl = new URL('../layouts/Header.tsx', import.meta.url);
const localeLayoutUrl = new URL('../app/[locale]/layout.tsx', import.meta.url);
const siteUrl = new URL('../lib/site.ts', import.meta.url);

test('색인 자격은 4개 자동 현지화 언어의 최신 승인·완전 번역만 허용한다', async () => {
  const source = await readFile(eligibilityUrl, 'utf8');
  assert.match(source, /AUTO_LOCALIZATION_LOCALES = PUBLIC_LOCALIZATION_LOCALES/);
  assert.match(source, /sortTrainersLatestFirst/);
  assert.match(source, /original_text,translated_text,is_approved/);
  assert.match(source, /rows\.every\(\(row\) => row\.is_approved/);
  assert.match(source, /optionLabels\.length >= optionCount/);
  assert.match(source, /original_text\.trim\(\)\.length > 0/);
  assert.match(source, /translated_text\.trim\(\)\.length > 0/);
  assert.match(source, /if \(!isAutoLocalizationLocale\(locale\) \|\| !supabase\) return false/);
  assert.match(source, /빈 목록으로 처리합니다/);
  assert.doesNotMatch(source, /readStaleCache|snapshot/i);
});

test('사이트맵은 영문과 snapshot 재방출을 제외하고 자격 있는 동적 페이지만 담는다', async () => {
  const source = await readFile(sitemapUrl, 'utf8');
  assert.match(source, /const locales = AUTO_LOCALIZATION_LOCALES/);
  assert.match(source, /getEligiblePatcherSlugs\(locale\)/);
  assert.match(source, /빈 목록으로 처리합니다/);
  assert.doesNotMatch(source, /patchableSnapshot|locales\.en|last-known-good/);
});

test('패처 metadata·정적 생성·hreflang은 언어별 승인 자격을 확인한다', async () => {
  const source = await readFile(patcherPageUrl, 'utf8');
  assert.match(source, /AUTO_LOCALIZATION_LOCALES\.map/);
  assert.match(source, /getEligiblePatcherSlugs\(locale\)/);
  assert.match(source, /const indexEligible = await isPatcherIndexEligible\(game\.id, currentLocale\)/);
  assert.match(source, /const hasApprovedTranslation = indexEligible/);
  assert.match(source, /const eligibleLocales = await Promise\.all\(AUTO_LOCALIZATION_LOCALES\.map/);
  assert.doesNotMatch(source, /en: `\/en\/patcher\/\$\{canonicalSlug\}`/);
  assert.match(source, /alternateLanguages\['x-default'\] = alternateLanguages\.ko/);
  assert.match(source, /robots: indexEligible \? \{ index: true, follow: true \} : \{ index: false, follow: true \}/);
});

test('홈과 전용 디렉터리는 자격 없는 게임·영문 링크를 만들지 않는다', async () => {
  const [home, directory] = await Promise.all([
    readFile(localeHomeUrl, 'utf8'),
    readFile(directoryUrl, 'utf8'),
  ]);
  assert.match(home, /const eligibleSlugs = new Set\(await getEligiblePatcherSlugs\(locale\)\)/);
  assert.match(home, /const eligibleGamesData = directoryCandidates\.filter/);
  assert.match(directory, /if \(!isAutoLocalizationLocale\(locale\)\) return null/);
});

test('전역 언어 선택과 루트 hreflang도 4개 공개 언어만 사용한다', async () => {
  const [header, localeLayout] = await Promise.all([
    readFile(headerUrl, 'utf8'),
    readFile(localeLayoutUrl, 'utf8'),
  ]);
  assert.match(header, /PUBLIC_LOCALIZATION_LOCALES\.map/);
  assert.doesNotMatch(header, /SUPPORTED_LOCALES\.map/);
  assert.match(localeLayout, /PUBLIC_LOCALIZATION_LOCALES\.map\(\(locale\) => \(\{ locale \}\)\)/);
  assert.doesNotMatch(localeLayout, /'en': '\/en'/);
  assert.match(localeLayout, /'x-default': '\/ko'/);
});

test('정적 페이지의 localizedAlternates도 영문을 내보내지 않고 한국어를 기본값으로 둔다', async () => {
  const source = await readFile(siteUrl, 'utf8');
  assert.match(source, /PUBLIC_LOCALIZATION_LOCALES = \['ko', 'ja', 'de', 'es'\]/);
  assert.doesNotMatch(source, /en: `\$\{SITE_URL\}\/en/);
  assert.match(source, /'x-default': `\$\{SITE_URL\}\/ko\$\{normalizedPath\}`/);
});
