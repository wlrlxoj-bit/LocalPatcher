import { NextResponse } from 'next/server';
import { requireTranslationAdmin } from '@/lib/server/translation/admin-auth';
import { getTranslationAdminClient } from '@/lib/server/translation/db';
import { isTranslationProvider, type TranslationProvider } from '@/lib/server/translation/types';

const MAX_MONTHLY_CHARACTERS = 1_000_000_000;

function currentMonthStart() {
  return `${new Date().toISOString().slice(0, 7)}-01`;
}

export async function GET(request: Request) {
  if (!requireTranslationAdmin(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const client = getTranslationAdminClient();
  if (!client) return NextResponse.json({ error: 'server_not_configured' }, { status: 503 });
  const provider = new URL(request.url).searchParams.get('provider');
  if (!isTranslationProvider(provider)) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  const { data, error } = await client.from('translation_usage_monthly')
    .select('used_characters,reserved_characters,hard_limit_characters')
    .eq('month_start', currentMonthStart())
    .eq('provider', provider)
    .maybeSingle();
  if (error) return NextResponse.json({ error: 'usage_read_failed' }, { status: 503 });
  const defaultLimit = provider === 'azure' ? 2_000_000 : 0;
  const used = Number(data?.used_characters || 0);
  const reserved = Number(data?.reserved_characters || 0);
  const limit = Number(data?.hard_limit_characters ?? defaultLimit);
  return NextResponse.json({ provider, used, reserved, limit, remaining: Math.max(0, limit - used - reserved), configured: data !== null || provider === 'azure' });
}

export async function PATCH(request: Request) {
  if (!requireTranslationAdmin(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const client = getTranslationAdminClient();
  if (!client) return NextResponse.json({ error: 'server_not_configured' }, { status: 503 });
  try {
    const body = await request.json() as { provider?: TranslationProvider; hardLimitCharacters?: unknown };
    if (!isTranslationProvider(body.provider)
      || !Number.isSafeInteger(body.hardLimitCharacters)
      || (body.hardLimitCharacters as number) < 0
      || (body.hardLimitCharacters as number) > MAX_MONTHLY_CHARACTERS) {
      return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    }
    const { data, error } = await client.rpc('configure_translation_usage_limit', {
      p_provider: body.provider,
      p_hard_limit_characters: body.hardLimitCharacters,
    });
    if (error || data !== true) return NextResponse.json({ error: 'limit_below_reserved_usage' }, { status: 409 });
    return NextResponse.json({ provider: body.provider, hardLimitCharacters: body.hardLimitCharacters });
  } catch {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }
}
