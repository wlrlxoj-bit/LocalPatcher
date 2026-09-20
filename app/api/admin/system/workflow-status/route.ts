import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { isValidAdminSession, ADMIN_SESSION_COOKIE } from '@/lib/admin-session';

// 실행 API와 동일하게 서버에 고정한 자동화만 상태를 조회할 수 있습니다.
const ALLOWED_WORKFLOWS = new Set(['scraper.yml', 'maintenance.yml']);
const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' };

export async function GET(req: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
    if (!isValidAdminSession(token)) {
      return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401, headers: NO_STORE_HEADERS });
    }

    const workflowId = new URL(req.url).searchParams.get('workflowId');
    if (typeof workflowId !== 'string' || !ALLOWED_WORKFLOWS.has(workflowId)) {
      return NextResponse.json({ error: 'WORKFLOW_NOT_ALLOWED' }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const githubPat = process.env.GITHUB_PAT;
    if (!githubPat) {
      return NextResponse.json({ error: 'WORKFLOW_STATUS_UNAVAILABLE' }, { status: 503, headers: NO_STORE_HEADERS });
    }

    const response = await fetch(
      `https://api.github.com/repos/wlrlxoj-bit/LocalPatcher/actions/workflows/${workflowId}/runs?per_page=1`,
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
      ? (payload as { workflow_runs: Array<Record<string, unknown>> }).workflow_runs
      : [];
    const latestRun = workflowRuns[0];
    if (!latestRun) {
      return NextResponse.json({ status: 'unknown', conclusion: null, url: null }, { headers: NO_STORE_HEADERS });
    }

    return NextResponse.json({
      status: typeof latestRun.status === 'string' ? latestRun.status : 'unknown',
      conclusion: typeof latestRun.conclusion === 'string' ? latestRun.conclusion : null,
      url: typeof latestRun.html_url === 'string' ? latestRun.html_url : null,
      updatedAt: typeof latestRun.updated_at === 'string' ? latestRun.updated_at : null,
    }, { headers: NO_STORE_HEADERS });
  } catch {
    return NextResponse.json({ error: 'WORKFLOW_STATUS_UNAVAILABLE' }, { status: 502, headers: NO_STORE_HEADERS });
  }
}
