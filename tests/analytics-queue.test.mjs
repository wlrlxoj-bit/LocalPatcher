import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

// 실제 TypeScript 모듈을 실행하고 브라우저 시계만 격리하여 초기화 경쟁을 재현합니다.
const source = readFileSync(new URL('../lib/analytics.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

function harness(browser = {}) {
  let now = 0;
  let nextId = 0;
  const timers = new Map();
  const context = vm.createContext({
    exports: {},
    ...(browser === null ? {} : { window: browser }),
    Date: { now: () => now },
    setTimeout(callback, delay) {
      const id = ++nextId;
      timers.set(id, { callback, at: now + delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
  });
  vm.runInContext(compiled, context);
  return {
    track: context.exports.trackAnalyticsEvent,
    timers,
    advance(ms) {
      const target = now + ms;
      while (true) {
        const due = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
        if (!due || due[1].at > target) break;
        now = due[1].at;
        timers.delete(due[0]);
        due[1].callback();
      }
      now = target;
    },
  };
}

test('SSR에서는 이벤트와 타이머를 생성하지 않는다', () => {
  const h = harness(null);
  h.track('patcher_viewed');
  assert.equal(h.timers.size, 0);
});

test('GA 지연 초기화 후 이벤트를 원래 순서로 한 번씩 전달한다', () => {
  const browser = {};
  const h = harness(browser);
  const calls = [];
  const params = { locale: 'ko' };
  h.track('patcher_viewed', params);
  params.locale = 'en';
  h.track('file_selected');
  h.advance(1000);
  assert.equal(calls.length, 0);
  assert.equal(h.timers.size, 1);
  browser.gtag = (...args) => calls.push(args);
  h.advance(250);
  assert.deepEqual(calls.map((args) => args[1]), ['patcher_viewed', 'file_selected']);
  assert.equal(calls[0][2].locale, 'ko');
  h.advance(30_000);
  assert.equal(calls.length, 2);
  assert.equal(h.timers.size, 0);
});

test('GA가 이미 준비되었으면 즉시 전달하고 대기 이벤트도 먼저 전달한다', () => {
  const browser = {};
  const h = harness(browser);
  const calls = [];
  h.track('patcher_viewed');
  browser.gtag = (...args) => calls.push(args);
  h.track('file_selected');
  assert.deepEqual(calls.map((args) => args[1]), ['patcher_viewed', 'file_selected']);
  assert.equal(h.timers.size, 0);
});

test('차단된 GA의 이벤트는 만료되고 타이머도 종료된다', () => {
  const browser = {};
  const h = harness(browser);
  h.track('patcher_viewed');
  h.advance(30_000);
  assert.equal(h.timers.size, 0);
  const calls = [];
  browser.gtag = (...args) => calls.push(args);
  h.track('file_selected');
  assert.deepEqual(calls.map((args) => args[1]), ['file_selected']);
});

test('대기열은 최대 40개만 보관하고 GA 예외가 기능 호출로 전파되지 않는다', () => {
  const browser = {};
  const h = harness(browser);
  for (let i = 0; i < 100; i++) h.track('patcher_viewed', { order: i });
  const calls = [];
  browser.gtag = (...args) => calls.push(args);
  h.advance(250);
  assert.equal(calls.length, 40);
  assert.equal(calls[0][2].order, 60);
  browser.gtag = () => { throw new Error('blocked'); };
  assert.doesNotThrow(() => h.track('file_selected'));
  assert.equal(h.timers.size, 0);
});
