import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { isValidAdminSession, ADMIN_SESSION_COOKIE } from '@/lib/admin-session';

// 관리자 화면에서 안전하게 수동 실행할 수 있는 워크플로만 서버에 고정합니다.
const ALLOWED_WORKFLOWS = new Set(['scraper.yml', 'maintenance.yml']);

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
    if (!isValidAdminSession(token)) {
      return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    }

    const body: unknown = await req.json();
    const workflowId = body && typeof body === 'object' ? (body as { workflowId?: unknown }).workflowId : undefined;
    if (typeof workflowId !== 'string' || !ALLOWED_WORKFLOWS.has(workflowId)) {
      return NextResponse.json({ error: 'WORKFLOW_NOT_ALLOWED' }, { status: 400 });
    }

    const githubPat = process.env.GITHUB_PAT;
    if (!githubPat) {
      return NextResponse.json({ error: 'WORKFLOW_DISPATCH_UNAVAILABLE' }, { status: 503 });
    }

    const response = await fetch(
      `https://api.github.com/repos/wlrlxoj-bit/LocalPatcher/actions/workflows/${workflowId}/dispatches`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github.v3+json',
          Authorization: `Bearer ${githubPat}`,
          'Content-Type': 'application/json',
          'User-Agent': 'LocalPatcher-Admin',
        },
        body: JSON.stringify({ ref: 'main' }),
      },
    );

    if (!response.ok) {
      console.error('GitHub workflow dispatch failed', { status: response.status, workflowId });
      return NextResponse.json({ error: 'WORKFLOW_DISPATCH_FAILED' }, { status: 502 });
    }
    return NextResponse.json({ success: true, workflowId });
  } catch {
    return NextResponse.json({ error: 'WORKFLOW_DISPATCH_FAILED' }, { status: 502 });
  }
}
