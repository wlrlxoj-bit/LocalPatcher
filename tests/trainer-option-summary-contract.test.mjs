import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const summaryUrl = new URL('../lib/trainer-option-summary.ts', import.meta.url);
const componentUrl = new URL('../components/PatcherOptionSummary.tsx', import.meta.url);
const pageUrl = new URL('../app/[locale]/patcher/[game_slug]/page.tsx', import.meta.url);

test('옵션 요약은 원문·번역의 동일 단축키와 최소 6개 검증을 모두 요구한다', async () => {
  const source = await readFile(summaryUrl, 'utf8');

  assert.match(source, /const MINIMUM_SUMMARY_OPTIONS = 6/);
  assert.match(source, /const MAXIMUM_SUMMARY_OPTIONS = 10/);
  assert.match(source, /sourceOptions\.length !== translatedOptions\.length/);
  assert.match(source, /normalizeShortcut\(source\.shortcut\) === normalizeShortcut\(translated\.shortcut\)/);
  assert.match(source, /verified\.length >= MINIMUM_SUMMARY_OPTIONS/);
  assert.match(source, /verified\.slice\(0, MAXIMUM_SUMMARY_OPTIONS\)/);
  assert.match(source, /여러 매핑을 합치지 않아/);
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
