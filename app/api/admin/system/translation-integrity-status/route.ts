import { NextResponse } from 'next/server';
import { requireAdmin, getAdminClient } from '@/lib/server/admin/access';

const HEADERS = { 'Cache-Control': 'private, no-store' };
const STATES = ['ready', 'deferred', 'blocked', 'completed'] as const;

/** 민감한 원문·URL 없이 무결성 복구 큐의 상태 집계만 관리자에게 제공한다. */
export async function GET(request: Request) {
  if (!requireAdmin(request)) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401, headers: HEADERS });
  const client = getAdminClient();
  if (!client) return NextResponse.json({ error: 'INTEGRITY_STATUS_UNAVAILABLE' }, { status: 503, headers: HEADERS });
  try {
    const rows = await Promise.all(STATES.map(async (state) => {
      const { count, error } = await client.from('translation_integrity_recovery_queue').select('*', { count: 'exact', head: true }).eq('state', state);
      return { state, count, error };
    }));
    if (rows.some((row) => row.error)) throw new Error('count_failed');
    const { data: latest, error } = await client.from('translation_integrity_recovery_queue')
      .select('last_failure_code,updated_at').order('updated_at', { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    const counts = Object.fromEntries(rows.map((row) => [row.state, row.count ?? 0]));
    return NextResponse.json({ ...counts, latestFailureCode: latest?.last_failure_code ?? null, latestUpdatedAt: latest?.updated_at ?? null }, { headers: HEADERS });
  } catch {
    return NextResponse.json({ error: 'INTEGRITY_STATUS_UNAVAILABLE' }, { status: 503, headers: HEADERS });
  }
}
