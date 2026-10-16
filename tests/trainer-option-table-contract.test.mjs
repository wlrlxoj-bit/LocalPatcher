import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const { transpileModule, JsxEmit, ModuleKind } = require('typescript');
const { renderToStaticMarkup } = require('react-dom/server');
const React = require('react');
const scope = { latestTrainerId: 42, locale: 'ko', optionCount: 35, indexEligible: true };

// 실제 수집 형식과 같은 전체 블록·개별 슬롯 및 modifier 단축키를 사용합니다.
function option(number, language = 'ko', delimiter = ' - ') {
  const modifiers = ['', 'Ctrl + ', 'Alt + ', 'Shift + '];
  const shortcut = `${modifiers[Math.floor(number / 10)]}Num ${number % 10}`;
  const label = language === 'en' ? `Original option ${number + 1}` : `승인 번역 옵션 ${number + 1}`;
  return `${shortcut}${delimiter}${label}`;
}

function block(count = 35, overrides = {}) {
  return {
    trainer_id: 42, language_code: 'ko', is_approved: true, offset_dec: 100,
    original_text: Array.from({ length: count }, (_, number) => option(number, 'en')).join('\r\n'),
    translated_text: Array.from({ length: count }, (_, number) => option(number)).join('\n'),
    ...overrides,
  };
}

async function parse(mappings, overrides = {}) {
  const script = `import { getTrainerOptionTable } from './lib/trainer-option-table.ts'; console.log(JSON.stringify(getTrainerOptionTable(${JSON.stringify({ ...scope, mappings, ...overrides })})));`;
  const { stdout } = await execFileAsync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', script], {
    cwd: new URL('..', import.meta.url),
  });
  return JSON.parse(stdout);
}

async function tableComponent() {
  const source = await readFile(new URL('../components/PatcherOptionTable.tsx', import.meta.url), 'utf8');
  const { outputText } = transpileModule(source, { compilerOptions: { jsx: JsxEmit.ReactJSX, module: ModuleKind.CommonJS } });
  const exports = {};
  new Function('require', 'exports', outputText)(require, exports);
  return exports.default;
}

test('35개 전체 블록과 22개 개별 슬롯은 마지막 옵션까지 반환한다', async () => {
  const elden = await parse([block()]);
  assert.equal(elden.items.length, 35);
  assert.deepEqual(elden.items[34], { shortcut: 'Shift + Num 4', label: '승인 번역 옵션 35' });

  const slots = Array.from({ length: 22 }, (_, number) => block(1, {
    offset_dec: 100 + number * 10,
    original_text: option(number, 'en'), translated_text: option(number),
  })).reverse();
  const divinity = await parse(slots, { optionCount: 22 });
  assert.equal(divinity.items.length, 22);
  assert.equal(divinity.items[0].label, '승인 번역 옵션 1');
  assert.equal(divinity.items[21].label, '승인 번역 옵션 22');
});

test('블록·슬롯 혼합과 안내 문장은 정확한 승인 옵션 수를 유지한다', async () => {
  const result = await parse([
    block(34),
    block(1, { offset_dec: 500, original_text: option(34, 'en'), translated_text: option(34) }),
    block(1, { offset_dec: 600, original_text: 'Trainer instructions', translated_text: '트레이너 사용 안내' }),
  ]);
  assert.equal(result.items.length, 35);
});

test('최신 ID·언어·승인·색인 자격이 다르면 전체 표를 숨긴다', async () => {
  for (const overrides of [{ trainer_id: 41 }, { language_code: 'ja' }, { is_approved: false }, { is_approved: undefined }]) {
    assert.equal(await parse([block(35, overrides)]), null);
  }
  for (const overrides of [{ indexEligible: false }, { locale: 'en' }, { latestTrainerId: 0 }, { optionCount: 0 }]) {
    assert.equal(await parse([block()], overrides), null);
  }
  assert.equal(await parse([block(), block(1, { offset_dec: 500, trainer_id: 41 })]), null);
});

