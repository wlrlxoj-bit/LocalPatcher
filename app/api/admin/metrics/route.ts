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

const PRICE_EVENTS = ['price_compare_viewed', 'merchant_clicked', 'affiliate_merchant_clicked', 'patcher_viewed', 'file_selected', 'patch_completed'] as const;

const PATCH_FUNNEL_EVENTS = [
  'fling_download_clicked',
  'file_selection_attempted',
  'file_selected',
  'patch_completed',
  'download_started',
  'ad_gate_opened',
  'popup_blocked',
  'patch_failed',
] as const;

const FAILURE_CATEGORIES = [
  'invalid_type',
  'file_too_large',
  'not_pe',
  'unsupported_version',
  'processing_error',
] as const;

type PriceEventName = typeof PRICE_EVENTS[number];

type PriceEventCounts = Record<PriceEventName, number>;

type PatchFunnelEventName = typeof PATCH_FUNNEL_EVENTS[number];
type PatchFunnelEventCounts = Record<PatchFunnelEventName, number>;
type FailureCategory = typeof FAILURE_CATEGORIES[number];
type FailureBreakdown = Record<FailureCategory, number>;
type ReportRow = {
  dimensionValues?: Array<{ value?: string }>;
  metricValues?: Array<{ value?: string }>;
};

/** 지정한 이벤트만 한 번의 GA4 보고서로 집계합니다. */
async function runNamedEventReport<T extends string>(
  propertyId: string,
  accessToken: string,
  startDate: string,
  endDate: string,
  eventNames: readonly T[],
) {
  const response = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'eventName' }],
      metrics: [{ name: 'eventCount' }],
      dimensionFilter: {
        filter: { fieldName: 'eventName', inListFilter: { values: eventNames } },
      },
      limit: String(eventNames.length),
    }),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`GA4 event report request failed: ${response.status}`);

  const data = await response.json() as { rows?: ReportRow[] };
  const counts = Object.fromEntries(eventNames.map((eventName) => [eventName, 0])) as Record<T, number>;
  for (const row of data.rows ?? []) {
    const eventName = row.dimensionValues?.[0]?.value as T | undefined;
    const value = Number(row.metricValues?.[0]?.value ?? 0);
    if (eventName && eventName in counts && Number.isFinite(value)) counts[eventName] = value;
  }
  return counts;
}

/** 여러 가격 비교 퍼널 이벤트를 한 번의 GA4 요청으로 조회합니다. */
async function runEventReport(propertyId: string, accessToken: string, startDate: string, endDate: string) {
  const response = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'eventName' }],
      metrics: [{ name: 'eventCount' }],
      dimensionFilter: {
        filter: {
          fieldName: 'eventName',
          inListFilter: { values: PRICE_EVENTS },
        },
      },
      limit: '10',
    }),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`GA4 event report request failed: ${response.status}`);

  const data = await response.json() as {
    rows?: Array<{
      dimensionValues?: Array<{ value?: string }>;
      metricValues?: Array<{ value?: string }>;
    }>;
  };
  const counts: PriceEventCounts = {
    price_compare_viewed: 0,
    merchant_clicked: 0,
    affiliate_merchant_clicked: 0,
    patcher_viewed: 0,
    file_selected: 0,
    patch_completed: 0,
  };
  for (const row of data.rows ?? []) {
    const eventName = row.dimensionValues?.[0]?.value as PriceEventName | undefined;
    const value = Number(row.metricValues?.[0]?.value ?? 0);
    if (eventName && eventName in counts && Number.isFinite(value)) counts[eventName] = value;
  }
  return counts;
}

/** 실패 사유는 허용한 고정 분류만 반환하고, 맞춤 측정기준 상태를 함께 알려줍니다. */
async function runFailureCategoryReport(propertyId: string, accessToken: string, startDate: string, endDate: string, isDimensionConfigured: boolean) {
  if (!isDimensionConfigured) {
    return { status: 'not_configured' as const, counts: null };
  }

  const counts = Object.fromEntries(FAILURE_CATEGORIES.map((category) => [category, 0])) as FailureBreakdown;
  try {
    const response = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'customEvent:patch_failure_reason' }],
        metrics: [{ name: 'eventCount' }],
        dimensionFilter: {
          filter: {
            fieldName: 'eventName',
            stringFilter: { value: 'patch_failed', matchType: 'EXACT' },
          },
        },
        limit: String(FAILURE_CATEGORIES.length),
      }),
      cache: 'no-store',
    });
    if (!response.ok) return { status: 'unavailable' as const, counts: null };

    const data = await response.json() as { rows?: ReportRow[] };
    for (const row of data.rows ?? []) {
      const category = row.dimensionValues?.[0]?.value as FailureCategory | undefined;
      const value = Number(row.metricValues?.[0]?.value ?? 0);
      if (category && category in counts && Number.isFinite(value)) counts[category] = value;
    }
  } catch {
    return { status: 'unavailable' as const, counts: null };
  }
  return { status: 'available' as const, counts };
}

