import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { AUDIT, isApprovedAuditEvent, verifyAuditHistory } from '../scripts/seo-readonly-audit-gate.mjs';
import { REQUESTS, runAuditOnce } from '../scripts/seo-readonly-audit-once.mjs';
import { createAuditTransport } from '../scripts/patcher-publication-audit.mjs';

// 구현 전 고정한 시나리오: 최초 생성 1회/재push·재생성·rerun 거절/이력 불명확 fail-closed,
// 승인 실패 import·DB 0회/N=3 sample/step별 secret 격리/exact Vercel skip/배포 명령 0개.
const sha = 'a'.repeat(40);
const env = { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'push', GITHUB_REPOSITORY: AUDIT.repository,
  GITHUB_REF: `refs/heads/${AUDIT.branch}`, GITHUB_SHA: sha, GITHUB_RUN_ATTEMPT: '1', GITHUB_RUN_ID: '101',
  AUDIT_APPROVAL_ID: AUDIT.approval, AUDIT_ENVIRONMENT: AUDIT.environment, GH_TOKEN: 'fixture-token',
  GITHUB_WORKFLOW_REF: `${AUDIT.repository}/${AUDIT.workflow}@refs/heads/${AUDIT.branch}` };
const event = { repository: { full_name: AUDIT.repository }, ref: env.GITHUB_REF, after: sha,
  before: '0'.repeat(40), created: true, forced: false, deleted: false };
const current = { id: 101, name: AUDIT.name, path: AUDIT.workflow, event: 'push', head_branch: AUDIT.branch,
  head_sha: sha, run_attempt: 1 };
const response = (runs, total = runs.length) => ({ ok: true, json: async () => ({ total_count: total, workflow_runs: runs }) });
const source = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('실제 HTTP 경계도 정확 RPC POST 3회 이내만 허용하고 자동 재시도/쓰기/외부 URL은 전송 0회다', async () => {
  let calls = 0;
  const url = 'https://ikrowgnkucljngcqpvih.supabase.co/rest/v1/rpc/read_patcher_publication_input';
  const transport = createAuditTransport({ requests: REQUESTS, timeBudgetMs: 60000 }, performance.now(), async (_input, options) => {
    assert.equal(options.redirect, 'error');
    calls += 1; return { ok: true };
  });
  const init = item => ({ method: 'POST', redirect: 'follow', body: JSON.stringify({ p_canonical_slug: item.canonicalSlug, p_locale: item.locale }) });
  for (const [target, options] of [['https://fixture.invalid', init(REQUESTS[0])],
    [url.replace('read_patcher_publication_input', 'write'), init(REQUESTS[0])],
    [url, { ...init(REQUESTS[0]), method: 'GET' }], [url, { method: 'POST', body: '{}' }]]) {
    await assert.rejects(transport(target, options), /AUDIT_TRANSPORT_REJECTED/);
  }
  assert.equal(calls, 0);
  for (const item of REQUESTS) await transport(url, init(item));
  assert.equal(calls, 3);
  await assert.rejects(transport(url, init(REQUESTS[0])), /AUDIT_TRANSPORT_REJECTED/);
  assert.equal(calls, 3);
  const expired = createAuditTransport({ requests: REQUESTS, timeBudgetMs: 1 }, performance.now() - 100, () => assert.fail('전송 금지'));
  await assert.rejects(expired(url, init(REQUESTS[0])), /AUDIT_TRANSPORT_REJECTED/);
});

test('정확한 최초 branch 생성 push만 승인하고 재push/rerun/다른 저장소·승인은 거절한다', () => {
  assert.equal(isApprovedAuditEvent(env, event), true);
  for (const changed of [{ GITHUB_RUN_ATTEMPT: '2' }, { GITHUB_EVENT_NAME: 'workflow_dispatch' },
    { GITHUB_REPOSITORY: 'fixture/fork' }, { AUDIT_APPROVAL_ID: 'another' },
    { AUDIT_ENVIRONMENT: '' }, { GITHUB_WORKFLOW_REF: '' }, { GITHUB_RUN_ID: '' }]) {
    assert.equal(isApprovedAuditEvent({ ...env, ...changed }, event), false);
  }
  for (const changed of [{ created: false }, { forced: true }, { deleted: true }, { before: sha },
    { after: 'b'.repeat(40) }, { repository: { full_name: 'fixture/fork' } }]) {
    assert.equal(isApprovedAuditEvent(env, { ...event, ...changed }), false);
  }
});

test('전체 과거 실행을 GET으로 읽고 이전 동일 승인/path 존재 시 branch 재생성을 거절한다', async () => {
  let calls = 0;
  assert.equal(await verifyAuditHistory(env, async (url, init) => {
    calls += 1;
    assert.equal(url, `https://api.github.com/repos/${AUDIT.repository}/actions/runs?per_page=100&page=1`);
    assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'error');
    return response([current]);
  }), true);
  assert.equal(calls, 1);
  for (const old of [{ ...current, id: 100 }, { ...current, id: 100, name: 'renamed' },
    { ...current, id: 100, path: '.github/workflows/old.yml' }]) {
    assert.equal(await verifyAuditHistory(env, async () => response([current, old])), false);
  }
});

