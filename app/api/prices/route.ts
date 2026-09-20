import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

type Price = { original: number; current: number; discountPercent: number; dealId: string | null };
type CachedPriceRow = {
  steam_price: number | null; steam_discount: number | null; gmg_price: number | null; gmg_discount: number | null;
  humble_price: number | null; humble_discount: number | null; gog_price: number | null; gog_discount: number | null; updated_at: string;
};

const SUCCESS_CACHE_HEADERS = { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400', Vary: 'Accept-Encoding' };
const ERROR_CACHE_HEADERS = { 'Cache-Control': 'private, no-store', Vary: 'Accept-Encoding' };
const MAX_GAME_ID = 2_147_483_647;
const MAX_APP_ID = 999_999_999;
const MAX_TITLE_LENGTH = 160;

// 가격 조회는 검증된 Steam 앱 ID가 있는 게임만 외부 API에 요청합니다.
const APP_ID_MAP: Record<string, number> = {
  'octopath traveler': 921570, 'octopath traveler ii': 1971650, 'octopath traveler 2': 1971650,
  'cyberpunk 2077': 1091500, 'elden ring': 1245620, 'black myth: wukong': 2358720,
  'black myth wukong': 2358720, "baldur's gate 3": 1086940, 'baldurs gate 3': 1086940,
  "ghost of tsushima director's cut": 2215430, 'ghost of tsushima': 2215430, palworld: 1623730,
  'monster hunter: world': 582010, 'monster hunter world': 582010, 'resident evil 4': 2050650, 'biohazard re:4': 2050650,
};
const KNOWN_APP_IDS = new Set(Object.values(APP_ID_MAP));
const EXCHANGE_RATES: Record<string, number> = { USD: 1.0, KRW: 1380.0, JPY: 155.0, EUR: 0.92 };
const DEFAULT_BASE_PRICES: Record<number, Omit<Price, 'dealId'>> = {
  921570: { original: 59.99, current: 59.99, discountPercent: 0 }, 1971650: { original: 59.99, current: 59.99, discountPercent: 0 },
  1091500: { original: 59.99, current: 59.99, discountPercent: 0 }, 1245620: { original: 59.99, current: 59.99, discountPercent: 0 },
  2358720: { original: 59.99, current: 59.99, discountPercent: 0 }, 1086940: { original: 59.99, current: 59.99, discountPercent: 0 },
  2215430: { original: 59.99, current: 59.99, discountPercent: 0 }, 1623730: { original: 29.99, current: 29.99, discountPercent: 0 },
  582010: { original: 29.99, current: 29.99, discountPercent: 0 }, 2050650: { original: 39.99, current: 39.99, discountPercent: 0 },
};

/** 성공 가격만 공유 캐시하며, 거절·장애 응답은 캐시하지 않습니다. */
function priceResponse(payload: object, status = 200) {
  return NextResponse.json(payload, { status, headers: status === 200 ? SUCCESS_CACHE_HEADERS : ERROR_CACHE_HEADERS });
}
function parseBoundedInteger(value: string | null, maximum: number): number | null | 'invalid' {
  if (value === null) return null;
  if (!/^[1-9]\d{0,8}$/.test(value)) return 'invalid';
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= maximum ? parsed : 'invalid';
}
function normalizeTitle(value: string | null): string | null | 'invalid' {
  if (value === null) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_TITLE_LENGTH || /[\u0000-\u001F\u007F]/.test(trimmed)) return 'invalid';
  return trimmed.toLocaleLowerCase('en-US');
}
function mapCachedPrice(price: number | null, discount: number | null): Price | null {
  if (price === null) return null;
  const discountPercent = discount ?? 0;
  const original = discountPercent > 0 ? Number((price / (1 - discountPercent / 100)).toFixed(2)) : price;
  return { original, current: price, discountPercent, dealId: null };
}
function parseDeal(deal: Record<string, unknown> | undefined): Price | null {
  if (!deal) return null;
  const original = Number(deal.retailPrice); const current = Number(deal.price); const discountPercent = Math.round(Number(deal.savings));
  if (!Number.isFinite(original) || !Number.isFinite(current) || !Number.isFinite(discountPercent)) return null;
  return { original, current, discountPercent, dealId: typeof deal.dealID === 'string' ? deal.dealID : null };
}

/** 공개 입력을 먼저 완전히 검증해 잘못된 요청이 DB·CheapShark에 닿지 않도록 합니다. */
export function validatePriceRequest(searchParams: URLSearchParams) {
  const gameId = parseBoundedInteger(searchParams.get('gameId'), MAX_GAME_ID);
  const appId = parseBoundedInteger(searchParams.get('appid'), MAX_APP_ID);
  const title = normalizeTitle(searchParams.get('title'));
  if (gameId === 'invalid' || appId === 'invalid' || title === 'invalid') return { valid: false as const };
  // 직접 appid 조회는 지원 목록으로 제한합니다. gameId 경로는 서버가 DB의 Steam 앱 ID를 다시 확인합니다.
  if (gameId === null && appId !== null && !KNOWN_APP_IDS.has(appId)) return { valid: false as const };
  if (appId === null && gameId === null && (title === null || !APP_ID_MAP[title])) return { valid: false as const };
  return { valid: true as const, gameId, appId, title };
}

