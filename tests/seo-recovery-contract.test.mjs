import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = process.cwd();
const read = (file) => readFile(path.join(root, file), 'utf8');

/** 외부 패키지 없이 Node 내장 타입 스트리핑으로 trainer-option-table을 직접 실행합니다. */
async function runOptionTable(input) {
  const script = `import { getTrainerOptionTable } from './lib/trainer-option-table.ts'; console.log(JSON.stringify(getTrainerOptionTable(${JSON.stringify(input)})));`;
  const { stdout } = await execFileAsync(
    process.execPath,
    ['--experimental-strip-types', '--input-type=module', '-e', script],
    { cwd: root },
  );
  return JSON.parse(stdout);
}

/** patcher.ts 사전에서 특정 로케일 블록 텍스트를 추출합니다. */
function extractLocaleBlock(dictSource, locale, nextLocale) {
  const startMarker = `  "${locale}": {`;
  const startIdx = dictSource.indexOf(startMarker);
  assert.notEqual(startIdx, -1, `${locale} 로케일 블록을 찾을 수 없습니다.`);
  const endIdx = nextLocale
    ? dictSource.indexOf(`  "${nextLocale}": {`, startIdx)
    : dictSource.length;
  assert.notEqual(endIdx, -1, `${nextLocale} 경계를 찾을 수 없습니다.`);
  return dictSource.slice(startIdx, endIdx);
}