test('모든 페이지를 완전히 읽으며 누락·중복·변동·1000 초과·HTTP 오류는 거절한다', async () => {
  const unrelated = Array.from({ length: 100 }, (_, index) => ({ id: 200 + index, name: 'other', path: 'other.yml' }));
  let calls = 0;
  assert.equal(await verifyAuditHistory(env, async () => response(++calls === 1 ? unrelated : [current], 101)), true);
  assert.equal(calls, 2);
  for (const fixture of [async () => response([], 1), async () => response([current], 1001),
    async () => response([{ ...current, run_attempt: 2 }]), async () => response([{ ...current, head_sha: '' }]),
    async () => response([{ ...current, id: 102 }]), async () => ({ ok: false }),
    async () => { throw new Error('private fixture'); }]) {
    assert.equal(await verifyAuditHistory(env, fixture), false);
  }
  calls = 0;
  assert.equal(await verifyAuditHistory(env, async () => response(++calls === 1 ? unrelated : [current], calls === 1 ? 101 : 102)), false);
  calls = 0;
  assert.equal(await verifyAuditHistory(env, async () => response(++calls === 1 ? unrelated : [unrelated[0]], 101)), false);
  assert.equal(await verifyAuditHistory({ ...env, GH_TOKEN: '' }, () => assert.fail('요청 금지')), false);
});

test('승인 실패는 harness import·DB 0회이며 N=3 sample 예산과 고정 집계만 전달한다', async () => {
  let loads = 0;
  let output = '';
  assert.equal(await runAuditOnce({ env, gate: async () => false,
    load: () => { loads += 1; assert.fail('import 금지'); }, emit: text => { output += text; } }), false);
  assert.equal(loads, 0); assert.deepEqual(JSON.parse(output), { status: 'rejected', sampleCoverage: false });
  output = '';
  const result = { status: 'complete', summary: { total: 3 }, coverage: { scope: 'sample', fullCoverageComplete: false } };
  assert.equal(await runAuditOnce({ env, gate: async () => true, emit: text => { output += text; },
    load: async () => ({ runApprovedPublicationAudit: async (options, emit) => {
      loads += 1; assert.equal(options.maxReads, 3); assert.equal(options.timeBudgetMs, 60000);
      assert.equal(options.coverage, 'sample'); assert.deepEqual(options.requests, REQUESTS);
      assert.equal(options.approval.executionEnvironment, AUDIT.environment);
      emit('무시할 내부 출력'); return result;
    } }) }), true);
  assert.equal(loads, 1); assert.deepEqual(JSON.parse(output), { ...result, sampleCoverage: false });
  assert.deepEqual(REQUESTS, [
    { canonicalSlug: 'digimon-story-time-stranger', locale: 'ko' },
    { canonicalSlug: 'assassins-creed-black-flag-resynced', locale: 'ja' },
    { canonicalSlug: 'elden-ring', locale: 'ko' },
  ]);
});

test('workflow는 최초 push/환경 승인/정확 branch/최소 권한/step secret/무배포 계약을 보존한다', async () => {
  const workflow = await source(AUDIT.workflow);
  assert.match(workflow, /branches: \[codex\/seo-readonly-audit-once-20261020\]/);
  assert.doesNotMatch(workflow, /workflow_dispatch|pull_request|schedule:|cancel-in-progress: true/);
  for (const gate of ['github.event.created == true', 'github.event.forced == false',
    'github.event.deleted == false', 'github.run_attempt == 1', 'persist-credentials: false',
    'environment: seo-readonly-audit-20261020', 'contents: read', 'actions: read']) assert.ok(workflow.includes(gate));
  const beforeAudit = workflow.slice(0, workflow.indexOf('      - name: 승인된 3개'));
  assert.doesNotMatch(beforeAudit, /secrets\./);
  const secrets = [...workflow.matchAll(/secrets\.([A-Z_]+)/g)].map(match => match[1]);
  assert.deepEqual(secrets, ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
  for (const match of workflow.matchAll(/uses: (\S+)/g)) assert.match(match[1], /@[0-9a-f]{40}$/);
  assert.equal((workflow.match(/npm ci --ignore-scripts --no-audit --no-fund/g) || []).length, 2);
  assert.doesNotMatch(workflow, /\b(?:vercel|revalidate|enqueue|repair-translations|scraper|npm run build)\b/);
  assert.deepEqual(JSON.parse(await source('vercel.json')), { git: { deploymentEnabled: { [AUDIT.branch]: false } } });
});