export async function GET(request: NextRequest) {
  const input = validatePriceRequest(new URL(request.url).searchParams);
  if (!input.valid) return priceResponse({ success: false, error: 'INVALID_PRICE_REQUEST' }, 400);

  try {
    let { gameId, appId, title } = input;
    // gameId를 받았을 때도 실제 게임 행을 확인합니다. 임의 ID로 외부 가격 API를 조회하지 않습니다.
    if (gameId !== null) {
      if (!supabase) return priceResponse({ success: false, error: 'PRICE_LOOKUP_UNAVAILABLE' }, 503);
      const { data: gameData, error } = await supabase.from('games').select('id,title_en,cover_image_url').eq('id', gameId).maybeSingle();
      if (error || !gameData) return priceResponse({ success: false, error: 'GAME_NOT_FOUND' }, 404);
      title ??= normalizeTitle(gameData.title_en) || null;
      const coverMatch = typeof gameData.cover_image_url === 'string' ? gameData.cover_image_url.match(/\/apps\/(\d+)/) : null;
      const coveredAppId = coverMatch ? Number(coverMatch[1]) : null;
      // 공개 요청의 appid는 신뢰하지 않고, 등록된 게임이 가리키는 Steam 앱 ID만 사용합니다.
      appId = coveredAppId && Number.isSafeInteger(coveredAppId) && coveredAppId > 0
        ? coveredAppId
        : APP_ID_MAP[title ?? ''] ?? null;
    }
    appId ??= title ? APP_ID_MAP[title] ?? null : null;
    if (appId === null || !Number.isSafeInteger(appId) || appId <= 0) return priceResponse({ success: false, error: 'UNSUPPORTED_GAME' }, 404);

    let cachedData: CachedPriceRow | null = null;
    if (supabase && gameId !== null) {
      const { data, error } = await supabase.from('game_prices')
        .select('steam_price,steam_discount,gmg_price,gmg_discount,humble_price,humble_discount,gog_price,gog_discount,updated_at')
        .eq('game_id', gameId).maybeSingle();
      if (!error && data && Date.now() - new Date(data.updated_at).getTime() < 12 * 60 * 60 * 1000) cachedData = data;
    }
    if (cachedData) {
      return priceResponse({ success: true, title: title || `Game ${gameId}`, appId, baseCurrency: 'USD', rates: EXCHANGE_RATES,
        stores: { steam: mapCachedPrice(cachedData.steam_price ?? 59.99, cachedData.steam_discount)!, gmg: mapCachedPrice(cachedData.gmg_price, cachedData.gmg_discount), humble: mapCachedPrice(cachedData.humble_price, cachedData.humble_discount), gog: mapCachedPrice(cachedData.gog_price, cachedData.gog_discount) } });
    }

    const headers = { 'User-Agent': 'LocalPatcher/1.0 (contact@localpatcher.com)' };
    let gameID: string | null = null;
    const appLookup = await fetch(`https://www.cheapshark.com/api/1.0/games?steamAppID=${appId}`, { headers, next: { revalidate: 3600 } });
    if (!appLookup.ok) return priceResponse({ success: false, error: 'PRICE_UPSTREAM_UNAVAILABLE' }, 502);
    if (appLookup.ok) {
      const games: unknown = await appLookup.json();
      if (Array.isArray(games) && typeof games[0]?.gameID === 'string') gameID = games[0].gameID;
    }
    let deals: Record<string, unknown>[] = [];
    if (gameID) {
      const details = await fetch(`https://www.cheapshark.com/api/1.0/games?id=${encodeURIComponent(gameID)}`, { headers, next: { revalidate: 3600 } });
      if (!details.ok) return priceResponse({ success: false, error: 'PRICE_UPSTREAM_UNAVAILABLE' }, 502);
      if (details.ok) {
        const payload: unknown = await details.json();
        if (payload && typeof payload === 'object' && Array.isArray((payload as { deals?: unknown }).deals)) deals = (payload as { deals: Record<string, unknown>[] }).deals;
      }
    }
    const byStore = (storeID: string) => deals.find((deal) => deal.storeID === storeID);
    const steam = parseDeal(byStore('1')) ?? { ...(DEFAULT_BASE_PRICES[appId] ?? { original: 59.99, current: 59.99, discountPercent: 0 }), dealId: null };
    return priceResponse({ success: true, title: title || `Game ${appId}`, appId, baseCurrency: 'USD', rates: EXCHANGE_RATES,
      stores: { steam, gmg: parseDeal(byStore('2')), humble: parseDeal(byStore('11')), gog: parseDeal(byStore('7')) } });
  } catch {
    return priceResponse({ success: false, error: 'PRICE_LOOKUP_FAILED' }, 502);
  }
}
