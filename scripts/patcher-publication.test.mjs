import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

/** 실제 로컬 TypeScript만 평가하고 지정하지 않은 의존성·외부 호출은 허용하지 않습니다. */
async function loadModule(relativePath, dependencies = {}, globals = {}) {
  const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const moduleRecord = { exports: {} };
  vm.runInNewContext(outputText, {
    ...globals, module: moduleRecord, exports: moduleRecord.exports,
    require(specifier) {
      if (Object.hasOwn(dependencies, specifier)) return dependencies[specifier];
      throw new Error(`허용되지 않은 테스트 의존성: ${specifier}`);
    },
  }, { filename: relativePath });
  return moduleRecord.exports;
}

const site = await loadModule('../lib/site.ts', {}, { process: { env: {} } });
const tables = await loadModule('../lib/trainer-option-table.ts');
const { resolvePatcherPublication } = await loadModule('../lib/patcher-publication.ts', {
  './site': site, './trainer-option-table': tables,
});

function trainer(id, option_count = 2) { return { id, version_str: `v${id}`, option_count }; }
function mapping(id, count = 2, overrides = {}) {
  const shortcut = (index) => `${['', 'Ctrl + ', 'Alt + ', 'Shift + ', 'Ctrl + Alt + '][Math.floor(index / 10)]}Num ${index % 10}`;
  return {
    trainer_id: id, language_code: 'ko', is_approved: true, offset_dec: 100,
    original_text: Array.from({ length: count }, (_, i) => `${shortcut(i)} - Original ${i}`).join('\n'),
    translated_text: Array.from({ length: count }, (_, i) => `${shortcut(i)} - 번역 ${i}`).join('\n'),
    ...overrides,
  };
}
function resolve(orderedTrainers, mappingsByTrainer, locale = 'ko') {
  return resolvePatcherPublication({ locale, orderedTrainers, mappingsByTrainer });
}
function freezeDeep(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}

test('최신 정상 표를 선택하고 원본 신원·색인 검증 완료를 주장하지 않는다', () => {
  const result = resolve([trainer(20), trainer(10)], { 20: [mapping(20)], 10: [mapping(10)] });
  assert.equal(result.status, 'available');
  assert.equal(result.publishedTrainer.id, 20);
  assert.equal(result.usesPreviousVersion, false);
  assert.equal(result.optionTable.items.length, 2);
  assert.equal(Object.keys(result).sort().join(','), 'latestDiscoveredTrainer,optionTable,publishedTrainer,status,usesPreviousVersion');
  assert.equal(Object.keys(result.publishedTrainer).sort().join(','), 'id,option_count,version_str');
});

test('최신 30개 중 24개 원문 대체는 거부하고 과거 정상 30개 버전을 정확히 선택한다', () => {
  const latest = mapping(20, 30);
  const source = latest.original_text.split('\n');
  latest.translated_text = latest.translated_text.split('\n').map((line, i) => i < 24 ? source[i] : line).join('\n');
  const result = resolve([trainer(20, 30), trainer(10, 30)], { 20: [latest], 10: [mapping(10, 30)] });
  assert.equal(result.status, 'available');
  assert.equal(result.latestDiscoveredTrainer.id, 20);
  assert.equal(result.publishedTrainer.id, 10);
  assert.equal(result.publishedTrainer.version_str, 'v10');
  assert.equal(result.optionTable.items.length, 30);
  assert.equal(result.usesPreviousVersion, true);
});

test('42개 메타데이터와 35개 표만 있는 모든 버전은 공개 불가다', () => {
  const result = resolve([trainer(20, 42), trainer(10, 42)], { 20: [mapping(20, 35)], 10: [mapping(10, 35)] });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.reason, 'NO_COMPLETE_APPROVED_TRANSLATION');
  assert.equal(result.latestDiscoveredTrainer.id, 20);
});

test('호출자 순서를 보존하고 타 언어 매핑을 섞지 않는다', () => {
  const mappings = { 10: [mapping(10), mapping(10, 2, { language_code: 'ja', translated_text: '손상' })], 99: [mapping(99)] };
  assert.equal(resolve([trainer(10), trainer(99)], mappings).publishedTrainer.id, 10);
  assert.equal(resolve([trainer(10), trainer(99)], mappings, 'ja').status, 'unavailable');
  assert.equal(resolve([trainer(10)], { 10: [mapping(10, 2, { language_code: 'ja' })] }, 'ko').status, 'unavailable');
});

test('미승인·타 ID·손상된 단축키·수량·중복·빈 라벨을 후보에서 거부한다', () => {
  const valid = mapping(20);
  const cases = [
    [mapping(20, 2, { is_approved: false })],
    [mapping(21)],
    [mapping(20, 2, { translated_text: valid.translated_text.replace('Num 1', 'Num 2') })],
    [mapping(20, 1)], [mapping(20, 3)],
    [valid, valid],
    [mapping(20, 2, { translated_text: valid.translated_text.replace('번역 1', '') })],
    [mapping(20, 2, { original_text: 'Num 0 - A\nNum 0 - B', translated_text: 'Num 0 - 가\nNum 0 - 나' })],
    [valid, mapping(20, 1, { offset_dec: 200, is_approved: false })],
    [mapping(20, 2, { translated_text: null })],
    [mapping(20, 2, { original_text: null })],
  ];
  for (const candidate of cases) {
    const result = resolve([trainer(20), trainer(10)], { 20: candidate, 10: [mapping(10)] });
    assert.equal(result.status, 'available');
    assert.equal(result.publishedTrainer.id, 10);
  }
});

