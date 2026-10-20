import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import vm from 'node:vm';
import ts from 'typescript';
import { loadAuditModules, runFixturePublicationAudit, runApprovedPublicationAudit } from '../scripts/patcher-publication-audit.mjs';

// 구현 전 승인한 회귀 시나리오: 승인 실패 0회, 실제 모듈 경계, 21개 거절,
// 순차 실행, 첫 실패 차단, 집계 합계, 모집단 중복/누락, 비공개 출력 차단.
const request = (number = 1) => ({ canonicalSlug: `fixture-game-${number}`, locale: 'ko' });
const approval = { approved: true, executionEnvironment: 'offline-fixture', projectHostConfirmed: true,
  serviceKeyPresentConfirmed: true, cohortManifestConfirmed: true };
const options = (requests = [request()]) => ({ approval, requests, coverage: 'sample', maxReads: 20, timeBudgetMs: 1000 });
const sentinel = 'PRIVATE_SENTINEL';
function payload(args, overrides = {}) {
  return { schema_version: 1, locale: args.p_locale, fingerprint: 'a'.repeat(64),
    canonical_game: { id: 4, slug: args.p_canonical_slug }, source_games: [{ id: 4, slug: args.p_canonical_slug }],
    candidate_trainers: [{ id: 10, game_id: 4, version_str: 'v1.0', option_count: 1 }],
    approved_mappings: [{ id: 1, trainer_id: 10, language_code: args.p_locale, is_approved: true,
      offset_dec: 100, original_text: `Num 0 - ${sentinel}`, translated_text: 'Num 0 - 번역' }],
    counts: { source_games: 1, candidate_trainers: 1, approved_mappings: 1 }, ...overrides };
}
async function fixture(run = async args => ({ data: payload(args), error: null })) {
  const state = { clients: 0, reads: 0, active: 0, peak: 0, output: '' };
  const runtime = await loadAuditModules({ env: { NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture-only' }, supabase: { createClient(url, secret, config) {
    assert.equal(url, 'https://fixture.invalid'); assert.equal(secret, 'fixture-only');
    assert.equal(config.auth.persistSession, false); assert.equal(config.auth.autoRefreshToken, false);
    state.clients += 1;
    return { rpc(name, args) {
      assert.equal(name, 'read_patcher_publication_input');
      assert.deepEqual(Object.keys(args).sort(), ['p_canonical_slug', 'p_locale']);
      state.reads += 1;
      return { abortSignal(signal) {
        assert.equal(typeof signal.aborted, 'boolean');
        state.active += 1; state.peak = Math.max(state.peak, state.active);
        return Promise.resolve().then(() => run(args, state, signal)).finally(() => { state.active -= 1; });
      } };
    } };
  } } });
  // 실제 access.ts의 환경값 읽기와 createClient 호출은 fixture 내부에서만 격리합니다.
  return { state, runtime, emit: text => { state.output += text; } };
}

/** 실제 harness를 합성 환경/시계로 평가하며 운영 환경 읽기와 외부 모듈 접근을 차단합니다. */
async function isolatedHarness(env = {}, clock = performance) {
  const state = { imports: 0, clients: 0, reads: 0, fileReads: 0, output: '' };
  const fileUrl = new URL('../scripts/patcher-publication-audit.mjs', import.meta.url);
  const source = (await readFile(fileUrl, 'utf8')).replaceAll('import.meta.url', JSON.stringify(fileUrl.href));
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022, esModuleInterop: true, allowJs: true } }).outputText;
  const record = { exports: {} };
  const dependencies = {
    'node:fs/promises': { readFile() { state.fileReads += 1; throw new Error('격리 경계 밖 파일 읽기 금지'); } },
    'node:buffer': { Buffer }, 'node:crypto': {}, 'node:vm': vm, typescript: ts,
  };
  vm.runInNewContext(output, { module: record, exports: record.exports, Buffer, URL, AbortController, AbortSignal,
    setTimeout, clearTimeout, performance: clock, process: { env, stdout: { write(text) { state.output += text; } } },
    require(name) {
      if (name === '@supabase/supabase-js') {
        state.imports += 1;
        return { createClient() { state.clients += 1; return { rpc() { state.reads += 1; throw new Error('네트워크 금지'); } }; } };
      }
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      throw new Error('허용되지 않은 격리 의존성');
    },
  }, { filename: 'isolated-patcher-publication-audit.mjs' });
  return { harness: record.exports, state };
}