test('1. content-eligibility는 원문과 번역문 모두에서 실제 옵션 수를 검증한다', async () => {
  const source = await read('lib/content-eligibility.ts');

  assert.match(source, /const originalOptionLabels = rows\.flatMap\(/);
  assert.match(source, /const translatedOptionLabels = rows\.flatMap\(/);
  assert.match(source, /row\.original_text!\.match\(OPTION_LABEL_PATTERN\)/);
  assert.match(source, /row\.translated_text!\.match\(OPTION_LABEL_PATTERN\)/);
  assert.match(
    source,
    /return originalOptionLabels\.length >= optionCount && translatedOptionLabels\.length >= optionCount;/,
  );
});

test('2. trainer-option-table은 고유명사 1건 일치로 전체 표를 버리지 않고 과반 번역 기준을 적용한다', async () => {
  const source = await read('lib/trainer-option-table.ts');

  assert.doesNotMatch(
    source,
    /shortcuts\.has\(shortcut\)\s*\|\|\s*normalizeLabel\(source\.label\) === normalizeLabel\(item\.label\)\)\s*return null/,
    '단일 옵션 라벨 일치만으로 전체 SSR 옵션 표를 null로 탈락시키면 안 됩니다.',
  );
  assert.match(source, /let translatedLabelCount = 0;/);
  assert.match(source, /if \(normalizeLabel\(source\.label\) !== normalizeLabel\(item\.label\)\)/);
  assert.match(source, /if \(items\.length !== optionCount\) return null;/);
  assert.match(source, /if \(translatedLabelCount < Math\.ceil\(items\.length \* 0\.5\)\) return null;/);
  // 단축키·중복·오프셋 무결성 계약 유지
  assert.match(source, /shortcut !== normalizeShortcut\(source\.shortcut\) \|\| shortcuts\.has\(shortcut\)/);

  // 실제 런타임 검증: HP/XP/God Mode 등 소수 고유명사가 원문과 같아도 과반 번역이면 표를 반환해야 합니다.
  const withProperNouns = await runOptionTable({
    latestTrainerId: 42,
    locale: 'ko',
    optionCount: 4,
    indexEligible: true,
    mappings: [{
      trainer_id: 42,
      language_code: 'ko',
      is_approved: true,
      offset_dec: 100,
      original_text: 'Num 1 - Max HP\nNum 2 - Infinite Stamina\nNum 3 - One Hit Kill\nNum 4 - Max XP',
      translated_text: 'Num 1 - Max HP\nNum 2 - 무한 스태미나\nNum 3 - 일격 처치\nNum 4 - Max XP',
    }],
  });
  assert.equal(withProperNouns?.items.length, 4, '고유명사 2건(50% 번역)은 전체 옵션 표를 유지해야 합니다.');

  // 과반 미만(4개 중 1개만 번역) 또는 안내만 번역한 매핑은 여전히 null이어야 합니다.
  const mostlyEnglish = await runOptionTable({
    latestTrainerId: 42,
    locale: 'ko',
    optionCount: 4,
    indexEligible: true,
    mappings: [{
      trainer_id: 42,
      language_code: 'ko',
      is_approved: true,
      offset_dec: 100,
      original_text: 'Num 1 - Max HP\nNum 2 - Infinite Stamina\nNum 3 - One Hit Kill\nNum 4 - Max XP',
      translated_text: 'Num 1 - Max HP\nNum 2 - Infinite Stamina\nNum 3 - One Hit Kill\nNum 4 - 최대 경험치',
    }],
  });
  assert.equal(mostlyEnglish, null, '과반 미만 번역(1/4)은 null로 거부해야 합니다.');

  const noteOnlyTranslated = await runOptionTable({
    latestTrainerId: 42,
    locale: 'ko',
    optionCount: 4,
    indexEligible: true,
    mappings: [{
      trainer_id: 42,
      language_code: 'ko',
      is_approved: true,
      offset_dec: 100,
      original_text: 'Num 1 - Max HP\nNum 2 - Infinite Stamina\nNum 3 - One Hit Kill\nNum 4 - Max XP',
      translated_text: 'Num 1 - Max HP\nNum 2 - Infinite Stamina\nNum 3 - One Hit Kill\nNum 4 - Max XP** 안내만 번역',
    }],
  });
  assert.equal(noteOnlyTranslated, null, '안내만 번역하고 옵션 라벨은 모두 원문인 경우 null이어야 합니다.');
});

test('3. 사전 오타가 제거되고 4개 현지화 언어의 메타데이터·JSON-LD가 검색 의도에 맞게 현지화되었다', async () => {
  const [patcherDict, gamesDict, pageSource] = await Promise.all([
    read('lib/i18n/dictionaries/patcher.ts'),
    read('lib/i18n/dictionaries/games.ts'),
    read('app/[locale]/patcher/[game_slug]/page.tsx'),
  ]);

  // 오타 및 한·일 혼입 제거 확인
  assert.doesNotMatch(patcherDict, /me安全使用ガイド/);
  assert.match(patcherDict, /トレーナー日本語化・安全使用ガイド/);
  assert.doesNotMatch(gamesDict, /単純為替レート를 反映した/);
  assert.match(gamesDict, /単純為替レートを反映した/);

  // 4개 현지화 언어별 블록 검증
  const blocks = {
    ko: extractLocaleBlock(patcherDict, 'ko', 'en'),
    ja: extractLocaleBlock(patcherDict, 'ja', 'de'),
    de: extractLocaleBlock(patcherDict, 'de', 'es'),
    es: extractLocaleBlock(patcherDict, 'es', null),
  };

  for (const [locale, block] of Object.entries(blocks)) {
    const approvedTitle = block.match(/"metaTitleApproved":\s*"([^"]+)"/)?.[1];
    const unapprovedTitle = block.match(/"metaTitleUnapproved":\s*"([^"]+)"/)?.[1];
    const approvedDesc = block.match(/"metaDescApproved":\s*"([^"]+)"/)?.[1];
    const jsonLdDesc = block.match(/"jsonLdDescription":\s*"([^"]+)"/)?.[1];

    assert.ok(approvedTitle, `${locale} metaTitleApproved 누락`);
    assert.ok(unapprovedTitle, `${locale} metaTitleUnapproved 누락`);
    assert.notEqual(approvedTitle, unapprovedTitle, `${locale} 승인/미승인 제목이 분리되어야 합니다.`);
    assert.ok(approvedTitle.includes('{optionBadge}'), `${locale} 승인 제목에 {optionBadge}가 필요합니다.`);
    assert.ok(approvedDesc?.includes('{latestVersion}'), `${locale} 승인 설명에 {latestVersion}이 필요합니다.`);
    assert.ok(approvedDesc?.includes('{optionCount}'), `${locale} 승인 설명에 {optionCount}가 필요합니다.`);
    assert.ok(!approvedDesc?.includes('{versionsStr}'), `${locale} 승인 설명에 전체 버전 나열({versionsStr})이 남으면 안 됩니다.`);
    assert.ok(jsonLdDesc, `${locale} jsonLdDescription 누락`);
    assert.doesNotMatch(
      jsonLdDesc,
      /Original English trainer version/i,
      `${locale} jsonLdDescription에 영문 보일러플레이트가 남으면 안 됩니다.`,
    );
  }

  // page.tsx 메타데이터 및 JSON-LD 계약 검증
  assert.match(pageSource, /alternateLanguages\['x-default'\] = alternateLanguages\.ko/);
  assert.match(pageSource, /const firstAlternateUrl = Object\.values\(alternateLanguages\)\[0\]/);
  assert.match(pageSource, /const optionBadge = latestOptionCount > 0/);
  assert.doesNotMatch(pageSource, /\n\s*keywords,\n/, '스팸성 keywords 메타 필드를 반환하면 안 됩니다.');
  assert.match(pageSource, /siteName:\s*'LocalPatcher'/);
  assert.match(pageSource, /locale:\s*ogLocaleMap\[currentLocale as Locale\]/);
  assert.match(pageSource, /'inLanguage':\s*currentLocale/);
  assert.match(pageSource, /'url':\s*canonicalUrl/);
  assert.match(pageSource, /\.replaceAll\('\{gameTitle\}',\s*localizedGameTitle\)/);
  assert.match(pageSource, /\.replaceAll\('\{gameTitleKo\}',\s*game\.title_ko \|\| game\.title_en\)/);
  assert.match(pageSource, /\.replaceAll\('\{gameTitleEn\}',\s*game\.title_en\)/);
});

