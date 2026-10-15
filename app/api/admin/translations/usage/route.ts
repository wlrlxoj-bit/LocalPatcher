import { NextResponse } from 'next/server';
import { requireTranslationAdmin } from '@/lib/server/translation/admin-auth';
import { getTranslationAdminClient } from '@/lib/server/translation/db';
import { isTranslationProvider } from '@/lib/server/translation/types';

export async function GET(request: Request) {
  if (!requireTranslationAdmin(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const provider = new URL(request.url).searchParams.get('provider');
  if (!isTranslationProvider(provider)) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  const monthStart = `${new Date().toISOString().slice(0, 7)}-01`;
  const state = { provider, enforced: false, status: 'unlimited', used: null, reserved: null, limit: null, remaining: null, configured: false };
  // 집계는 폐기 전 참고 기록이며, 조회 장애도 비강제 정책을 바꾸지 않는다.
  try {
    const client = getTranslationAdminClient();
    if (!client) return NextResponse.json({ ...state, history: null, historyStatus: 'unavailable' });
    const { data, error } = await client.from('translation_usage_monthly')
      .select('used_characters,reserved_characters,hard_limit_characters')
      .eq('month_start', monthStart).eq('provider', provider).maybeSingle();
    if (error) return NextResponse.json({ ...state, history: null, historyStatus: 'unavailable' });
    const history = data ? { historical: true, enforced: false, monthStart, used: Number(data.used_characters || 0), reserved: Number(data.reserved_characters || 0), limit: Number(data.hard_limit_characters || 0) } : null;
    return NextResponse.json({ ...state, history, historyStatus: history ? 'historical' : 'none' });
  } catch {
    return NextResponse.json({ ...state, history: null, historyStatus: 'unavailable' });
  }
}

export async function PATCH(request: Request) {
  if (!requireTranslationAdmin(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({ error: 'gone' }, { status: 410 });
}
