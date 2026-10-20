import { pathToFileURL } from 'node:url';
import { AUDIT, verifyAuditGate } from './seo-readonly-audit-gate.mjs';

export const REQUESTS = Object.freeze([
  Object.freeze({ canonicalSlug: 'digimon-story-time-stranger', locale: 'ko' }),
  Object.freeze({ canonicalSlug: 'assassins-creed-black-flag-resynced', locale: 'ja' }),
  Object.freeze({ canonicalSlug: 'elden-ring', locale: 'ko' }),
]);

/** 고정 N=3 sample만 실행합니다. 승인 실패는 harness import/DB 접근 전에 거부됩니다. */
export async function runAuditOnce({ env = process.env, gate = verifyAuditGate,
  load = () => import('./patcher-publication-audit.mjs'), emit = text => process.stdout.write(text) } = {}) {
  if (!await gate(env)) {
    emit('{"status":"rejected","sampleCoverage":false}\n');
    return false;
  }
  try {
    const { runApprovedPublicationAudit } = await load();
    const result = await runApprovedPublicationAudit({
      approval: { approved: true, executionEnvironment: AUDIT.environment,
        projectHostConfirmed: true, serviceKeyPresentConfirmed: true },
      requests: REQUESTS, coverage: 'sample', maxReads: 3, timeBudgetMs: 60000,
    }, () => {});
    // harness의 고정 집계만 노출하고 모집단 전체 완료나 색인 승인을 주장하지 않습니다.
    emit(`${JSON.stringify({ ...result, sampleCoverage: false })}\n`);
    return result.status === 'complete';
  } catch {
    emit('{"status":"stopped","sampleCoverage":false}\n');
    return false;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runAuditOnce() ? 0 : 1;
}
