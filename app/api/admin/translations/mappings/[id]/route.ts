import { NextResponse } from 'next/server';
import { getAdminClient, requireAdmin } from '@/lib/server/admin/access';
import { revalidatePatcherForTrainer } from '@/lib/server/admin/revalidate-patcher';

const MAX_MAPPING_LENGTH = 10_000;
type SupportedEncoding = 'UTF-16LE' | 'UTF-8' | 'ASCII';
const SUPPORTED_ENCODINGS: Record<SupportedEncoding, BufferEncoding> = {
  'UTF-16LE': 'utf16le',
  'UTF-8': 'utf8',
  ASCII: 'ascii',
};

function normalizeEncoding(value: unknown) {
  return typeof value === 'string' ? value.toUpperCase().replace(/_/g, '-') : '';
}

/** 바이너리 슬롯의 실제 바이트 용량을 넘지 않도록 수동 번역도 자동 검증과 같은 한도를 적용합니다. */
function isTranslationWithinSlot(translatedText: string, encoding: unknown, maxCharLen: unknown) {
  const normalizedEncoding = normalizeEncoding(encoding);
  if (!(normalizedEncoding in SUPPORTED_ENCODINGS) || typeof maxCharLen !== 'number' || !Number.isSafeInteger(maxCharLen) || maxCharLen <= 0) return false;
  const supportedEncoding = normalizedEncoding as SupportedEncoding;
  const slotLength = maxCharLen;
  const bufferEncoding = SUPPORTED_ENCODINGS[supportedEncoding];
  if (supportedEncoding === 'ASCII' && /[^\x00-\x7F]/.test(translatedText)) return false;
  const capacity = supportedEncoding === 'UTF-16LE' ? slotLength * 2 : slotLength;
  return Buffer.byteLength(translatedText, bufferEncoding) <= capacity;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!requireAdmin(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const client = getAdminClient();
  const id = Number((await context.params).id);
  if (!client) return NextResponse.json({ error: 'server_not_configured' }, { status: 503 });
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  try {
    const body = await request.json() as { translatedText?: unknown };
    if (typeof body.translatedText !== 'string' || body.translatedText.trim().length === 0 || body.translatedText.includes('\0') || body.translatedText.length > MAX_MAPPING_LENGTH) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    const { data: existing, error: existingError } = await client.from('translation_mappings')
      .select('id,trainer_id,encoding,max_char_len,translated_text')
      .eq('id', id)
      .maybeSingle();
    if (existingError) return NextResponse.json({ error: 'mapping_read_failed' }, { status: 503 });
    if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    if (!isTranslationWithinSlot(body.translatedText, existing.encoding, existing.max_char_len)) {
      return NextResponse.json({ error: 'mapping_slot_constraint_failed' }, { status: 422 });
    }
    // DB 함수가 현재 본문을 다시 잠그고 retry queue를 한 transaction에서 비웁니다.
    // 따라서 수동 저장 직후 자동 워커가 같은 슬롯을 덮어쓰지 못합니다.
    const { data, error } = await client.rpc('save_manual_translation_mapping', {
      p_mapping_id: id,
      p_expected_translated_text: existing.translated_text,
      p_translated_text: body.translatedText,
    });
    if (error) return NextResponse.json({ error: 'mapping_update_failed' }, { status: 503 });
    if (!data || typeof data !== 'object') return NextResponse.json({ error: 'mapping_update_failed' }, { status: 503 });
    const outcome = data as { outcome?: string; mapping?: unknown };
    if (outcome.outcome === 'not_found') return NextResponse.json({ error: 'not_found' }, { status: 404 });
    if (outcome.outcome === 'concurrent_change') return NextResponse.json({ error: 'mapping_changed_refresh_required' }, { status: 409 });
    if (outcome.outcome !== 'pending_manual_review' || !outcome.mapping) return NextResponse.json({ error: 'mapping_update_failed' }, { status: 503 });
    await revalidatePatcherForTrainer(client, existing.trainer_id);
    return NextResponse.json({
      mapping: outcome.mapping,
      requiresApproval: true,
      review_status: 'pending',
    });
  } catch {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }
}
