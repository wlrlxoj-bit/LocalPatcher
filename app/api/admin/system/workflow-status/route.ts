import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { isValidAdminSession, ADMIN_SESSION_COOKIE } from '@/lib/admin-session';

// 실행 API와 동일하게 서버에 고정한 자동화만 상태를 조회할 수 있습니다.
const ALLOWED_WORKFLOWS = new Set(['scraper.yml', 'maintenance.yml']);
const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' };

type GitHubRun = {
  id?: unknown;
  status?: unknown;
  conclusion?: unknown;
  html_url?: unknown;
  updated_at?: unknown;
  created_at?: unknown;
  event?: unknown;
  run_attempt?: unknown;
};

function stringValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function runSnapshot(run: GitHubRun | undefined) {
  if (!run) return null;
  const status = stringValue(run.status) ?? 'unknown';
  const conclusion = stringValue(run.conclusion);
  const attempt = typeof run.run_attempt === 'number' && Number.isSafeInteger(run.run_attempt)
    ? run.run_attempt
    : 1;
  const operationalState = status === 'queued'
    ? 'queued'
    : status === 'in_progress'
      ? 'running'
      : status !== 'completed'
        ? 'unknown'
        : conclusion === 'success'
          ? 'succeeded'
          : conclusion === 'cancelled'
            ? 'cancelled'
            : conclusion === 'skipped'
              ? 'skipped'
              : 'failed';
  return {
    runId: typeof run.id === 'number' && Number.isSafeInteger(run.id) ? run.id : null,
    status,
    conclusion,
    operationalState,
    attempt,
    retrying: attempt > 1,
    url: stringValue(run.html_url),
    createdAt: stringValue(run.created_at),
    updatedAt: stringValue(run.updated_at),
  };
}

function dispatchReference(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  // 미래 시각 또는 너무 오래된 값으로 임의 실행을 가리키지 못하게 제한합니다.
  if (Number.isNaN(date.getTime()) || date.getTime() > Date.now() + 60_000 || date.getTime() < Date.now() - 3_600_000) return null;
  return date;
}

export async function GET(req: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
    if (!isValidAdminSession(token)) {
      return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401, headers: NO_STORE_HEADERS });
    }

    const requestUrl = new URL(req.url);
    const workflowId = requestUrl.searchParams.get('workflowId');
    if (typeof workflowId !== 'string' || !ALLOWED_WORKFLOWS.has(workflowId)) {
      return NextResponse.json({ error: 'WORKFLOW_NOT_ALLOWED' }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const githubPat = process.env.GITHUB_PAT;
    if (!githubPat) {
      return NextResponse.json({ error: 'WORKFLOW_STATUS_UNAVAILABLE' }, { status: 503, headers: NO_STORE_HEADERS });
    }

    const response = await fetch(
      `https://api.github.com/repos/wlrlxoj-bit/LocalPatcher/actions/workflows/${workflowId}/runs?per_page=20`,
      {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          Authorization: `Bearer ${githubPat}`,
          'User-Agent': 'LocalPatcher-Admin',
        },
        cache: 'no-store',
      },
    );
    if (!response.ok) {
      console.error('GitHub workflow status request failed', { status: response.status, workflowId });
      return NextResponse.json({ error: 'WORKFLOW_STATUS_UNAVAILABLE' }, { status: 502, headers: NO_STORE_HEADERS });
    }

    const payload: unknown = await response.json();
    const workflowRuns = payload && typeof payload === 'object' && Array.isArray((payload as { workflow_runs?: unknown }).workflow_runs)
      ? (payload as { workflow_runs: GitHubRun[] }).workflow_runs
      : [];
    const requestedAt = dispatchReference(requestUrl.searchParams.get('dispatchRequestedAt'));
    const manualRunsAfterDispatch = requestedAt
      ? workflowRuns.filter((run) => stringValue(run.event) === 'workflow_dispatch'
        && (() => {
          const createdAt = stringValue(run.created_at);
          const created = createdAt ? new Date(createdAt) : null;
          // GitHub 기록 시간의 짧은 오차를 허용하되 예약 실행은 event 필터로 제외합니다.
          return created && !Number.isNaN(created.getTime()) && created.getTime() >= requestedAt.getTime() - 15_000;
        })())
      : [];
    const trackedRun = manualRunsAfterDispatch[0];
    const latestRun = workflowRuns[0];
    const latestSuccess = workflowRuns.find((run) => stringValue(run.status) === 'completed' && stringValue(run.conclusion) === 'success');

    return NextResponse.json({
      // dispatchRequestedAt가 있으면 다른 예약 실행 대신 방금 요청한 실행만 우선 보여줍니다.
      tracking: requestedAt ? (trackedRun ? 'matched_dispatch' : 'awaiting_dispatch_run') : 'latest_run',
      run: runSnapshot(trackedRun ?? latestRun),
      latestSuccess: runSnapshot(latestSuccess),
    }, { headers: NO_STORE_HEADERS });
  } catch {
    return NextResponse.json({ error: 'WORKFLOW_STATUS_UNAVAILABLE' }, { status: 502, headers: NO_STORE_HEADERS });
  }
}
