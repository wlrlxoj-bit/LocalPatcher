import { NextResponse } from 'next/server';
import { requireTranslationAdmin } from '@/lib/server/translation/admin-auth';
import { getTranslationAdminClient } from '@/lib/server/translation/db';

export async function POST(request: Request) {
  if (!requireTranslationAdmin(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const client = getTranslationAdminClient();
  if (!client) return NextResponse.json({ error: 'server_not_configured' }, { status: 503 });
  try {
    const body = await request.json() as { jobId?: string; edits?: Array<{ key?: string; translatedText?: string }> };
    if (!body.jobId || !Array.isArray(body.edits) || body.edits.length > 500 || body.edits.some((edit) => !edit.key || typeof edit.translatedText !== 'string')) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    const { data, error } = await client.rpc('approve_translation_job', { p_job_id: body.jobId, p_edits: body.edits });
    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'approval_failed' }, { status: 400 });
  }
}
