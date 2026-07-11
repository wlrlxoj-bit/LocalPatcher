import { createSign } from 'node:crypto';
import { NextResponse } from 'next/server';
import { ADMIN_SESSION_COOKIE, isValidAdminSession } from '@/lib/admin-session';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_ANALYTICS_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';

function readCookie(request: Request, name: string) {
  const cookie = request.headers.get('cookie') || '';
  return cookie.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${name}=`))?.slice(name.length + 1);
}

function encodeBase64Url(value: string) {
  return Buffer.from(value).toString('base64url');
}

/** 서비스 계정 인증 정보로 GA4 Data API에서 사용할 단기 OAuth 토큰을 발급합니다. */
async function getAccessToken(serviceAccountEmail: string, privateKey: string) {
  const now = Math.floor(Date.now() / 1000);
  const header = encodeBase64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = encodeBase64Url(JSON.stringify({
    iss: serviceAccountEmail,
    scope: GOOGLE_ANALYTICS_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    iat: now,
    exp: now + 3600,
  }));
  const unsignedToken = `${header}.${payload}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsignedToken);
  signer.end();
  const assertion = `${unsignedToken}.${signer.sign(privateKey, 'base64url')}`;

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`OAuth token request failed: ${response.status}`);

  const data = await response.json() as { access_token?: string };
  if (!data.access_token) throw new Error('OAuth token response did not include an access token.');
  return data.access_token;
}

type ReportBody = {
  dateRanges: Array<{ startDate: string; endDate: string }>;
  metrics: Array<{ name: string }>;
  dimensionFilter?: {
    filter: { fieldName: string; stringFilter: { value: string; matchType: 'EXACT' } };
  };
};

/** GA4 보고서가 반환한 첫 번째 합계 값을 안전한 숫자로 변환합니다. */
async function runReport(propertyId: string, accessToken: string, body: ReportBody) {
  const response = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`GA4 report request failed: ${response.status}`);

  const data = await response.json() as {
    totals?: Array<{ metricValues?: Array<{ value?: string }> }>;
    rows?: Array<{ metricValues?: Array<{ value?: string }> }>;
  };
  const rawValue = data.totals?.[0]?.metricValues?.[0]?.value
    ?? data.rows?.[0]?.metricValues?.[0]?.value
    ?? '0';
  const value = Number(rawValue);
  return Number.isFinite(value) ? value : 0;
}

/** 로그인한 관리자에게 최근 30일 동안의 GA4 성장 지표만 제공합니다. */
export async function GET(request: Request) {
  if (!isValidAdminSession(readCookie(request, ADMIN_SESSION_COOKIE))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const propertyId = process.env.GA4_PROPERTY_ID?.trim();
  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n').trim();

  if (!propertyId || !serviceAccountEmail || !privateKey) {
    return NextResponse.json({
      status: 'unavailable',
      reason: 'GA4 연결 정보가 설정되지 않았습니다. 서버 환경변수를 확인해 주세요.',
      monthlyActiveUsers: null,
      previousMonthActiveUsers: null,
      downloadStarts: null,
    });
  }

  try {
    const accessToken = await getAccessToken(serviceAccountEmail, privateKey);
    const activeUsersMetric = [{ name: 'activeUsers' }];
    const eventCountMetric = [{ name: 'eventCount' }];
    const [monthlyActiveUsers, previousMonthActiveUsers, downloadStarts] = await Promise.all([
      runReport(propertyId, accessToken, {
        dateRanges: [{ startDate: '29daysAgo', endDate: 'today' }],
        metrics: activeUsersMetric,
      }),
      runReport(propertyId, accessToken, {
        dateRanges: [{ startDate: '59daysAgo', endDate: '30daysAgo' }],
        metrics: activeUsersMetric,
      }),
      runReport(propertyId, accessToken, {
        dateRanges: [{ startDate: '29daysAgo', endDate: 'today' }],
        metrics: eventCountMetric,
        dimensionFilter: {
          filter: {
            fieldName: 'eventName',
            stringFilter: { value: 'download_started', matchType: 'EXACT' },
          },
        },
      }),
    ]);

    return NextResponse.json({
      status: 'available',
      monthlyActiveUsers,
      previousMonthActiveUsers,
      downloadStarts,
    });
  } catch (error) {
    console.error('관리자용 GA4 통계를 조회하지 못했습니다.', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({
      status: 'unavailable',
      reason: 'GA4 통계를 가져오지 못했습니다. 서비스 계정의 속성 접근 권한을 확인해 주세요.',
      monthlyActiveUsers: null,
      previousMonthActiveUsers: null,
      downloadStarts: null,
    });
  }
}
