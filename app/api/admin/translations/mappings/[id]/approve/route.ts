import { NextResponse } from 'next/server';
import { getAdminClient, requireAdmin } from '@/lib/server/admin/access';
import { revalidatePatcherForTrainer } from '@/lib/server/admin/revalidate-patcher';

/** 수동 편집된 단일 슬롯만 명시적으로 공개 승인한다. 본문 값은 신뢰하지 않는다. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!requireAdmin(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const client = getAdminClient();
  const id = Number((await context.params).id);
  if (!client) return NextResponse.json({ error: 'server_not_configured' }, { status: 503 });
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });

  const { data: existing, error: existingError } = await client.from('translation_mappings')
    .select('id,trainer_id')
    .eq('id', id)
    .maybeSingle();
  if (existingError) return NextResponse.json({ error: 'mapping_read_failed' }, { status: 503 });
  if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const { data, error } = await client.rpc('approve_manual_translation_mapping', { p_mapping_id: id });
  if (error || !data || typeof data !== 'object') return NextResponse.json({ error: 'mapping_approval_failed' }, { status: 503 });
  const result = data as { outcome?: string; mapping?: unknown };
  if (result.outcome === 'not_found') return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (result.outcome === 'already_approved') return NextResponse.json({ error: 'already_approved' }, { status: 409 });
  if (result.outcome !== 'approved_manual_review' || !result.mapping) return NextResponse.json({ error: 'mapping_not_pending_manual_review' }, { status: 409 });
  await revalidatePatcherForTrainer(client, existing.trainer_id);
  return NextResponse.json({ mapping: result.mapping, review_status: 'approved' });
}
