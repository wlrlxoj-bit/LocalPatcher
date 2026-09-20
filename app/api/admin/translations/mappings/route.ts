import { NextResponse } from 'next/server';
import { getAdminClient, requireAdmin } from '@/lib/server/admin/access';

export async function GET(request: Request) {
  if (!requireAdmin(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const trainerId = Number(new URL(request.url).searchParams.get('trainerId'));
  if (!Number.isSafeInteger(trainerId) || trainerId <= 0) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  const client = getAdminClient();
  if (!client) return NextResponse.json({ error: 'server_not_configured' }, { status: 503 });
  const { data, error } = await client.from('translation_mappings')
    .select('id,offset_dec,encoding,original_text,translated_text,max_char_len,is_approved,translation_status,translation_provider')
    .eq('trainer_id', trainerId)
    .order('offset_dec', { ascending: true });
  if (error) return NextResponse.json({ error: 'mappings_read_failed' }, { status: 503 });
  return NextResponse.json({ mappings: data ?? [] });
}