test('미승인 호출과 live gate 실패는 클라이언트를 만들지 않는다', async () => {
  const f = await fixture();
  const result = await runFixturePublicationAudit({ ...options(), approval: {} }, f.runtime, f.emit);
  assert.equal(result.status, 'rejected'); assert.equal(f.state.clients, 0); assert.equal(f.state.reads, 0);
  assert.equal((await runApprovedPublicationAudit({ ...options(), approval: {} })).status, 'rejected');
});

test('21개, 중복, full manifest 누락/불일치는 읽기 전에 거절한다', async () => {
  const f = await fixture();
  for (const changed of [
    { requests: Array.from({ length: 21 }, (_, index) => request(index + 1)) },
    { requests: [request(), request()] }, { coverage: 'full' },
    { coverage: 'full', manifest: { scope: 'full', requests: [request(), request(2)] } },
    { coverage: 'full', manifest: { scope: 'full', requests: [request(), request()] } },
  ]) assert.equal((await runFixturePublicationAudit({ ...options(), ...changed }, f.runtime, f.emit)).status, 'rejected');
  assert.equal(f.state.clients, 0); assert.equal(f.state.reads, 0);
});

test('maxReads 및 전역 시간 예산의 양쪽 경계를 승인 상태에서도 거절한다', async () => {
  const f = await fixture();
  for (const changed of [{ maxReads: 21 }, { maxReads: 0 }, { timeBudgetMs: 60001 }, { timeBudgetMs: 0 }]) {
    const result = await runFixturePublicationAudit({ ...options(), ...changed }, f.runtime, f.emit);
    assert.equal(result.status, 'rejected');
  }
  assert.equal(f.state.clients, 0); assert.equal(f.state.reads, 0); assert.equal(f.state.output, '');
});

test('정확히 20개는 한 클라이언트에서 최대 동시성 1로 완료한다', async () => {
  const f = await fixture();
  const requests = Array.from({ length: 20 }, (_, index) => request(index + 1));
  const result = await runFixturePublicationAudit(options(requests), f.runtime, f.emit);
  assert.equal(result.status, 'complete'); assert.equal(result.summary.total, 20);
  assert.equal(result.coverage.processed, 20); assert.equal(result.coverage.unprocessed, 0);
  assert.equal(f.state.clients, 1); assert.equal(f.state.reads, 20); assert.equal(f.state.peak, 1);
});

test('실제 strict selector의 과거 완전 승인본 선택을 previous로 집계한다', async () => {
  const f = await fixture(async args => {
    const data = payload(args);
    data.candidate_trainers.push({ id: 20, game_id: 4, version_str: 'v2.0', option_count: 1 });
    data.counts.candidate_trainers += 1;
    return { data, error: null };
  });
  const result = await runFixturePublicationAudit(options(), f.runtime, f.emit);
  assert.equal(result.status, 'complete'); assert.equal(result.summary.total, 1);
  assert.equal(result.summary.available, 1); assert.equal(result.summary.latest, 0); assert.equal(result.summary.previous, 1);
  assert.equal(result.summary.available + result.summary.unavailable, result.summary.total);
  assert.equal(f.state.clients, 1); assert.equal(f.state.reads, 1);
});

test('초기 예산이 이미 소진되면 클라이언트 생성과 RPC가 모두 0회다', async () => {
  const f = await fixture();
  let ticks = 0;
  const isolated = await isolatedHarness({}, { now: () => ticks++ === 0 ? 0 : 2 });
  const result = await isolated.harness.runFixturePublicationAudit({ ...options(), timeBudgetMs: 1 }, f.runtime, f.emit);
  assert.equal(result.status, 'stopped'); assert.equal(result.summary.total, 0);
  assert.equal(result.coverage.unprocessed, 1); assert.equal(f.state.clients, 0); assert.equal(f.state.reads, 0);
});