test('누락·과잉·중복 단축키·중복 또는 손상된 오프셋은 부분 표를 만들지 않는다', async () => {
  assert.equal(await parse([block(34)]), null);
  assert.equal(await parse([block(36)]), null);
  assert.equal(await parse([block(), block(1)]), null);
  assert.equal(await parse([block(), block(1, { offset_dec: 500 })], { optionCount: 36 }), null);
  for (const offset_dec of [undefined, -1, 1.5]) {
    assert.equal(await parse([block(35, { offset_dec })]), null);
  }
  const duplicate = block();
  duplicate.original_text += `\n${option(0, 'en')}`;
  duplicate.translated_text += `\n${option(0)}`;
  assert.equal(await parse([duplicate], { optionCount: 36 }), null);
});

test('손상된 라벨·단축키 불일치·영문 원문 대체를 승인 번역으로 표시하지 않는다', async () => {
  for (const translated_text of [
    block().translated_text.replace('Shift + Num 4', 'Shift + Num 5'),
    block().translated_text.replace('승인 번역 옵션 35', ''),
    block().translated_text.replace('승인 번역 옵션 35', 'x'.repeat(181)),
    block().translated_text.replace('승인 번역 옵션 35', '\ufffd'),
    block().translated_text.replace('승인 번역 옵션 35', '  ORIGINAL   OPTION 35 '),
    block().original_text,
    `${block().translated_text}\nNum 9 -`,
  ]) {
    assert.equal(await parse([block(35, { translated_text })]), null);
  }
  assert.equal(await parse([block(35, { original_text: block().original_text.replace('Original option 35', '') })]), null);
});

test('승인 검증기에서 사용하는 특수 Num·방향·함수 키와 구분자를 처리한다', async () => {
  const shortcuts = ['Num *', 'Num +', 'Num -', 'NumPad Decimal', 'Ctrl + F24', 'ArrowUp', 'BracketLeft'];
  const original_text = shortcuts.map((shortcut, index) => `${shortcut} : Original ${index}`).join('\n');
  const translated_text = shortcuts.map((shortcut, index) => `${shortcut} → 번역 ${index}`).join('\n');
  const result = await parse([block(7, { original_text, translated_text })], { optionCount: 7 });
  assert.equal(result.items.length, 7);
  assert.deepEqual(result.items.map((item) => item.shortcut), shortcuts);
});

test('전체 35·22개 행은 JavaScript 이벤트 없이 초기 details HTML에 존재한다', async () => {
  const Component = await tableComponent();
  for (const count of [35, 22]) {
    const table = await parse([block(count)], { optionCount: count });
    const html = renderToStaticMarkup(React.createElement(Component, { locale: 'ko', table }));
    assert.match(html, /<details open=""/);
    assert.match(html, /<summary/);
    assert.equal((html.match(/scope="row"/g) || []).length, count);
    assert.ok(html.includes(`승인 번역 옵션 ${count}`));
    assert.doesNotMatch(html, /Original option|onclick|<script/);
  }
  assert.equal(renderToStaticMarkup(React.createElement(Component, { locale: 'ko', table: null })), '');
});

test('서버 페이지는 기존 10개 요약을 유지하고 최신 매핑만 전체 표 슬롯으로 보낸다', async () => {
  const [page, unique, component] = await Promise.all([
    readFile(new URL('../app/[locale]/patcher/[game_slug]/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/PatcherUniqueContent.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/PatcherOptionTable.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(page, /getTrainerOptionSummary\(mappingsMap\[latestTrainer\.id\] \|\| \[\]\)/);
  assert.match(page, /getTrainerOptionTable\(\{[\s\S]*?latestTrainerId: latestTrainer\.id,[\s\S]*?locale: currentLocale,[\s\S]*?indexEligible,[\s\S]*?mappings: mappingsMap\[latestTrainer\.id\] \|\| \[\]/);
  assert.match(page, /optionTable=\{optionTable\}/);
  assert.match(page, /translatedOptionCount = optionTable\?\.items\.length \?\? 0/);
  assert.doesNotMatch(page, /hasApprovedLatestMapping/);
  assert.match(unique, /<PatcherOptionTable locale=\{locale\} table=\{optionTable\}/);
  assert.doesNotMatch(component, /use client|useState|onClick|dangerouslySetInnerHTML/);
});
