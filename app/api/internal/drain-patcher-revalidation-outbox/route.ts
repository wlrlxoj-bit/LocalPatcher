import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { drainPatcherRevalidationOutbox } from '@/lib/server/admin/patcher-revalidation-outbox';
import { getTranslationAdminClient } from '@/lib/server/translation/db';

const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' };

function hasValidAutomationSecret(request: Request) {
  const secret = process.env.PATCHER_REVALIDATE_SECRET;
  const authorization = request.headers.get('authorization');
  if (!secret || !authorization?.startsWith('Bearer ')) return false;
  const supplied = Buffer.from(authorization.slice('Bearer '.length));
  const expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

/** 예약 자동화 전용 durable outbox consumer입니다. 한 요청은 작은 lease batch만 소비합니다. */
export async function POST(request: Request) {
  if (!hasValidAutomationSecret(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE_HEADERS });
  }
  const client = getTranslationAdminClient();
  if (!client) {
    return NextResponse.json({ error: 'server_not_configured' }, { status: 503, headers: NO_STORE_HEADERS });
  }
  try {
    const result = await drainPatcherRevalidationOutbox(client);
    return NextResponse.json(result, { headers: NO_STORE_HEADERS });
  } catch {
    console.warn('[PATCHER_REVALIDATION_OUTBOX_RETRY_REQUIRED]');
    return NextResponse.json({ error: 'outbox_drain_unavailable', retryRequired: true }, {
      status: 503,
      headers: { ...NO_STORE_HEADERS, 'Retry-After': '300' },
    });
  }
}
