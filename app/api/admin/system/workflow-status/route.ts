import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { isValidAdminSession, ADMIN_SESSION_COOKIE } from '@/lib/admin-session';

export async function GET(req: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
    
    if (!isValidAdminSession(token)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const workflowId = searchParams.get('workflowId');
    if (!workflowId) {
      return NextResponse.json({ error: 'workflowId is required' }, { status: 400 });
    }

    const githubPat = process.env.GITHUB_PAT;
    if (!githubPat) {
      return NextResponse.json({ error: 'GITHUB_PAT environment variable is missing.' }, { status: 500 });
    }

    const response = await fetch(`https://api.github.com/repos/wlrlxoj-bit/LocalPatcher/actions/workflows/${workflowId}/runs?per_page=1`, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `Bearer ${githubPat}`,
        'User-Agent': 'LocalPatcher-Admin'
      },
      // cache: 'no-store' is critical to avoid Next.js caching this API call
      cache: 'no-store'
    });

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch workflow runs' }, { status: response.status });
    }

    const data = await response.json();
    const latestRun = data.workflow_runs?.[0];

    if (!latestRun) {
      return NextResponse.json({ status: 'unknown', conclusion: null, url: null });
    }

    return NextResponse.json({
      status: latestRun.status,
      conclusion: latestRun.conclusion,
      url: latestRun.html_url,
      updatedAt: latestRun.updated_at
    });
  } catch (error: any) {
    console.error('Failed to get workflow status:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