function percentage(numerator: number, denominator: number) {
  return denominator > 0 ? (numerator / denominator) * 100 : null;
}

function relativeDecline(current: number | null, previous: number | null) {
  return current !== null && previous !== null && previous > 0
    ? ((previous - current) / previous) * 100
    : null;
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

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
  const measurementStartDate = process.env.PRICE_COMPARE_MEASUREMENT_START_DATE?.trim();
  const isFailureReasonDimensionConfigured = process.env.GA4_PATCH_FAILURE_REASON_DIMENSION_READY === 'true';

  if (!propertyId || !serviceAccountEmail || !privateKey) {
    return NextResponse.json({
      status: 'unavailable',
      reason: 'GA4 연결 정보가 설정되지 않았습니다. 서버 환경변수를 확인해 주세요.',
      monthlyActiveUsers: null,
      previousMonthActiveUsers: null,
      downloadStarts: null,
      patchFunnel: null,
      pricePlacement: null,
    });
  }

  try {
    const accessToken = await getAccessToken(serviceAccountEmail, privateKey);
    const activeUsersMetric = [{ name: 'activeUsers' }];
    const eventCountMetric = [{ name: 'eventCount' }];
    const today = new Date();
    const todayDate = formatDate(today);
    const parsedStartDate = measurementStartDate && /^\d{4}-\d{2}-\d{2}$/.test(measurementStartDate)
      ? new Date(`${measurementStartDate}T00:00:00Z`)
      : null;
    const validStartDate = parsedStartDate
      && !Number.isNaN(parsedStartDate.getTime())
      && formatDate(parsedStartDate) === measurementStartDate
      && parsedStartDate.getTime() <= today.getTime()
      ? parsedStartDate
      : null;

    const [monthlyActiveUsers, previousMonthActiveUsers, downloadStarts, recentFunnelEvents, failureBreakdownResult, recentPriceEvents, previousPriceEvents, cumulativePriceEvents] = await Promise.all([
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
      runNamedEventReport(propertyId, accessToken, '29daysAgo', 'today', PATCH_FUNNEL_EVENTS) as Promise<PatchFunnelEventCounts>,
      runFailureCategoryReport(propertyId, accessToken, '29daysAgo', 'today', isFailureReasonDimensionConfigured),
      runEventReport(propertyId, accessToken, '27daysAgo', 'today'),
      runEventReport(propertyId, accessToken, '55daysAgo', '28daysAgo'),
      validStartDate
        ? runEventReport(propertyId, accessToken, measurementStartDate!, todayDate)
        : Promise.resolve(null),
    ]);

    const failureBreakdown = failureBreakdownResult.counts;
    const mainFailureCategory = failureBreakdown && FAILURE_CATEGORIES.reduce<FailureCategory | null>((current, category) => {
      if (failureBreakdown[category] === 0) return current;
      return current === null || failureBreakdown[category] > failureBreakdown[current] ? category : current;
    }, null);
    const patchFunnel = {
      flingClicks: recentFunnelEvents.fling_download_clicked,
      fileSelectionAttempted: recentFunnelEvents.file_selection_attempted,
      fileSelected: recentFunnelEvents.file_selected,
      patchCompleted: recentFunnelEvents.patch_completed,
      downloadStarts: recentFunnelEvents.download_started,
      adGateOpened: recentFunnelEvents.ad_gate_opened,
      popupBlocked: recentFunnelEvents.popup_blocked,
      patchFailed: recentFunnelEvents.patch_failed,
      rates: {
        flingToFileSelectionAttempt: percentage(recentFunnelEvents.file_selection_attempted, recentFunnelEvents.fling_download_clicked),
        fileSelectionAttemptToValidation: percentage(recentFunnelEvents.file_selected, recentFunnelEvents.file_selection_attempted),
        fileSelectionToPatchCompleted: percentage(recentFunnelEvents.patch_completed, recentFunnelEvents.file_selected),
        patchCompletedToDownload: percentage(recentFunnelEvents.download_started, recentFunnelEvents.patch_completed),
        downloadToAdGateOpened: percentage(recentFunnelEvents.ad_gate_opened, recentFunnelEvents.download_started),
        popupBlockedRate: percentage(recentFunnelEvents.popup_blocked, recentFunnelEvents.download_started),
        patchFailureRate: percentage(recentFunnelEvents.patch_failed, recentFunnelEvents.file_selection_attempted),
      },
      failureBreakdown,
      failureBreakdownStatus: failureBreakdownResult.status,
      mainFailureCategory,
    };

    let pricePlacement = null;
    if (validStartDate && cumulativePriceEvents) {
      const daysCollected = Math.max(1, Math.floor((today.getTime() - validStartDate.getTime()) / 86_400_000) + 1);
      const recentViews = recentPriceEvents.price_compare_viewed;
      const recentClicks = recentPriceEvents.affiliate_merchant_clicked;
      const clickThroughRate = percentage(recentClicks, recentViews);
      const selectionRate = percentage(recentPriceEvents.file_selected, recentPriceEvents.patcher_viewed);
      const previousSelectionRate = percentage(previousPriceEvents.file_selected, previousPriceEvents.patcher_viewed);
      const completionRate = percentage(recentPriceEvents.patch_completed, recentPriceEvents.file_selected);
      const previousCompletionRate = percentage(previousPriceEvents.patch_completed, previousPriceEvents.file_selected);
      const selectionDecline = relativeDecline(selectionRate, previousSelectionRate);
      const completionDecline = relativeDecline(completionRate, previousCompletionRate);
      const funnelComparisonAvailable = daysCollected >= 56
        && previousPriceEvents.patcher_viewed > 0
        && previousPriceEvents.file_selected > 0;
      const enoughData = daysCollected >= 28 && cumulativePriceEvents.price_compare_viewed >= 500;
      const funnelDeclined = funnelComparisonAvailable
        && ((selectionDecline ?? 0) >= 10 || (completionDecline ?? 0) >= 10);

      let status: 'collecting' | 'keep_bottom' | 'consider_raise' = 'collecting';
      let reason = '최소 28일과 누적 노출 500회를 충족할 때까지 하단에서 데이터를 수집합니다.';
      if (enoughData) {
        if (clickThroughRate === null || clickThroughRate < 1) {
          status = 'keep_bottom';
          reason = '제휴 클릭률이 1% 미만이므로 하단을 유지하고, 계속 낮으면 영역 숨김을 검토하세요.';
        } else if (clickThroughRate < 3) {
          status = 'keep_bottom';
          reason = '제휴 클릭률이 1~3% 구간이므로 가격 비교는 하단에 유지하는 것이 좋습니다.';
        } else if (funnelDeclined) {
          status = 'keep_bottom';
          reason = '가격 비교 관심은 있지만 파일 선택 또는 패치 완료율이 이전 기간보다 10% 이상 하락해 하단 유지가 안전합니다.';
        } else {
          status = 'consider_raise';
          reason = clickThroughRate >= 5
            ? '제휴 클릭률이 5% 이상이고 핵심 퍼널의 뚜렷한 하락이 없어 강한 위치 상승 후보입니다. 실제 수익은 제휴사 자료에서 별도로 확인해야 하며 자동 이동되지는 않습니다.'
            : '제휴 클릭률이 3% 이상이고 핵심 퍼널의 뚜렷한 하락이 없어 한 단계 위 배치를 검토할 수 있습니다. 자동 이동되지는 않습니다.';
        }
      }

      const minimumReviewDate = addUtcDays(validStartDate, 27);
      pricePlacement = {
        status,
        measurementStartDate,
        daysCollected,
        minDays: 28,
        cumulativeViews: cumulativePriceEvents.price_compare_viewed,
        minViews: 500,
        recentViews,
        recentClicks,
        affiliateClicks: recentPriceEvents.affiliate_merchant_clicked,
        allMerchantClicks: recentPriceEvents.merchant_clicked,
        recentPatcherViews: recentPriceEvents.patcher_viewed,
        previousPatcherViews: previousPriceEvents.patcher_viewed,
        clickThroughRate,
        fileSelected: recentPriceEvents.file_selected,
        previousFileSelected: previousPriceEvents.file_selected,
        patchCompleted: recentPriceEvents.patch_completed,
        previousPatchCompleted: previousPriceEvents.patch_completed,
        selectionRate,
        previousSelectionRate,
        completionRate,
        previousCompletionRate,
        funnelComparisonAvailable,
        reason,
        nextReviewDate: daysCollected < 28 ? formatDate(minimumReviewDate) : null,
      };
    }

    return NextResponse.json({
      status: 'available',
      monthlyActiveUsers,
      previousMonthActiveUsers,
      downloadStarts,
      patchFunnel,
      pricePlacement,
    });
  } catch (error) {
    console.error('관리자용 GA4 통계를 조회하지 못했습니다.', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({
      status: 'unavailable',
      reason: 'GA4 통계를 가져오지 못했습니다. 서비스 계정의 속성 접근 권한을 확인해 주세요.',
      monthlyActiveUsers: null,
      previousMonthActiveUsers: null,
      downloadStarts: null,
      patchFunnel: null,
      pricePlacement: null,
    });
  }
}