test('4. 모바일 퍼스트 색인을 위해 시작 가이드·빌드 목록을 숨기지 않고 하드코딩 영어를 현지화한다', async () => {
  const [clientSource, uniqueContentSource] = await Promise.all([
    read('components/PatcherClient.tsx'),
    read('components/PatcherUniqueContent.tsx'),
  ]);

  // PatcherClient: h1 구조 보존 및 하드코딩 Original Game 제거
  assert.match(clientSource, /<h1 className="text-xl md:text-2xl font-bold text-white font-outfit">\{displayTitle\}<\/h1>/);
  assert.doesNotMatch(clientSource, /Original Game:\s*\{game\.title_en\}/);
  assert.match(clientSource, /ko:\s*'영문 원제'/);
  assert.match(clientSource, /ja:\s*'原題'/);
  assert.match(clientSource, /de:\s*'Originaltitel'/);
  assert.match(clientSource, /es:\s*'Título original'/);

  // 시작 가이드 및 지원 빌드 목록에서 hidden md:block 제거, DropZone만 유지
  assert.doesNotMatch(
    clientSource,
    /<section aria-labelledby="patcher-start-guide-title"[^>]*hidden md:block/,
    '모바일에서 3단계 시작 가이드가 display:none 되면 안 됩니다.',
  );
  assert.doesNotMatch(
    clientSource,
    /\{\/\* Supported Trainer Builds \*\/\}\s*<div className="[^"]*hidden md:block/,
    '모바일에서 지원 트레이너 빌드 목록이 display:none 되면 안 됩니다.',
  );
  assert.match(
    clientSource,
    /<div className="hidden md:block">\s*<DropZone\b/,
    'PC 전용 DropZone만 hidden md:block을 유지해야 합니다.',
  );
  assert.doesNotMatch(clientSource, /<h5\b/, '헤딩 계층이 h5로 건너뛰면 안 됩니다.');

  // PatcherUniqueContent: 하드코딩 English title 제거 + 장르/태그 현지화
  assert.doesNotMatch(uniqueContentSource, /English title:\s*\{gameTitleEn\}/);
  assert.match(uniqueContentSource, /import \{ translateGenre \} from '@\/lib\/i18n\/genres'/);
  assert.match(uniqueContentSource, /translateGenre\(category,\s*locale\)/);
  assert.match(uniqueContentSource, /englishTitle:\s*'영문 원제'/);
  assert.match(uniqueContentSource, /englishTitle:\s*'原題'/);
  assert.match(uniqueContentSource, /englishTitle:\s*'Originaltitel'/);
  assert.match(uniqueContentSource, /englishTitle:\s*'Título original'/);
});

test('5. sitemap은 최신순 정렬, 정적 우선순위 분리, hreflang alternates(x-default 포함)를 제공한다', async () => {
  const source = await read('app/sitemap.ts');

  // 기존 seo-contract 필수 패턴 보존
  assert.match(source, /const locales = AUTO_LOCALIZATION_LOCALES;/);
  assert.match(source, /getPatcherSitemapSnapshotEntries\(locales\)/);
  assert.match(source, /for \(const entry of snapshotEntries\)/);
  assert.match(source, /url:\s*`\$\{SITE_URL\}\/\$\{entry\.locale\}\/patcher\/\$\{entry\.slug\}`/);
  assert.match(source, /lastModified:\s*entry\.contentUpdatedAt/);

  // 크롤 버짓 최적화 및 hreflang alternates
  assert.match(source, /snapshotEntries\.sort\(/);
  assert.match(source, /changeFrequency:\s*path === '' \? 'daily' : 'monthly'/);
  assert.match(source, /priority:\s*path === '' \? 1\.0 : \(path === '\/guides' \|\| path === '\/faq'\) \? 0\.6 : 0\.3/);
  assert.match(source, /patcherAlternatesBySlug/);
  assert.match(source, /languages\['x-default'\]\s*=\s*defaultUrl/);
  assert.match(source, /alternates:\s*\{\s*languages\s*\}/);
});
