import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

export const ADMIN_SESSION_COOKIE = 'localpatcher_admin_session';
const SESSION_DURATION_SECONDS = 60 * 60 * 8;

type SessionPayload = { exp: number; role: 'admin' };

function getSessionSecret() {
  return process.env.ADMIN_SESSION_SECRET;
}

function sign(payload: string, secret: string) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

/** 서버 설정이 완료된 경우에만 서명된 관리자 세션을 발급합니다. */
export function createAdminSession() {
  const secret = getSessionSecret();
  if (!secret) return null;

  const payload = Buffer.from(JSON.stringify({
    exp: Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS,
    role: 'admin',
  } satisfies SessionPayload)).toString('base64url');

  return `${payload}.${sign(payload, secret)}`;
}

/** 변조·만료·설정 누락 세션을 모두 거부합니다. */
export function isValidAdminSession(token?: string) {
  const secret = getSessionSecret();
  if (!token || !secret) return false;

  const [payload, suppliedSignature, ...extra] = token.split('.');
  if (!payload || !suppliedSignature || extra.length > 0) return false;

  const expectedSignature = sign(payload, secret);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return false;

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as SessionPayload;
    return parsed.role === 'admin' && Number.isFinite(parsed.exp) && parsed.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}
