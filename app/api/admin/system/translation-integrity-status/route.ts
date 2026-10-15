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
    const checkedAt = new Date().toISOString();
    const rows = await Promise.all(STATES.map(async (state) => {
      const { count, error } = await client.from('translation_integrity_recovery_queue').select('*', { count: 'exact', head: true }).eq('state', state);
      return { state, count, error };
    }));
    if (rows.some((row) => row.error)) throw new Error('count_failed');
    // 활성 임대는 처리 가능 대기나 예약 건수에 중복해서 포함하지 않는다.
    const availableLease = `lease_expires_at.is.null,lease_expires_at.lte.${checkedAt}`;
    const [due, scheduled, processing] = await Promise.all([
      client.from('translation_integrity_recovery_queue').select('*', { count: 'exact', head: true })
        .in('state', ['ready', 'deferred']).lte('next_retry_at', checkedAt).or(availableLease),
      client.from('translation_integrity_recovery_queue').select('*', { count: 'exact', head: true })
        .in('state', ['ready', 'deferred']).gt('next_retry_at', checkedAt).or(availableLease),
      client.from('translation_integrity_recovery_queue').select('*', { count: 'exact', head: true })
        .in('state', ['ready', 'deferred']).gt('lease_expires_at', checkedAt),
    ]);
    if (due.error || scheduled.error || processing.error) throw new Error('timing_count_failed');
    const { data: latest, error } = await client.from('translation_integrity_recovery_queue')
      .select('last_failure_code,updated_at').order('updated_at', { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    const counts = Object.fromEntries(rows.map((row) => [row.state, row.count ?? 0]));
    return NextResponse.json({ ...counts, due: due.count ?? 0, scheduled: scheduled.count ?? 0, processing: processing.count ?? 0, checkedAt, latestFailureCode: latest?.last_failure_code ?? null, latestUpdatedAt: latest?.updated_at ?? null }, { headers: HEADERS });
  } catch {
    return NextResponse.json({ error: 'INTEGRITY_STATUS_UNAVAILABLE' }, { status: 503, headers: HEADERS });
  }
}
