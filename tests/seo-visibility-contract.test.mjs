import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const eligibilityUrl = new URL('../lib/content-eligibility.ts', import.meta.url);
const sitemapUrl = new URL('../app/sitemap.ts', import.meta.url);
const patcherPageUrl = new URL('../app/[locale]/patcher/[game_slug]/page.tsx', import.meta.url);
const localeHomeUrl = new URL('../app/[locale]/page.tsx', import.meta.url);
const directoryUrl = new URL('../components/PatcherLinkDirectory.tsx', import.meta.url);
const patcherClientUrl = new URL('../components/PatcherClient.tsx', import.meta.url);
const headerUrl = new URL('../layouts/Header.tsx', import.meta.url);
const localeLayoutUrl = new URL('../app/[locale]/layout.tsx', import.meta.url);
const siteUrl = new URL('../lib/site.ts', import.meta.url);

async function loadEligibilityFunctions() {
  const source = await readFile(eligibilityUrl, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    console,
    require(name) {
      if (name === 'react') return { cache: fn => fn };
      if (name === '@/lib/supabase') return {
        sortTrainersLatestFirst: rows => [...rows].sort((left, right) =>
          right.version_str.localeCompare(left.version_str, undefined, { numeric: true }) || right.id - left.id
        ),
        supabase: null,
      };
      if (name === '@/lib/game-slug-aliases') return { canonicalizeListedGameSlug: slug => slug };
      if (name === '@/lib/site') return { PUBLIC_LOCALIZATION_LOCALES: ['ko', 'ja', 'de', 'es'] };
      throw new Error(`unexpected module: ${name}`);
    },
  });
  return exports;
}

