import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const AUDIT = Object.freeze({
  repository: 'wlrlxoj-bit/LocalPatcher',
  branch: 'codex/seo-readonly-audit-once-20261020',
  environment: 'seo-readonly-audit-20261020',
  approval: 'seo-audit-approval-20261020-01',
  workflow: '.github/workflows/seo-readonly-audit-once.yml',
  name: 'seo-audit-approval-20261020-01',
});

/** 실행 식별과 최초 branch 생성 push를 확인하며 불명확한 상태는 모두 거절합니다. */
export function isApprovedAuditEvent(env, event) {
  return env.GITHUB_ACTIONS === 'true' && env.GITHUB_EVENT_NAME === 'push' &&
    env.GITHUB_REPOSITORY === AUDIT.repository && event?.repository?.full_name === AUDIT.repository &&
    env.GITHUB_REF === `refs/heads/${AUDIT.branch}` && event.ref === env.GITHUB_REF &&
    event.created === true && event.forced === false && event.deleted === false &&
    event.before === '0'.repeat(40) && /^[0-9a-f]{40}$/.test(env.GITHUB_SHA ?? '') &&
    event.after === env.GITHUB_SHA && env.GITHUB_RUN_ATTEMPT === '1' &&
    /^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID ?? '') && env.AUDIT_APPROVAL_ID === AUDIT.approval &&
    env.AUDIT_ENVIRONMENT === AUDIT.environment &&
    env.GITHUB_WORKFLOW_REF === `${AUDIT.repository}/${AUDIT.workflow}@refs/heads/${AUDIT.branch}`;
}

/**
 * 저장소 전체 실행 이력을 최대 10페이지까지 완전히 읽습니다. 이전 동일 승인/경로의 실행,
 * 이력 누락·페이지 변동·상한 초과·응답 오류는 재생성/재시도 허가로 해석하지 않습니다.
 * 인증값·API 응답·오류 본문은 출력하지 않습니다. 쓰기 API나 재시도는 없습니다.
 */
export async function verifyAuditHistory(env, request = fetch) {
  if (typeof env.GH_TOKEN !== 'string' || !env.GH_TOKEN.trim()) return false;
  const current = Number(env.GITHUB_RUN_ID);
  if (!Number.isSafeInteger(current) || current < 1) return false;
  const seen = new Set();
  let total;
  let currentFound = false;
  const signal = AbortSignal.timeout(30000);
  try {
    for (let page = 1; page <= 10; page += 1) {
      const response = await request(`https://api.github.com/repos/${AUDIT.repository}/actions/runs?per_page=100&page=${page}`, {
        method: 'GET', redirect: 'error', signal,
        headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${env.GH_TOKEN}`,
          'X-GitHub-Api-Version': '2022-11-28' },
      });
      if (!response.ok) return false;
      const data = await response.json();
      if (!Number.isSafeInteger(data.total_count) || data.total_count < 1 || data.total_count > 1000 ||
        !Array.isArray(data.workflow_runs)) return false;
      if (total === undefined) total = data.total_count;
      if (total !== data.total_count || data.workflow_runs.length !== Math.min(100, total - seen.size)) return false;
      for (const run of data.workflow_runs) {
        if (!Number.isSafeInteger(run.id) || seen.has(run.id) || typeof run.name !== 'string' ||
          typeof run.path !== 'string') return false;
        seen.add(run.id);
        const sameApproval = run.name === AUDIT.name || run.path.split('@')[0] === AUDIT.workflow;
        if (sameApproval && run.id !== current) return false;
        if (run.id === current) {
          if (!sameApproval || run.name !== AUDIT.name || run.path.split('@')[0] !== AUDIT.workflow ||
            run.event !== 'push' || run.head_branch !== AUDIT.branch || run.head_sha !== env.GITHUB_SHA ||
            run.run_attempt !== 1) return false;
          currentFound = true;
        }
      }
      if (seen.size === total) return currentFound;
    }
  } catch { /* 비공개 인증·응답·오류를 노출하지 않습니다. */ }
  return false;
}

/** GitHub 제공 이벤트 파일만 읽고, 현재 실행과 전체 과거 실행의 계약을 함께 확인합니다. */
export async function verifyAuditGate(env = process.env, request = fetch) {
  try {
    const event = JSON.parse(await readFile(env.GITHUB_EVENT_PATH, 'utf8'));
    return isApprovedAuditEvent(env, event) && await verifyAuditHistory(env, request);
  } catch { return false; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await verifyAuditGate() ? 0 : 1;
}
