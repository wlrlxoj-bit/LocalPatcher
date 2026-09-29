import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { revalidatePatcherForTrainer } from '@/lib/server/admin/revalidate-patcher';
import { getTranslationAdminClient } from '@/lib/server/translation/db';

const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' };

/** GitHub 자동화가 저장을 끝낸 trainer의 공개 ISR만 안전하게 무효화한다. */
function hasValidAutomationSecret(request: Request) {
  const secret = process.env.PATCHER_REVALIDATE_SECRET;
  const authorization = request.headers.get('authorization');
  if (!secret || !authorization?.startsWith('Bearer ')) return false;
  const supplied = Buffer.from(authorization.slice('Bearer '.length));
  const expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export async function POST(request: Request) {
  if (!hasValidAutomationSecret(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE_HEADERS });
  }

  let body: { trainerId?: unknown };
  try {
    body = await request.json() as { trainerId?: unknown };
  } catch {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const trainerId = body.trainerId;
  if (typeof trainerId !== 'number' || !Number.isSafeInteger(trainerId) || trainerId <= 0) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const client = getTranslationAdminClient();
  if (!client) {
    return NextResponse.json({ error: 'server_not_configured' }, { status: 503, headers: NO_STORE_HEADERS });
  }

  try {
    const result = await revalidatePatcherForTrainer(client, trainerId);
    if (!result.revalidated) {
      return NextResponse.json(result, {
        status: 503,
        headers: { ...NO_STORE_HEADERS, 'Retry-After': '300' },
      });
    }
    return NextResponse.json(result, { headers: NO_STORE_HEADERS });
  } catch {
    // revalidatePath/DB 오류는 입력 오류가 아니며, 자동화가 이후에 다시 시도할 수 있어야 한다.
    console.warn('[PATCHER_REVALIDATE_RETRY_REQUIRED] revalidation_unavailable');
    return NextResponse.json({ error: 'revalidation_unavailable', retryRequired: true }, {
      status: 503,
      headers: { ...NO_STORE_HEADERS, 'Retry-After': '300' },
    });
  }
}
