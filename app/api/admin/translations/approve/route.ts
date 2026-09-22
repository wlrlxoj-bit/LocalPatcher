import { NextResponse } from 'next/server';
import { requireTranslationAdmin } from '@/lib/server/translation/admin-auth';
import { getTranslationAdminClient } from '@/lib/server/translation/db';
import { revalidatePatcherForTrainer } from '@/lib/server/admin/revalidate-patcher';

export async function POST(request: Request) {
  if (!requireTranslationAdmin(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const client = getTranslationAdminClient();
  if (!client) return NextResponse.json({ error: 'server_not_configured' }, { status: 503 });
  try {
    const body = await request.json() as { jobId?: string; edits?: Array<{ key?: string; translatedText?: string }> };
    if (!body.jobId || !Array.isArray(body.edits) || body.edits.length > 500 || body.edits.some((edit) => !edit.key || typeof edit.translatedText !== 'string')) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    const { data, error } = await client.rpc('approve_translation_job', { p_job_id: body.jobId, p_edits: body.edits });
    if (error) throw error;
    const trainerId = data && typeof data === 'object' ? (data as { trainerId?: unknown }).trainerId : null;
    if (typeof trainerId === 'number' && Number.isSafeInteger(trainerId) && trainerId > 0) {
      // 승인 RPC는 이미 원자적으로 끝났다. ISR 장애가 승인 자체를 실패 응답으로
      // 바꾸면 관리자가 같은 작업을 불필요하게 다시 제출하게 되므로 분리한다.
      try {
        await revalidatePatcherForTrainer(client, trainerId);
      } catch {
        console.error('Patcher ISR revalidation failed after translation approval');
      }
    }
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'approval_failed' }, { status: 400 });
  }
}