test('미확인 수량은 수집 최신에 보존하고 과거 완전본만 게시한다', () => {
  for (const count of [0, null]) {
    const input = [trainer(20, count), trainer(10)];
    const result = resolve(input, { 20: [mapping(20)], 10: [mapping(10)] });
    assert.equal(result.status, 'available');
    assert.equal(result.latestDiscoveredTrainer.id, 20);
    assert.equal(result.latestDiscoveredTrainer.option_count, count);
    assert.equal(result.publishedTrainer.id, 10);
    assert.equal(result.usesPreviousVersion, true);
    assert.equal(input.length, 2);
    assert.equal(input[0].option_count, count);
    const unknownOnly = resolve([trainer(20, count)], { 20: [mapping(20)] });
    assert.equal(unknownOnly.reason, 'NO_COMPLETE_APPROVED_TRANSLATION');
    assert.equal(unknownOnly.latestDiscoveredTrainer.id, 20);
    assert.equal(unknownOnly.latestDiscoveredTrainer.option_count, count);
    const corrected = resolve([trainer(20, 2), trainer(10)], { 20: [mapping(20)], 10: [mapping(10)] });
    assert.equal(corrected.publishedTrainer.id, 20);
    assert.equal(corrected.usesPreviousVersion, false);
  }
});

test('양수 메타데이터 42개와 실제 35개 불일치는 과거 완전본으로 fallback한다', () => {
  const result = resolve([trainer(20, 42), trainer(10)], { 20: [mapping(20, 35)], 10: [mapping(10)] });
  assert.equal(result.status, 'available');
  assert.equal(result.latestDiscoveredTrainer.id, 20);
  assert.equal(result.publishedTrainer.id, 10);
});

test('무효 ID·중복 ID·손상된 옵션 수·빈 버전은 전체 입력을 거부한다', () => {
  for (const bad of [trainer(0), trainer(-1), trainer(1.5), trainer(Number.MAX_SAFE_INTEGER + 1), trainer(20, -1), trainer(20, 1.5), trainer(20, '2'), { ...trainer(20), option_count: undefined }, trainer(20, Number.MAX_SAFE_INTEGER + 1), { ...trainer(20), version_str: '' }, null]) {
    const result = resolve([bad, trainer(10)], { 10: [mapping(10)] });
    assert.equal(result.reason, 'INVALID_TRAINER_INPUT');
    assert.equal(result.latestDiscoveredTrainer, null);
  }
  assert.equal(resolve([trainer(20), trainer(20)], {}).reason, 'INVALID_TRAINER_INPUT');
  for (const count of [0, null]) {
    assert.equal(resolve([trainer(20, count), trainer(0)], {}).reason, 'INVALID_TRAINER_INPUT');
    assert.equal(resolve([trainer(20, count), trainer(20)], {}).reason, 'INVALID_TRAINER_INPUT');
  }
  assert.equal(resolve(null, {}).reason, 'INVALID_TRAINER_INPUT');
});

test('빈 목록과 자체 현지화 범위 밖의 언어를 구분하고 영어 정책을 확장하지 않는다', () => {
  assert.equal(resolve([], {}).reason, 'NO_TRAINERS');
  assert.equal(resolve([trainer(20)], {}, 'fr').reason, 'UNSUPPORTED_LOCALE');
  assert.ok(site.SUPPORTED_LOCALES.includes('en'));
  assert.ok(!site.PUBLIC_LOCALIZATION_LOCALES.includes('en'));
  assert.equal(resolve([trainer(20)], { 20: [mapping(20, 2, { language_code: 'en' })] }, 'en').reason, 'UNSUPPORTED_LOCALE');
  for (const locale of ['ko', 'ja', 'de', 'es']) {
    assert.equal(resolve([trainer(20)], { 20: [mapping(20, 2, { language_code: locale })] }, locale).status, 'available');
  }
});

test('후보 매핑 배열이 없거나 잘못된 형식이면 다음 정상 후보를 선택한다', () => {
  for (const candidate of [undefined, null, {}, 'invalid', 1]) {
    const result = resolve([trainer(20), trainer(10)], { 20: candidate, 10: [mapping(10)] });
    assert.equal(result.status, 'available');
    assert.equal(result.publishedTrainer.id, 10);
    assert.equal(result.usesPreviousVersion, true);
  }
  assert.equal(resolve([trainer(20), trainer(10)], { 10: [mapping(10)] }).publishedTrainer.id, 10);
});

test('동결 입력·오프셋 순서·원래 배열은 바꾸지 않고 선택 메타데이터도 복사한다', () => {
  const first = mapping(10, 1, { offset_dec: 200, original_text: 'Num 1 - Second', translated_text: 'Num 1 - 두 번째' });
  const second = mapping(10, 1);
  const input = freezeDeep({ locale: 'ko', orderedTrainers: [trainer(10)], mappingsByTrainer: { 10: [first, second] } });
  const before = JSON.stringify(input);
  const result = resolvePatcherPublication(input);
  assert.equal(result.status, 'available');
  assert.equal(result.optionTable.items[0].shortcut, 'Num 0');
  assert.equal(JSON.stringify(input), before);
  assert.notEqual(result.publishedTrainer, input.orderedTrainers[0]);
  assert.notEqual(result.latestDiscoveredTrainer, input.orderedTrainers[0]);
  result.publishedTrainer.version_str = '변경한 반환 버전';
  result.publishedTrainer.option_count = 999;
  result.latestDiscoveredTrainer.id = 999;
  assert.equal(JSON.stringify(input), before);
});

