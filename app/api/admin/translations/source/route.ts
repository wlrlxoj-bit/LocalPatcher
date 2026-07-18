import { NextResponse } from 'next/server';
import { requireTranslationAdmin } from '@/lib/server/translation/admin-auth';
import { translationErrorStatus } from '@/lib/server/translation/errors';
import { loadTranslationSource } from '@/lib/server/translation/source';
import { isTargetLanguage } from '@/lib/server/translation/types';

export async function GET(request: Request) {
  if (!requireTranslationAdmin(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const url = new URL(request.url);
    const trainerId = Number(url.searchParams.get('trainerId'));
    const targetLanguage = url.searchParams.get('targetLanguage');
    if (!Number.isInteger(trainerId) || !isTargetLanguage(targetLanguage)) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    const source = await loadTranslationSource(trainerId, targetLanguage);
    const pendingSlots = source.targets.map((target) => ({ mappingId: target.id, offsetDec: target.offset_dec, translatedText: target.translated_text, status: target.translation_status, approved: target.is_approved }));
    return NextResponse.json({ trainerId, targetLanguage, sourceMappingId: source.sourceMappingId, sourceMappingIds: source.sourceMappingIds, sourceVersion: source.sourceVersion, sourceSlots: source.slots, items: source.items, pending: pendingSlots[0] ?? null, pendingSlots });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'source_failed' }, { status: translationErrorStatus(error) });
  }
}
