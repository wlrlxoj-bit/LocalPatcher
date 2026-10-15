import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';

const require = createRequire(import.meta.url);
const ts = require('typescript');
async function load(file, dependencies = {}, globals = {}, inspectNames = []) {
  const exports = {};
  const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(output + inspectNames.map(name => `\nexports.${name} = ${name};`).join(''), { exports, URL, URLSearchParams, Date, console, ...globals, require(name) {
    if (name in dependencies) return dependencies[name];
    if (name === 'next/server') return { NextResponse: { json: (body, options = {}) => ({ body, status: options.status ?? 200, headers: options.headers }) } };
    throw new Error(`예상하지 않은 의존성: ${name}`);
  } });
  return exports;
}

function clientFixture(rows, failure = false) {
  return { from() {
    let filtered = rows;
    let head = false;
    const query = {
      select(_columns, options) { head = Boolean(options?.head); return this; },
      eq(key, value) { filtered = filtered.filter(row => row[key] === value); return this; },
      in(key, values) { filtered = filtered.filter(row => values.includes(row[key])); return this; },
      lte(key, value) { filtered = filtered.filter(row => row[key] != null && row[key] <= value); return this; },
      gt(key, value) { filtered = filtered.filter(row => row[key] != null && row[key] > value); return this; },
      or(expression) { const checkedAt = expression.split('lease_expires_at.lte.')[1]; filtered = filtered.filter(row => row.lease_expires_at == null || row.lease_expires_at <= checkedAt); return this; },
      order() { return this; }, limit() { return this; },
      async maybeSingle() { return { data: filtered.at(-1), error: failure ? {} : null }; },
      then(resolve) { return Promise.resolve({ count: head ? filtered.length : null, error: failure ? {} : null }).then(resolve); },
    };
    return query;
  } };
}

test('재처리 집계는 상태명과 실제 처리 가능 시각을 구분한다', async () => {
  const rows = [
    { state: 'ready', next_retry_at: '2000-01-01T00:00:00.000Z' },
    { state: 'deferred', next_retry_at: '2000-01-01T00:00:00.000Z' },
    { state: 'ready', next_retry_at: '2999-01-01T00:00:00.000Z' },
    { state: 'deferred', next_retry_at: '2999-01-01T00:00:00.000Z' },
    { state: 'blocked', next_retry_at: null, last_failure_code: 'SOURCE_IDENTITY_MISMATCH' },
  ];
  const route = await load('app/api/admin/system/translation-retry-status/route.ts', { '@/lib/server/admin/access': { requireAdmin: () => true, getAdminClient: () => clientFixture(rows) } });
  const result = await route.GET(new Request('https://example.test'));
  assert.equal(result.body.ready, 2);
  assert.equal(result.body.deferred, 2);
  assert.equal(result.body.due, 2);
  assert.equal(result.body.scheduled, 2);
  assert.equal(result.body.blocked, 1);
  assert.equal(result.body.latestFailureCode, 'SOURCE_IDENTITY_MISMATCH');
  assert.ok(result.body.checkedAt);
});

test('관리자 상태 문구는 프로세스 성공·번역 승인과 로컬 기록을 명확히 구분한다', async () => {
  const jsx = (type, props) => ({ type, props });
  const react = { useState: value => [value, () => {}], useEffect() {} };
  const page = await load('app/[locale]/admin/system/page.tsx', {
    react: { ...react, default: react },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    'lucide-react': Object.fromEntries(['Settings', 'Play', 'Database', 'ShieldAlert', 'Loader2', 'ExternalLink', 'CheckCircle', 'XCircle'].map(name => [name, name])),
  }, {}, ['StatusIndicator', 'StatusNotice', 'RetryQueueIndicator']);
  function text(node) {
    if (Array.isArray(node)) return node.map(text).join(' ');
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (!node || typeof node !== 'object') return '';
    return text(typeof node.type === 'function' ? node.type(node.props) : node.props?.children);
  }
  const success = text(page.StatusIndicator({ status: { tracking: 'latest_run', run: { operationalState: 'succeeded' }, latestSuccess: null } }));
  assert.match(success, /실행 종료 \(GitHub 성공\)/);
  assert.match(success, /번역 승인·페이지 공개 완료를 뜻하지 않습니다/);
  assert.match(text(page.StatusNotice({ error: 'HTTP 503', loading: false, empty: false })), /기존 표시값은 숨겼습니다/);
  const queue = text(page.RetryQueueIndicator({ status: { ready: 99, deferred: 0, blocked: 0, due: 2, scheduled: 97 } }));
  assert.match(queue, /기한 도래\s+2/);
  assert.doesNotMatch(queue, /즉시 처리\s+99/);
  const screen = text(page.default());
  assert.match(screen, /현재 탭의 수동 요청 기록/);
  assert.match(screen, /서버 실행 로그가 아닙니다/);
  assert.match(screen, /상태 조회 중/);
  assert.doesNotMatch(screen, /System initialization complete/);
});

