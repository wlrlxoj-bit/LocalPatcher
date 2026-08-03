import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { isValidAdminSession, ADMIN_SESSION_COOKIE } from '@/lib/admin-session';

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
    
    if (!isValidAdminSession(token)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { workflowId } = await req.json();
    if (!workflowId) {
      return NextResponse.json({ error: 'workflowId is required' }, { status: 400 });
    }

    const githubPat = process.env.GITHUB_PAT;
    if (!githubPat) {
      return NextResponse.json({ 
        error: '서버 환경 변수에 GITHUB_PAT(GitHub Personal Access Token)이 누락되어 GitHub Actions를 실행할 수 없습니다.' 
      }, { status: 500 });
    }

    // Trigger GitHub Action using workflow_dispatch event
    const response = await fetch(`https://api.github.com/repos/wlrlxoj-bit/LocalPatcher/actions/workflows/${workflowId}/dispatches`, {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `Bearer ${githubPat}`,
        'Content-Type': 'application/json',
        'User-Agent': 'LocalPatcher-Admin'
      },
      body: JSON.stringify({
        ref: 'main', // Branch to run the workflow on
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('GitHub API error:', errorText);
      return NextResponse.json({ error: `GitHub API 연동 실패: ${response.status} ${response.statusText}` }, { status: response.status });
    }
    
    return NextResponse.json({ success: true, message: `Workflow '${workflowId}' has been dispatched successfully.` });
  } catch (error: any) {
    console.error('Failed to trigger workflow:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
