import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const read = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

// 실제 제품 모듈을 실행하고 공급자·DB 경계만 격리한다.
async function loadTs(file, dependencies = {}) {
  const exports = {};
  const output = ts.transpileModule(await read(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(output, { exports, URL, require(name) {
    if (name === 'server-only') return {};
    if (name in dependencies) return dependencies[name];
    if (name === 'node:crypto') return require(name);
    throw new Error(`예상하지 않은 의존성: ${name}`);
  } }, { filename: file });
  return exports;
}

async function serviceFixture(providerError) {
  const calls = [];
  const client = {
    from(table) {
      calls.push(table);
      if (table === 'translation_usage_monthly') throw new Error('과거 한도 조회 실패');
      const query = {
        select() { return this; }, eq() { return this; },
        async maybeSingle() { return { data: null, error: null }; },
        async in() { return { data: [], error: null }; },
        insert() { return this; },
        async single() { return { data: { id: 'job-1' }, error: null }; },
        update(value) { calls.push(value.status); return this; },
        then(resolve) { return Promise.resolve({ error: null }).then(resolve); },
      };
      return query;
    },
    rpc() { calls.push('forbidden-rpc'); throw new Error('월간 한도 RPC 실패'); },
  };
  const types = await loadTs('lib/server/translation/types.ts');
  const hash = await loadTs('lib/server/translation/hash.ts');
  const errors = await loadTs('lib/server/translation/errors.ts');
  const source = { client, items: [{ key: 'slot-1', text: 'Health', sourceMappingId: 1, offsetDec: 0, lineIndex: 0 }], targets: [], slots: [], sourceMappingId: 1, sourceMappingIds: [1], sourceVersion: 'v1' };
  const translate = async (items) => { calls.push('provider'); if (providerError) throw providerError; return items.map((item) => ({ ...item, translatedText: '체력' })); };
  const moduleRecord = await loadTs('lib/server/translation/service.ts', {
    './types': types, './hash': hash, './errors': errors,
    './source': { loadTranslationSource: async () => source },
    './azure': { translateWithAzure: translate }, './gemini': { translateWithGemini: translate },
    './openai-paid': { translateWithOpenAIPaid: translate },
  });
  return { module: moduleRecord, calls };
}

test('실제 preview/run은 과거 사용량 조회와 모든 월간 한도 RPC 없이 성공한다', async () => {
  for (const provider of ['gemini', 'openai_paid', 'azure']) {
    const { module, calls } = await serviceFixture();
    const preview = await module.createTranslationPreview(provider, 1, 'ko');
    assert.equal(preview.quota.enforced, false);
    assert.equal(preview.quota.status, 'unlimited');
    assert.equal(preview.quota.limit, null);
    const result = await module.runTranslation({ provider, trainerId: 1, targetLanguage: 'ko', previewHash: preview.previewHash, idempotencyKey: 'test-1', paidConsent: true });
    assert.equal(result.status, 'completed');
    assert.equal(result.result[0].translatedText, '체력');
    assert.equal(calls.includes('provider'), true);
    assert.equal(calls.includes('translation_usage_monthly'), false);
    assert.equal(calls.includes('forbidden-rpc'), false);
  }
});

test('한도 제거 후에도 실제 OpenAI 유료 사용 동의를 요구한다', async () => {
  const { module, calls } = await serviceFixture();
  const preview = await module.createTranslationPreview('openai_paid', 1, 'ko');
  await assert.rejects(module.runTranslation({ provider: 'openai_paid', trainerId: 1, targetLanguage: 'ko', previewHash: preview.previewHash, idempotencyKey: 'test-2' }), /유료 사용 동의/);
  assert.equal(calls.includes('provider'), false);
});

test('공급자의 실제 quota 오류는 숨기지 않고 실패 작업으로 저장한다', async () => {
  const errors = await loadTs('lib/server/translation/errors.ts');
  const failure = new errors.TranslationError('quota', '공급자 HTTP 429');
  assert.equal(errors.translationErrorStatus(failure), 429);
  const { module, calls } = await serviceFixture(failure);
  const preview = await module.createTranslationPreview('gemini', 1, 'ko');
  await assert.rejects(module.runTranslation({ provider: 'gemini', trainerId: 1, targetLanguage: 'ko', previewHash: preview.previewHash, idempotencyKey: 'test-429' }), (error) => error === failure);
  assert.equal(calls.includes('failed'), true);
  assert.equal(calls.includes('forbidden-rpc'), false);
});

async function usageFixture({ authorized = true, mode = 'history' } = {}) {
  const calls = [];
  const client = { from(table) {
    calls.push(table);
    if (mode === 'throw') throw new Error('내부 DB 오류 상세');
    return { select() { return this; }, eq() { return this; }, async maybeSingle() {
      return mode === 'error' ? { data: null, error: new Error('DB 오류') } : { data: mode === 'none' ? null : { used_characters: 100, reserved_characters: 20, hard_limit_characters: 0 }, error: null };
    } };
  }, rpc() { assert.fail('폐기한 한도 RPC를 호출할 수 없습니다.'); } };
  const types = await loadTs('lib/server/translation/types.ts');
  const moduleRecord = await loadTs('app/api/admin/translations/usage/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) } },
    '@/lib/server/translation/admin-auth': { requireTranslationAdmin: () => authorized },
    '@/lib/server/translation/db': { getTranslationAdminClient() { calls.push('client'); return mode === 'unconfigured' ? null : client; } },
    '@/lib/server/translation/types': types,
  });
  return { module: moduleRecord, calls };
}

test('실제 usage GET은 소진된 과거 기록을 비강제 history로만 표시한다', async () => {
  const { module } = await usageFixture();
  const response = await module.GET({ url: 'https://local.test/api/admin/translations/usage?provider=gemini' });
  assert.equal(response.status, 200);
  assert.equal(response.body.enforced, false);
  assert.equal(response.body.status, 'unlimited');
  assert.equal(response.body.limit, null);
  assert.equal(response.body.used, null);
  assert.equal(response.body.historyStatus, 'historical');
  assert.equal(response.body.history.historical, true);
  assert.equal(response.body.history.enforced, false);
  assert.equal(response.body.history.used, 100);
  assert.equal(response.body.history.limit, 0);
});

test('실제 usage GET은 DB 오류·미설정·기록 부재에도 비강제 상태를 반환한다', async () => {
  for (const mode of ['throw', 'error', 'unconfigured', 'none']) {
    const { module } = await usageFixture({ mode });
    const response = await module.GET({ url: 'https://local.test/api/admin/translations/usage?provider=gemini' });
    assert.equal(response.status, 200);
    assert.equal(response.body.status, 'unlimited');
    assert.equal(response.body.enforced, false);
    assert.equal(response.body.history, null);
    assert.equal(JSON.stringify(response.body).includes('내부 DB'), false);
  }
});

test('실제 usage 인증 실패는 GET/PATCH를 차단하고 인증된 PATCH는 DB 없이 410이다', async () => {
  const unauth = await usageFixture({ authorized: false });
  for (const method of ['GET', 'PATCH']) assert.equal((await unauth.module[method]({})).status, 401);
  assert.equal(unauth.calls.length, 0);
  const auth = await usageFixture();
  const response = await auth.module.PATCH({ json() { assert.fail('폐기한 PATCH 본문을 파싱할 수 없습니다.'); } });
  assert.equal(response.status, 410);
  assert.equal(response.body.error, 'gone');
  assert.equal(auth.calls.length, 0);
});

test('관리 UI는 월간 한도 입력·저장·실행 gating 없이 공급자 동의와 429 처리를 유지한다', async () => {
  const source = await read('components/admin/translation/TranslationJobPanel.tsx');
  assert.doesNotMatch(source, /saveMonthlyLimit|limitDraft|Save monthly limit|preview\.quota\.status !==/);
  assert.match(source, /No site-imposed monthly character cap/);
  assert.match(source, /provider === 'openai_paid' && !paidConsent/);
  assert.match(source, /reason\.status === 429/);
});

test('실제 UI 렌더는 과거 exhausted 응답이어도 실행을 허용하되 유료 동의는 요구한다', async () => {
  for (const provider of ['gemini', 'openai_paid']) {
    let cursor = 0;
    const states = ['ko', provider, { trainerId: 1, targetLanguage: 'ko', sourceMappingId: 1, sourceVersion: 'v1', items: [{ key: '1', text: 'Health' }] }, { previewHash: 'hash', itemCount: 1, characters: 6, batchCount: 1, quota: { status: 'exhausted' }, pending: null }, null, {}, 'key', false, 'ready', ''];
    const jsx = (type, props) => ({ type, props });
    const moduleRecord = await loadTs('components/admin/translation/TranslationJobPanel.tsx', {
      react: { useEffect() {}, useMemo: (fn) => fn(), useState: () => [states[cursor++], () => {}] },
      'react/jsx-runtime': { jsx, jsxs: jsx },
      'lucide-react': { AlertTriangle: 'AlertTriangle', CheckCircle2: 'CheckCircle2', Loader2: 'Loader2', Sparkles: 'Sparkles' },
    });
    const nodes = [];
    function visit(node) {
      if (Array.isArray(node)) { node.forEach(visit); return; }
      if (!node || typeof node !== 'object') return;
      nodes.push(node); visit(node.props?.children);
    }
    visit(moduleRecord.default({ trainerId: 1 }));
    const run = nodes.find((node) => node.type === 'button' && node.props.children === 'Run translation');
    assert.ok(run);
    assert.equal(run.props.disabled, provider === 'openai_paid');
    assert.equal(nodes.some((node) => node.type === 'input' && node.props.placeholder === 'Monthly character limit'), false);
    assert.equal(nodes.some((node) => node.type === 'button' && node.props.children === 'Save monthly limit'), false);
  }
});
