import { NextResponse } from 'next/server';
import { requireTranslationAdmin } from '@/lib/server/translation/admin-auth';
import { createTranslationPreview } from '@/lib/server/translation/service';
import { isTargetLanguage, type TranslationProvider } from '@/lib/server/translation/types';
import { translationErrorStatus } from '@/lib/server/translation/errors';

export async function POST(request: Request) {
  if (!requireTranslationAdmin(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const body = await request.json() as { provider?: TranslationProvider; trainerId?: number; targetLanguage?: unknown };
    const provider = body.provider || 'azure';
    if ((provider !== 'azure' && provider !== 'openai_paid') || !Number.isInteger(body.trainerId) || !isTargetLanguage(body.targetLanguage)) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    return NextResponse.json(await createTranslationPreview(provider, body.trainerId as number, body.targetLanguage));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'preview_failed' }, { status: translationErrorStatus(error) });
  }
}
