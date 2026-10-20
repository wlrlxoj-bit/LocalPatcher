import { readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import * as crypto from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';

const PROJECT_HOST = 'ikrowgnkucljngcqpvih.supabase.co';
const REASONS = ['INVALID_REQUEST', 'ADMIN_CLIENT_UNAVAILABLE', 'RPC_FAILED', 'INVALID_RPC_PAYLOAD', 'READER_FAILED',
  'NO_TRAINERS', 'UNSUPPORTED_LOCALE', 'INVALID_TRAINER_INPUT', 'NO_COMPLETE_APPROVED_TRANSLATION'];
const quietConsole = Object.freeze({ log() {}, warn() {}, error() {}, info() {}, debug() {} });
const emptySummary = () => ({ status: 'complete', total: 0, available: 0, latest: 0, previous: 0, unavailable: 0,
  reasons: Object.fromEntries(REASONS.map(reason => [reason, 0])) });
const key = request => JSON.stringify([request.canonicalSlug, request.locale]);
const validRequest = value => value && typeof value.canonicalSlug === 'string' && value.canonicalSlug.length <= 200 &&
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.canonicalSlug) && ['ko', 'ja', 'de', 'es'].includes(value.locale);

/**
 * 실제 TS 경계를 명시한 의존성만으로 로드합니다. 운영 시 Supabase 모듈을 그대로 사용하며
 * server-only 표식만 Node 실행 경계에서 비웁니다. 환경 파일 탐색·자동 클라이언트 생성은 없습니다.
 * fixture 호출자는 env와 Supabase 대역을 직접 전달해야 합니다.
 */
export async function loadAuditModules({ env, supabase }) {
  async function load(path, dependencies = {}) {
    const source = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
    const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const record = { exports: {} };
    vm.runInNewContext(output, { module: record, exports: record.exports, process: { env }, Buffer, AbortController,
      setTimeout, clearTimeout, console: quietConsole,
      require(name) {
        if (name === 'server-only') return {};
        if (Object.hasOwn(dependencies, name)) return dependencies[name];
        throw new Error('AUDIT_DEPENDENCY_REJECTED');
      },
    }, { filename: path });
    return record.exports;
  }
  const session = await load('lib/admin-session.ts', { 'node:crypto': crypto });
  const auth = await load('lib/server/translation/admin-auth.ts', { '@/lib/admin-session': session });
  const access = await load('lib/server/admin/access.ts', { '@supabase/supabase-js': supabase, '@/lib/server/translation/admin-auth': auth });
  const site = await load('lib/site.ts');
  const table = await load('lib/trainer-option-table.ts');
  const publication = await load('lib/patcher-publication.ts', { './site': site, './trainer-option-table': table });
  const candidates = await load('lib/patcher-trainer-candidates.ts');
  const input = await load('lib/server/admin/patcher-publication-input.ts', { 'node:buffer': { Buffer }, './access': access,
    '@/lib/site': site, '@/lib/patcher-trainer-candidates': candidates });
  const dryRun = await load('lib/server/admin/patcher-publication-dry-run.ts', { '@/lib/patcher-publication': publication,
    './patcher-publication-input': input });
  return { getAdminClient: access.getAdminClient, readInput: input.readPatcherPublicationInput, dryRun: dryRun.dryRunPatcherPublication };
}

/** 승인·예산·중복 없는 단일 모집단을 클라이언트 생성 전에 검증합니다. */
function prepare(options) {
  const approval = options?.approval;
  if (approval?.approved !== true || typeof approval.executionEnvironment !== 'string' || !approval.executionEnvironment.trim() ||
    approval.projectHostConfirmed !== true || approval.serviceKeyPresentConfirmed !== true) return null;
  if (!Number.isSafeInteger(options.maxReads) || options.maxReads < 1 || options.maxReads > 20 ||
    !Number.isSafeInteger(options.timeBudgetMs) || options.timeBudgetMs < 1 || options.timeBudgetMs > 60000 ||
    !Array.isArray(options.requests) || options.requests.length < 1 || options.requests.length > options.maxReads ||
    !options.requests.every(validRequest) || !['sample', 'full'].includes(options.coverage)) return null;
  const requests = options.requests.map(({ canonicalSlug, locale }) => Object.freeze({ canonicalSlug, locale }));
  const keys = new Set(requests.map(key));
  if (keys.size !== requests.length) return null;
  if (options.coverage === 'full' && !options.manifest) return null;
  if (options.manifest) {
    const manifest = options.manifest;
    if (approval.cohortManifestConfirmed !== true || manifest.scope !== options.coverage || !Array.isArray(manifest.requests) ||
      !manifest.requests.every(validRequest) || manifest.requests.length !== requests.length) return null;
    const manifestKeys = new Set(manifest.requests.map(key));
    if (manifestKeys.size !== requests.length || [...manifestKeys].some(item => !keys.has(item))) return null;
  }
  return { requests, scope: options.coverage, timeBudgetMs: options.timeBudgetMs };
}

function report(status, scope = 'sample', expected = 0, summary = emptySummary()) {
  return { status, summary, coverage: { scope, expected, processed: summary.total, unprocessed: expected - summary.total,
    fullCoverageComplete: scope === 'full' && status === 'complete' && summary.total === expected } };
}

