import { NextResponse } from 'next/server';
import { requireTranslationAdmin } from '@/lib/server/translation/admin-auth';
import { runTranslation } from '@/lib/server/translation/service';
import { isTargetLanguage, type TranslationProvider } from '@/lib/server/translation/types';
import { translationErrorStatus } from '@/lib/server/translation/errors';

export async function POST(request: Request) {
  if (!requireTranslationAdmin(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const body = await request.json() as { provider?: TranslationProvider; trainerId?: number; targetLanguage?: unknown; previewHash?: string; paidConsent?: boolean; idempotencyKey?: string };
    if ((body.provider !== 'azure' && body.provider !== 'openai_paid') || !Number.isInteger(body.trainerId) || !isTargetLanguage(body.targetLanguage) || !body.previewHash || !body.idempotencyKey) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    return NextResponse.json(await runTranslation({ provider: body.provider, trainerId: body.trainerId as number, targetLanguage: body.targetLanguage, previewHash: body.previewHash, paidConsent: body.paidConsent, idempotencyKey: body.idempotencyKey }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'translation_failed' }, { status: translationErrorStatus(error) });
  }
}