test('승인 true여도 bad host와 서비스키 없음은 실제 환경 없이 live gate에서 차단한다', async () => {
  for (const env of [
    { NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture-only' },
    { NEXT_PUBLIC_SUPABASE_URL: 'https://ikrowgnkucljngcqpvih.supabase.co' },
  ]) {
    const isolated = await isolatedHarness(env);
    const result = await isolated.harness.runApprovedPublicationAudit(options());
    assert.equal(result.status, 'rejected');
    assert.equal(isolated.state.imports, 0); assert.equal(isolated.state.clients, 0); assert.equal(isolated.state.reads, 0);
    assert.equal(isolated.state.fileReads, 0); assert.equal(isolated.state.output, '');
  }
});

test('실제 access/input/dry-run/strict selector는 순차 실행하고 고정 집계만 출력한다', async () => {
  const f = await fixture(async args => { await Promise.resolve(); return { data: payload(args), error: null }; });
  const result = await runFixturePublicationAudit(options([request(), request(2)]), f.runtime, f.emit);
  assert.equal(result.status, 'complete'); assert.equal(f.state.clients, 1); assert.equal(f.state.reads, 2); assert.equal(f.state.peak, 1);
  assert.equal(result.summary.total, 2); assert.equal(result.summary.available, 2);
  assert.equal(result.summary.latest + result.summary.previous, result.summary.available);
  assert.equal(result.summary.available + result.summary.unavailable, result.summary.total);
  assert.equal(result.coverage.scope, 'sample'); assert.equal(result.coverage.fullCoverageComplete, false);
  for (const hidden of [sentinel, 'fixture-game', 'fingerprint', 'original_text', 'translated_text', 'a'.repeat(64), 'v1.0', 'fixture-only'])
    assert.equal(f.state.output.includes(hidden), false);
});

test('infra/parse 첫 실패 뒤에는 다음 요청이나 자동 재시도가 없다', async () => {
  for (const run of [async () => { throw new Error(sentinel); }, async () => ({ data: {}, error: null }),
    async () => ({ data: null, error: { message: sentinel } })]) {
    const f = await fixture(run);
    const result = await runFixturePublicationAudit(options([request(), request(2)]), f.runtime, f.emit);
    assert.equal(result.status, 'stopped'); assert.equal(f.state.reads, 1); assert.equal(result.coverage.unprocessed, 1);
    assert.equal(result.summary.total, 1); assert.equal(result.summary.unavailable, 1);
    assert.equal(f.state.output.includes(sentinel), false);
  }
});

test('정상 unavailable은 중단하지 않으며 승인된 정확한 full manifest만 완료한다', async () => {
  const f = await fixture(async args => ({ data: payload(args, { approved_mappings: [],
    counts: { source_games: 1, candidate_trainers: 1, approved_mappings: 0 } }), error: null }));
  const requests = [request(), request(2)];
  const result = await runFixturePublicationAudit({ ...options(requests), coverage: 'full', manifest: { scope: 'full', requests } }, f.runtime, f.emit);
  assert.equal(result.status, 'complete'); assert.equal(result.coverage.fullCoverageComplete, true);
  assert.equal(result.summary.reasons.NO_COMPLETE_APPROVED_TRANSLATION, 2); assert.equal(f.state.reads, 2);
});

test('global time budget 만료는 failure latch와 abort를 적용한다', async () => {
  const f = await fixture(async (_args, _state, signal) => new Promise(resolve => {
    signal.addEventListener('abort', () => resolve({ data: null, error: {} }), { once: true });
  }));
  const result = await runFixturePublicationAudit({ ...options([request(), request(2)]), timeBudgetMs: 5 }, f.runtime, f.emit);
  assert.equal(result.status, 'stopped'); assert.equal(f.state.reads, 1); assert.equal(result.coverage.unprocessed, 1);
});