test('무결성 집계는 활성 임대를 기한 도래·예약과 분리하고 만료 임대를 다시 포함한다', async () => {
  const past = '2000-01-01T00:00:00.000Z';
  const future = '2999-01-01T00:00:00.000Z';
  const rows = [
    { state: 'ready', next_retry_at: past, lease_expires_at: null },
    { state: 'deferred', next_retry_at: past, lease_expires_at: past },
    { state: 'ready', next_retry_at: future, lease_expires_at: null },
    { state: 'ready', next_retry_at: future, lease_expires_at: future },
    { state: 'ready', next_retry_at: past, lease_expires_at: future },
    { state: 'blocked', next_retry_at: null },
    { state: 'completed', next_retry_at: null },
  ];
  const route = await load('app/api/admin/system/translation-integrity-status/route.ts', { '@/lib/server/admin/access': { requireAdmin: () => true, getAdminClient: () => clientFixture(rows) } });
  const result = await route.GET(new Request('https://example.test'));
  assert.equal(result.status, 200);
  assert.equal(result.body.due, 2);
  assert.equal(result.body.scheduled, 1);
  assert.equal(result.body.processing, 2);
  assert.equal(result.body.blocked, 1);
  assert.equal(result.body.completed, 1);
});

test('무결성 조회도 미인증과 DB 장애를 0건 정상으로 반환하지 않는다', async () => {
  for (const authorized of [false, true]) {
    let accesses = 0;
    const route = await load('app/api/admin/system/translation-integrity-status/route.ts', { '@/lib/server/admin/access': { requireAdmin: () => authorized, getAdminClient: () => { accesses++; return clientFixture([], true); } } });
    const response = await route.GET(new Request('https://example.test'));
    assert.equal(response.status, authorized ? 503 : 401);
    assert.equal(accesses, authorized ? 1 : 0);
  }
});

test('GitHub 상태는 번역 완료가 아닌 실행 결과이며 잘못된 상류 응답은 오류로 반환한다', async () => {
  for (const malformed of [false, true]) {
    const route = await load('app/api/admin/system/workflow-status/route.ts', {
      'next/headers': { cookies: async () => ({ get: () => ({ value: '격리 테스트 세션' }) }) },
      '@/lib/admin-session': { isValidAdminSession: () => true, ADMIN_SESSION_COOKIE: 'session' },
    }, { process: { env: { GITHUB_PAT: '격리 테스트 자격 증명' } }, fetch: async () => ({ ok: true, json: async () => malformed ? {} : { workflow_runs: [{ id: 1, status: 'completed', conclusion: 'success' }] } }) });
    const response = await route.GET(new Request('https://example.test?workflowId=scraper.yml'));
    assert.equal(response.status, malformed ? 502 : 200);
    if (!malformed) {
      assert.equal(response.body.run.operationalState, 'succeeded');
      assert.equal(response.body.resultScope, 'workflow_execution');
      assert.ok(response.body.checkedAt);
    }
  }
});

test('집계 오류는 0건 정상으로 위장하지 않고 인증 이전 DB 접근을 막는다', async () => {
  for (const authorized of [false, true]) {
    let accesses = 0;
    const route = await load('app/api/admin/system/translation-retry-status/route.ts', { '@/lib/server/admin/access': { requireAdmin: () => authorized, getAdminClient: () => { accesses++; return clientFixture([], true); } } });
    const response = await route.GET(new Request('https://example.test'));
    assert.equal(response.status, authorized ? 503 : 401);
    assert.equal(accesses, authorized ? 1 : 0);
  }
});

test('관리자 화면은 개별 조회 실패를 표시하고 다른 상태 조회를 유지한다', async () => {
  const states = [];
  const effects = [];
  const react = { useState(initial) { const index = states.length; states.push(initial); return [initial, value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }]; }, useEffect(effect) { effects.push(effect); } };
  const jsx = (type, props) => ({ type, props });
  const page = await load('app/[locale]/admin/system/page.tsx', {
    react: { ...react, default: react },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    'lucide-react': Object.fromEntries(['Settings', 'Play', 'Database', 'ShieldAlert', 'Loader2', 'ExternalLink', 'CheckCircle', 'XCircle'].map(name => [name, name])),
  }, { AbortController, setTimeout, clearTimeout, fetch: async url => {
    if (url.includes('translation-retry-status')) return { ok: false, status: 503 };
    return { ok: true, json: async () => ({ marker: url }) };
  }, setInterval: () => 1, clearInterval() {} });
  page.default();
  effects[0]();
  await new Promise(resolve => setTimeout(resolve, 20));
  const values = states.flatMap(value => typeof value === 'object' && value ? [value, ...Object.values(value)] : [value]);
  assert.ok(values.some(value => typeof value === 'string' && value.includes('503')));
  assert.ok(values.some(value => value?.marker?.includes('maintenance.yml')));
});
