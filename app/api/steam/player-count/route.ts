import { NextRequest, NextResponse } from 'next/server';
import { getSteamPlayerCount } from '@/lib/steam';

// 페이지 ISR과 분리된 짧은 CDN 캐시다. 이 route 자체를 ISR로 만들지 않는다.
export const dynamic = 'force-dynamic';

const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=300, s-maxage=900, stale-while-revalidate=86400',
  'Content-Type': 'application/json; charset=utf-8',
};

function parseSteamAppId(value: string | null): number | null {
  if (!value || !/^\d{1,8}$/.test(value)) return null;
  const appId = Number(value);
  return Number.isSafeInteger(appId) && appId > 0 ? appId : null;
}

/** Steam의 변동 접속자 수를 HTML 생성과 분리해 브라우저에서만 갱신한다. */
export async function GET(request: NextRequest) {
  const appId = parseSteamAppId(request.nextUrl.searchParams.get('appid'));
  if (appId === null) {
    return NextResponse.json({ error: 'invalid_appid' }, { status: 400, headers: CACHE_HEADERS });
  }

  const playerCount = await getSteamPlayerCount(appId);
  return NextResponse.json({ playerCount }, { headers: CACHE_HEADERS });
}