async function loadPatcherClientFunctions() {
  const source = await readFile(patcherClientUrl, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  const emptyComponent = () => null;
  vm.runInNewContext(compiled, {
    exports,
    require(name) {
      if (name === 'react') return { default: {}, useState: () => [], useEffect() {}, useRef: () => ({ current: null }) };
      if (name === 'react/jsx-runtime') return { jsx: emptyComponent, jsxs: emptyComponent };
      if (name === 'next/link' || name === 'next/image' || name.startsWith('@/components/')) return { default: emptyComponent };
      if (name === 'lucide-react') return {};
      if (name === '@/lib/i18n') return { getCommonDict: () => ({}), getPatcherDict: () => ({}), getGameTitle: () => '' };
      if (name === '@/lib/analytics') return { trackAnalyticsEvent() {} };
      if (name === '@/lib/supabase') return {};
      throw new Error(`unexpected module: ${name}`);
    },
  });
  return exports;
}

test('색인 자격은 4개 자동 현지화 언어의 최신 승인·완전 번역만 허용한다', async () => {
  const source = await readFile(eligibilityUrl, 'utf8');
  assert.match(source, /AUTO_LOCALIZATION_LOCALES = PUBLIC_LOCALIZATION_LOCALES/);
  assert.match(source, /sortTrainersLatestFirst/);
  assert.match(source, /original_text,translated_text,is_approved/);
  assert.match(source, /rows\.every\(\(row\) => row\.is_approved/);
  assert.match(source, /OPTION_KEY_PATTERN/);
  assert.match(source, /translation_validation\.py의 OPTION_RE/);
  assert.match(source, /optionLabels\.length >= optionCount/);
  assert.match(source, /original_text\.trim\(\)\.length > 0/);
  assert.match(source, /translated_text\.trim\(\)\.length > 0/);
  assert.match(source, /if \(!isAutoLocalizationLocale\(locale\) \|\| !supabase\) return false/);
  assert.match(source, /빈 목록으로 처리합니다/);
  assert.doesNotMatch(source, /readStaleCache|snapshot/i);
});

test('색인 자격 옵션 판정은 번역 검증기와 같은 단축키 형식을 세고 잘못된 줄은 거절한다', async () => {
  const { getLatestPatcherTrainer, hasCompleteApprovedMappings } = await loadEligibilityFunctions();
  const approvedRow = original_text => ({
    trainer_id: 1,
    original_text,
    translated_text: '검증된 번역문',
    is_approved: true,
  });

  assert.equal(hasCompleteApprovedMappings([approvedRow([
    'Num 1 : Infinite Health',
    'Ctrl + Num 2 - Edit Gold',
    'Alt+Num . – Freeze Daytime',
    'Shift + Num + → Set Fly Height',
    'NumPad Decimal: Damage Multiplier',
  ].join('\n'))], 5), true);
  assert.equal(hasCompleteApprovedMappings([approvedRow([
    'Edit Player Stats',
    'Version 1 - not an option',
    'Num 1 :',
    'Num 2 = unsupported separator',
  ].join('\n'))], 1), false);
  assert.equal(hasCompleteApprovedMappings([{
    ...approvedRow('Num 1 - Infinite Health'),
    is_approved: false,
  }], 1), false);
  assert.equal(hasCompleteApprovedMappings([approvedRow('Ctrl+Num 1 - Infinite Health')], 2), false);

  const eldenRing = { id: 10, slug: 'elden-ring' };
  const eldenRingSource = { id: 11, slug: 'elden-ring-shadow-of-the-erdtree-trainer-1768067282' };
  const mergedLatest = getLatestPatcherTrainer(eldenRing, [eldenRing, eldenRingSource], [
    { id: 100, game_id: 10, option_count: 1, version_str: 'v1.16.0' },
    { id: 101, game_id: 11, option_count: 2, version_str: 'v1.16.1' },
  ]);
  assert.equal(mergedLatest.id, 101, '엘든 링은 화면과 sitemap 모두 source의 더 최신 트레이너를 기준으로 삼아야 합니다.');
  assert.equal(hasCompleteApprovedMappings([approvedRow('Num 1 - HP\nNum 2 - FP')], mergedLatest.option_count), true);
  assert.equal(hasCompleteApprovedMappings([approvedRow('Num 1 - HP')], mergedLatest.option_count), false,
    '병합된 최신 source 트레이너의 번역이 불완전하면 canonical 엘든 링도 noindex여야 합니다.');
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

test('비자격 패처는 구조화 데이터와 제3자 광고를 내보내지 않는다', async () => {
  const source = await readFile(patcherPageUrl, 'utf8');
  assert.match(source, /const indexEligible = await isPatcherIndexEligible\(game\.id, currentLocale\)/);
  assert.match(source, /\{indexEligible && \(\s*<script\s+type="application\/ld\+json"/s);
  assert.match(source, /\{indexEligible && <AdsterraBanner locale=\{currentLocale as Locale\} \/>\}/);
  assert.match(source, /showAds=\{indexEligible\}/);
});

test('대기 패처는 광고 네트워크를 렌더하지 않고 자격 페이지는 광고를 유지한다', async () => {
  const [clientSource, { shouldRenderPatcherAds }] = await Promise.all([
    readFile(patcherClientUrl, 'utf8'),
    loadPatcherClientFunctions(),
  ]);
  assert.equal(shouldRenderPatcherAds(false), false, '번역 대기/미승인 페이지는 광고를 렌더하지 않습니다.');
  assert.equal(shouldRenderPatcherAds(true), true, '승인된 색인 대상 페이지는 광고 배치를 유지합니다.');
  assert.equal((clientSource.match(/shouldRenderPatcherAds\(showAds\) && <AdSenseUnit/g) || []).length, 4,
    '모든 AdSense 배치는 같은 서버 자격 값으로 감싸야 합니다.');
  assert.equal((clientSource.match(/shouldRenderPatcherAds\(showAds\) && <PartnerStoreWidget/g) || []).length, 2,
    '대기·미승인 페이지는 제휴 상점 위젯과 그 가격 API 호출도 만들지 않습니다.');
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