/** 허용 RPC·정확한 두 인수 외에는 전달하지 않고 global abort를 reader abort와 결합합니다. */
function rpcOnly(client, request, globalSignal) {
  return Object.freeze({ rpc(name, args) {
    if (name !== 'read_patcher_publication_input' || !args || Object.keys(args).length !== 2 ||
      args.p_canonical_slug !== request.canonicalSlug || args.p_locale !== request.locale || globalSignal.aborted)
      throw new Error('AUDIT_RPC_REJECTED');
    const query = client.rpc('read_patcher_publication_input', { p_canonical_slug: request.canonicalSlug, p_locale: request.locale });
    return { abortSignal(localSignal) {
      return query.abortSignal(AbortSignal.any([localSignal, globalSignal]));
    } };
  } });
}

/**
 * 최대 20개를 순차 실행하고 첫 인프라/parse 실패 시 즉시 멈춥니다. 출력은 고정 집계뿐입니다.
 * 시간 만료는 클라이언트 대기/추가 요청을 차단할 뿐 SQL 취소를 보장하지 않습니다.
 */
async function execute(plan, runtime, emit, startedAt) {
  const summary = emptySummary();
  const controller = new AbortController();
  let timer;
  let stopped = false;
  const remaining = plan.timeBudgetMs - (performance.now() - startedAt);
  const expired = new Promise(resolve => {
    timer = setTimeout(() => { controller.abort(); resolve({ status: 'failed', reason: 'RPC_FAILED' }); }, Math.max(0, remaining));
  });
  try {
    if (remaining <= 0) stopped = true;
    const client = stopped ? null : runtime.getAdminClient();
    if (!client) stopped = true;
    for (const request of plan.requests) {
      if (stopped || controller.signal.aborted || performance.now() - startedAt >= plan.timeBudgetMs) { stopped = true; break; }
      const one = await runtime.dryRun([request], async current => {
        const result = await Promise.race([runtime.readInput(current, rpcOnly(client, request, controller.signal)), expired]);
        if (result.status !== 'ready') stopped = true;
        return result;
      });
      for (const field of ['total', 'available', 'latest', 'previous', 'unavailable']) summary[field] += one[field];
      for (const reason of REASONS) summary.reasons[reason] += one.reasons[reason];
      if (one.reasons.READER_FAILED) stopped = true;
      if (controller.signal.aborted || performance.now() - startedAt >= plan.timeBudgetMs) stopped = true;
    }
  } catch { stopped = true; }
  finally { clearTimeout(timer); controller.abort(); }
  const result = report(stopped ? 'stopped' : 'complete', plan.scope, plan.requests.length, summary);
  emit(`${JSON.stringify(result)}\n`);
  return result;
}

/** 오프라인 fixture 전용 진입점입니다. 환경 읽기·라이브러리 import·네트워크 구현을 만들지 않습니다. */
export async function runFixturePublicationAudit(options, runtime, emit = () => {}) {
  const plan = prepare(options);
  if (!plan) return report('rejected');
  return execute(plan, runtime, emit, performance.now());
}

/** 실제 HTTP 전송도 고정 RPC/인수/예산으로 제한하며 SDK의 중복 전송은 네트워크 전에 차단합니다. */
export function createAuditTransport(plan, startedAt, request = fetch) {
  const sent = new Set();
  const allowed = new Set(plan.requests.map(item => JSON.stringify({ p_canonical_slug: item.canonicalSlug, p_locale: item.locale })));
  return async (input, init) => {
    const target = new URL(typeof input === 'string' ? input : input.url);
    const body = typeof init?.body === 'string' ? init.body : '';
    if (target.href !== `https://${PROJECT_HOST}/rest/v1/rpc/read_patcher_publication_input` ||
      init?.method !== 'POST' || !allowed.has(body) || sent.has(body) || sent.size >= plan.requests.length ||
      performance.now() - startedAt >= plan.timeBudgetMs) throw new Error('AUDIT_TRANSPORT_REJECTED');
    sent.add(body);
    // 307/308의 자동 재전송도 허용 RPC/횟수 경계를 우회할 수 있어 호출자 옵션보다 우선 차단합니다.
    return request(input, { ...init, redirect: 'error' });
  };
}

/**
 * 명시 호출 전에는 아무 작업도 시작하지 않습니다. 실제 운영 승인/환경/모집단은 별도 확정해야 합니다.
 * 승인된 실행에서만 현재 프로세스의 URL/서비스키를 읽으며 값은 출력하거나 반환하지 않습니다.
 */
export async function runApprovedPublicationAudit(options, emit = text => process.stdout.write(text)) {
  const plan = prepare(options);
  if (!plan) return report('rejected');
  const startedAt = performance.now();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let projectMatches = false;
  try {
    const parsed = new URL(url);
    projectMatches = parsed.protocol === 'https:' && parsed.hostname === PROJECT_HOST && !parsed.port &&
      !parsed.username && !parsed.password && parsed.pathname === '/' && !parsed.search && !parsed.hash;
  } catch { /* 환경 원문은 보고하지 않습니다. */ }
  if (!projectMatches || typeof serviceKey !== 'string' || !serviceKey.trim()) return report('rejected');
  try {
    const supabase = await import('@supabase/supabase-js');
    const transport = createAuditTransport(plan, startedAt);
    const restrictedSupabase = { createClient(projectUrl, key, config) {
      return supabase.createClient(projectUrl, key, { ...config, global: { fetch: transport } });
    } };
    const runtime = await loadAuditModules({ supabase: restrictedSupabase, env: { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: serviceKey } });
    return await execute(plan, runtime, emit, startedAt);
  } catch { return report('stopped', plan.scope, plan.requests.length); }
}

