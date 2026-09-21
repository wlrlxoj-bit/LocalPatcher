import { NextResponse } from 'next/server';
import { requireAdmin, getAdminClient } from '@/lib/server/admin/access';

const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' };
const RETRY_STATES = ['ready', 'deferred', 'blocked'] as const;
type RetryState = typeof RETRY_STATES[number];

/**
 * 재번역 대기열은 서비스 역할만 직접 접근할 수 있습니다. 이 API는 관리자에게
 * 항목 본문이나 trainer id를 노출하지 않고 상태별 건수와 가장 최근 실패 코드만 제공합니다.
 */
export async function GET(request: Request) {
  if (!requireAdmin(request)) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401, headers: NO_STORE_HEADERS });
  const client = getAdminClient();
  if (!client) return NextResponse.json({ error: 'RETRY_STATUS_UNAVAILABLE' }, { status: 503, headers: NO_STORE_HEADERS });

  try {
    const countResults = await Promise.all(RETRY_STATES.map(async (state) => {
      const { count, error } = await client.from('translation_retry_queue')
        .select('*', { count: 'exact', head: true })
        .eq('state', state);
      return { state, count, error };
    }));
    if (countResults.some(({ error }) => error)) {
      console.error('Translation retry count request failed');
      return NextResponse.json({ error: 'RETRY_STATUS_UNAVAILABLE' }, { status: 503, headers: NO_STORE_HEADERS });
    }

    const { data: latest, error: latestError } = await client.from('translation_retry_queue')
      .select('state,last_failure_code,updated_at')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestError) {
      console.error('Translation retry latest state request failed');
      return NextResponse.json({ error: 'RETRY_STATUS_UNAVAILABLE' }, { status: 503, headers: NO_STORE_HEADERS });
    }

    const counts = Object.fromEntries(countResults.map(({ state, count }) => [state, count ?? 0])) as Record<RetryState, number>;
    return NextResponse.json({
      ready: counts.ready,
      deferred: counts.deferred,
      blocked: counts.blocked,
      latestUpdatedAt: typeof latest?.updated_at === 'string' ? latest.updated_at : null,
      latestFailureCode: typeof latest?.last_failure_code === 'string' ? latest.last_failure_code : null,
    }, { headers: NO_STORE_HEADERS });
  } catch {
    return NextResponse.json({ error: 'RETRY_STATUS_UNAVAILABLE' }, { status: 503, headers: NO_STORE_HEADERS });
  }
}
