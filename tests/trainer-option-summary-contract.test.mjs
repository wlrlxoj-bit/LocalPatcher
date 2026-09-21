import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { promisify } from 'node:util';

const summaryUrl = new URL('../lib/trainer-option-summary.ts', import.meta.url);
const componentUrl = new URL('../components/PatcherOptionSummary.tsx', import.meta.url);
const pageUrl = new URL('../app/[locale]/patcher/[game_slug]/page.tsx', import.meta.url);
const execFileAsync = promisify(execFile);

async function runParserFixture(rows, expected) {
  const fixture = JSON.stringify(rows);
  const assertion = JSON.stringify(expected);
  const script = [
    "import { getTrainerOptionSummary } from './lib/trainer-option-summary.ts';",
    `const result = getTrainerOptionSummary(${fixture});`,
    `const expected = ${assertion};`,
    "if (expected === null ? result !== null : JSON.stringify(result?.items) !== JSON.stringify(expected)) { console.log(JSON.stringify(result)); process.exit(1); }",
  ].join(' ');
  await execFileAsync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', script], {
    cwd: new URL('..', import.meta.url),
  });
}

test('옵션 요약은 원문·번역의 동일 단축키와 최소 6개 검증을 모두 요구한다', async () => {
  const source = await readFile(summaryUrl, 'utf8');

  assert.match(source, /const MINIMUM_SUMMARY_OPTIONS = 6/);
  assert.match(source, /const MAXIMUM_SUMMARY_OPTIONS = 10/);
  assert.match(source, /sourceOptions\.length !== translatedOptions\.length/);
  assert.match(source, /normalizeShortcut\(source\.shortcut\) !== normalizeShortcut\(translated\.shortcut\)/);
  assert.match(source, /for \(const \[index, translated\] of translatedOptions\.entries\(\)\)/);
  assert.match(source, /return translatedOptions\.slice\(0, MAXIMUM_SUMMARY_OPTIONS\)/);
  assert.match(source, /hasSameShortcutSequence\(sourceOptions, sourceKeys\)/);
  assert.match(source, /hasSameShortcutSequence\(translatedOptions, translatedKeys\)/);
  assert.match(source, /여러 매핑을 합치지 않아/);
});

test('개별 옵션 슬롯은 최신 trainer·locale의 승인 행만 offset 순서로 안전하게 묶는다', async () => {
  const source = await readFile(summaryUrl, 'utf8');

  assert.match(source, /function getVerifiedSingleOption/);
  assert.match(source, /sourceOptions\.length !== 1 \|\| translatedOptions\.length !== 1/);
  assert.match(source, /function getVerifiedSlotOptions/);
  assert.match(source, /Number\.isSafeInteger\(mapping\.offset_dec\)/);
  assert.match(source, /offset_dec as number\) - \(right\.mapping\.offset_dec as number\)/);
  assert.match(source, /if \(offsets\.has\(offset\)\) return \{ items: null, unsafe: true \}/);
  assert.match(source, /if \(shortcuts\.has\(shortcut\)\) return \{ items: null, unsafe: true \}/);
  assert.match(source, /if \(slotResult\.unsafe\) return null/);
  assert.match(source, /const slotResult = getVerifiedSlotOptions\(mappings\)/);
});

test('개별 슬롯은 역순 offset을 정렬하고, 손상된 중복 행은 fail-closed 처리한다', async () => {
  const validReverseRows = [6, 2, 1, 5, 3, 4].map((number) => ({
    offset_dec: number * 10,
    original_text: `Num ${number} - Original ${number}`,
    translated_text: `Num ${number} - 번역 ${number}`,
  }));
  await runParserFixture(validReverseRows, [1, 2, 3, 4, 5, 6].map((number) => ({
    shortcut: `Num ${number}`,
    label: `번역 ${number}`,
  })));

  await runParserFixture([
    ...validReverseRows,
    { offset_dec: 10, original_text: '잘못된 행', translated_text: '손상된 행' },
  ], null);
  await runParserFixture([
    ...validReverseRows,
    { offset_dec: 70, original_text: 'Num 1 - Duplicate source', translated_text: 'Num 1 -' },
  ], null);
  await runParserFixture([
    {
      offset_dec: 5,
      original_text: [1, 2, 3, 4, 5, 6].map((number) => `Num ${number} - Original ${number}`).join('\n'),
      translated_text: [1, 2, 3, 4, 5, 6].map((number) => `Num ${number} - 번역 ${number}`).join('\n'),
    },
    { offset_dec: 70, original_text: 'Num 1 - Duplicate source', translated_text: 'Num 1 -' },
  ], null);
  await runParserFixture([
    {
      offset_dec: 5,
      original_text: [1, 2, 3, 4, 5, 6, 7].map((number) => `Num ${number} - Original ${number}`).join('\n'),
      translated_text: [1, 2, 3, 4, 5, 6, 8].map((number) => `Num ${number} - 번역 ${number}`).join('\n'),
    },
  ], null);
  await runParserFixture([
    {
      offset_dec: 5,
      original_text: [...[1, 2, 3, 4, 5, 6].map((number) => `Num ${number} - Original ${number}`), 'Num 7 - '].join('\n'),
      translated_text: [...[1, 2, 3, 4, 5, 6].map((number) => `Num ${number} - 번역 ${number}`), 'Num 7 - 번역 7'].join('\n'),
    },
  ], null);
  await runParserFixture([
    {
      offset_dec: 5,
      original_text: [...[1, 2, 3, 4, 5, 6].map((number) => `Num ${number} - Original ${number}`), `Num 7 - ${'x'.repeat(181)}`].join('\n'),
      translated_text: [...[1, 2, 3, 4, 5, 6].map((number) => `Num ${number} - 번역 ${number}`), 'Num 7 - 번역 7'].join('\n'),
    },
  ], null);
  await runParserFixture([
    {
      offset_dec: 5,
      original_text: [1, 2, 3, 4, 5, 6].map((number) => `Num ${number} - Original ${number}`).join('\n'),
      translated_text: [1, 2, 3, 4, 5, 6].map((number) => `Num ${number} - 번역 ${number}`).join('\n'),
    },
    { offset_dec: 70, original_text: 'Num 1 - Duplicate source', translated_text: 'Num 1 - 중복 번역' },
  ], null);
});

test('패처 상세 SSR은 최신 트레이너의 승인 매핑만 옵션 요약에 전달한다', async () => {
  const [page, component] = await Promise.all([
    readFile(pageUrl, 'utf8'),
    readFile(componentUrl, 'utf8'),
  ]);

  assert.match(page, /getTrainerOptionSummary\(mappingsMap\[latestTrainer\.id\] \|\| \[\]\)/);
  assert.match(page, /optionSummary=\{optionSummary\}/);
  assert.match(component, /if \(!summary \|\| summary\.items\.length < 6\) return null/);
  assert.doesNotMatch(component, /use client/);
});
