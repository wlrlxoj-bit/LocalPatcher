import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const modulePath = '../lib/patcher-trainer-candidates.ts';
const source = await readFile(new URL(modulePath, import.meta.url), 'utf8');

/** 실제 TS만 평가하고 외부 의존성·DB·React 초기화는 허용하지 않습니다. */
function evaluate(text, dependencies = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(text, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports,
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `예상하지 않은 후보 의존성: ${name}`);
      return dependencies[name];
    },
  });
  return exports;
}
const candidates = evaluate(source);
const ids = (rows) => Array.from(rows, (row) => row.id);
const trainer = (id, version_str, game_id = 10) => ({ id, version_str, game_id, option_count: 1 });

test('후보 모듈은 런타임 import·I/O 없이 전체 본문을 로드한다', () => {
  const parsed = ts.createSourceFile(modulePath, source, ts.ScriptTarget.Latest, true);
  assert.equal(parsed.statements.filter(ts.isImportDeclaration).length, 0);
  assert.doesNotMatch(source, /\b(?:require|fetch|createClient|unstable_cache)\s*\(/);
  assert.doesNotMatch(source, /(?:react|supabase|server-only|content-eligibility)/);
  for (const name of ['parseVersion', 'compareVersionParts', 'sortTrainersLatestFirst', 'getPatcherTrainers', 'getLatestPatcherTrainer']) {
    assert.equal(typeof candidates[name], 'function');
  }
});

test('버전 범위는 마지막 v 숫자 끝점을 읽고 숫자 자릿수별 내림차순을 유지한다', () => {
  assert.deepEqual(Array.from(candidates.parseVersion('v1.02-v1.16.1 Plus35')), [1, 16, 1]);
  assert.deepEqual(Array.from(candidates.parseVersion('Version V2.9 - V2.10')), [2, 10]);
  assert.deepEqual(ids(candidates.sortTrainersLatestFirst([
    trainer(1, 'v1.02-v1.16.1 Plus35'), trainer(2, 'v1.9'), trainer(3, 'v1.17'),
  ])), [3, 1, 2]);
  // 앞쪽 범위가 아닌 마지막 끝점을 사용합니다.
  assert.deepEqual(ids(candidates.sortTrainersLatestFirst([trainer(4, 'v99-v1'), trainer(5, 'v2')])), [5, 4]);
});

test('버전의 누락한 자릿수는 0이며 동률은 ID 내림차순이다', () => {
  assert.equal(candidates.compareVersionParts([1, 16, 1], [1, 16, 1, 0]), 0);
  assert.ok(candidates.compareVersionParts([1, 9], [1, 10]) > 0);
  assert.deepEqual(ids(candidates.sortTrainersLatestFirst([
    trainer(1, 'v1.16.1'), trainer(9, 'v1.16.1.0'), trainer(3, 'v1.16.1'),
  ])), [9, 3, 1]);
});

test('미인식·불완전 문자열도 기존 숫자 추출 문법을 바꾸지 않는다', () => {
  for (const version of ['', 'unknown', '1.99', 'v.', 'version']) {
    assert.deepEqual(Array.from(candidates.parseVersion(version)), []);
  }
  assert.deepEqual(Array.from(candidates.parseVersion('v1..2')), [1]);
  assert.deepEqual(Array.from(candidates.parseVersion('v2beta')), [2]);
  assert.deepEqual(ids(candidates.sortTrainersLatestFirst([
    trainer(3, 'unknown'), trainer(1, 'v1..2'), trainer(4, ''), trainer(2, 'v2beta'),
  ])), [2, 1, 4, 3]);
});

test('빈 후보는 undefined이며 정렬·게임·트레이너 입력은 변경하지 않는다', () => {
  const game = Object.freeze({ id: 10, slug: 'fixture-game' });
  const games = Object.freeze([game]);
  const rows = Object.freeze([Object.freeze(trainer(1, 'v1')), Object.freeze(trainer(2, 'v2'))]);
  const sorted = candidates.sortTrainersLatestFirst(rows);
  assert.notEqual(sorted, rows);
  assert.deepEqual(ids(rows), [1, 2]);
  assert.deepEqual(ids(sorted), [2, 1]);
  assert.equal(sorted[0], rows[1]);
  assert.deepEqual(ids(candidates.getPatcherTrainers(game, games, rows)), [2, 1]);
  assert.equal(candidates.getLatestPatcherTrainer(game, games, rows), rows[1]);
  assert.equal(candidates.getLatestPatcherTrainer(game, games, []), undefined);
});

test('초대형 버전 숫자의 기존 Number 변환·동률 ID 비교 동작을 보존한다', () => {
  const hugeVersion = `v${'9'.repeat(400)}`;
  assert.equal(candidates.parseVersion(hugeVersion)[0], Infinity);
  // 기존 숫자 비교의 Infinity-Infinity 결과를 새 정규화 정책으로 바꾸지 않습니다.
  assert.ok(Number.isNaN(candidates.compareVersionParts([Infinity], [Infinity])));
  assert.deepEqual(ids(candidates.sortTrainersLatestFirst([
    trainer(100, 'v2'), trainer(3, hugeVersion), trainer(9, hugeVersion),
  ])), [9, 3, 100]);
});

test('option_count가 null인 기존 후보도 정렬 단계에서 삭제하거나 변형하지 않는다', () => {
  const game = { id: 10, slug: 'fixture-game' };
  const unknownCount = Object.freeze({ ...trainer(2, 'v2'), option_count: null });
  const rows = Object.freeze([Object.freeze(trainer(1, 'v1')), unknownCount]);
  const sorted = candidates.sortTrainersLatestFirst(rows);
  const selected = candidates.getPatcherTrainers(game, [game], rows);
  assert.deepEqual(ids(sorted), [2, 1]);
  assert.deepEqual(ids(selected), [2, 1]);
  assert.equal(selected[0], unknownCount);
  assert.equal(selected[0].option_count, null);
  assert.equal(candidates.getLatestPatcherTrainer(game, [game], rows), unknownCount);
  assert.deepEqual(ids(rows), [1, 2]);
});

test('정확한 Elden canonical만 정확한 source 게임과 병합한다', () => {
  const canonical = { id: 10, slug: candidates.ELDEN_RING_CANONICAL_SLUG };
  const sourceGame = { id: 11, slug: candidates.ELDEN_RING_SOURCE_SLUG };
  const nearMiss = { id: 12, slug: 'elden-ring-shadow-of-the-erdtree' };
  const unrelated = { id: 13, slug: 'another-game' };
  const rows = [trainer(1, 'v1', 10), trainer(2, 'v2', 11), trainer(3, 'v99', 12), trainer(4, 'v100', 13)];
  const games = [canonical, sourceGame, nearMiss, unrelated];
  assert.deepEqual(ids(candidates.getPatcherTrainers(canonical, games, rows)), [2, 1]);
  assert.deepEqual(ids(candidates.getPatcherTrainers(sourceGame, games, rows)), [2]);
  assert.deepEqual(ids(candidates.getPatcherTrainers(nearMiss, games, rows)), [3]);
  assert.deepEqual(ids(candidates.getPatcherTrainers(unrelated, games, rows)), [4]);
  assert.deepEqual(ids(candidates.getPatcherTrainers(canonical, [canonical, nearMiss], rows)), [1]);
  assert.equal(candidates.ELDEN_RING_SOURCE_SLUG, 'elden-ring-shadow-of-the-erdtree-trainer-1768067282');
});

test('중복 source ID는 후보를 중복 생성하지 않는다', () => {
  const game = { id: 10, slug: 'elden-ring' };
  const rows = [trainer(1, 'v1')];
  const result = candidates.getPatcherTrainers(game, [game, { id: 10, slug: candidates.ELDEN_RING_SOURCE_SLUG }], rows);
  assert.deepEqual(ids(result), [1]);
  assert.notEqual(result, rows);
});

