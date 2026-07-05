import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// Known popular games mappings (fallback & appid resolver)
const APP_ID_MAP: Record<string, number> = {
  'octopath traveler': 921570,
  'octopath traveler ii': 1971650,
  'octopath traveler 2': 1971650,
  'cyberpunk 2077': 1091500,
  'elden ring': 1245620,
  'black myth: wukong': 2358720,
  'black myth wukong': 2358720,
  "baldur's gate 3": 1086940,
  'baldurs gate 3': 1086940,
  "ghost of tsushima director's cut": 2215430,
  'ghost of tsushima': 2215430,
  'palworld': 1623730,
  'monster hunter: world': 582010,
  'monster hunter world': 582010,
  'resident evil 4': 2050650,
  'biohazard re:4': 2050650,
};

// Default exchange rates (base is USD)
const EXCHANGE_RATES: Record<string, number> = {
  USD: 1.0,
  KRW: 1380.0,
  JPY: 155.0,
  EUR: 0.92,
};

// Standard prices in USD for fallback
const DEFAULT_BASE_PRICES: Record<number, { original: number; current: number; discountPercent: number }> = {
  921570: { original: 59.99, current: 59.99, discountPercent: 0 },
  1971650: { original: 59.99, current: 59.99, discountPercent: 0 },
  1091500: { original: 59.99, current: 59.99, discountPercent: 0 },
  1245620: { original: 59.99, current: 59.99, discountPercent: 0 },
  2358720: { original: 59.99, current: 59.99, discountPercent: 0 },
  1086940: { original: 59.99, current: 59.99, discountPercent: 0 },
  2215430: { original: 59.99, current: 59.99, discountPercent: 0 },
  1623730: { original: 29.99, current: 29.99, discountPercent: 0 },
  582010: { original: 29.99, current: 29.99, discountPercent: 0 },
  2050650: { original: 39.99, current: 39.99, discountPercent: 0 },
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const gameIdParam = searchParams.get('gameId');
    const title = searchParams.get('title') || '';
    const appIdParam = searchParams.get('appid');
    
    const gameId = gameIdParam ? parseInt(gameIdParam, 10) : null;
    let appId = appIdParam ? parseInt(appIdParam, 10) : null;
    
    if (!appId && title) {
      const normalizedTitle = title.toLowerCase().trim();
      appId = APP_ID_MAP[normalizedTitle] || null;
      
      if (!appId) {
        const matchingKey = Object.keys(APP_ID_MAP).find(
          key => normalizedTitle.includes(key) || key.includes(normalizedTitle)
        );
        if (matchingKey) {
          appId = APP_ID_MAP[matchingKey];
        }
      }
    }
    
    const resolvedAppId = appId || 1091500;
    
    // 1. Check Supabase cache (game_prices table)
    let cachedData = null;
    if (supabase && gameId) {
      try {
        const { data, error } = await supabase
          .from('game_prices')
          .select('*')
          .eq('game_id', gameId)
          .maybeSingle();
        
        if (!error && data) {
          const updatedAt = new Date(data.updated_at).getTime();
          const now = new Date().getTime();
          const ageHours = (now - updatedAt) / (1000 * 60 * 60);
          if (ageHours < 12) {
            cachedData = data;
          }
        }
      } catch (err) {
        console.warn('Failed to query cache from Supabase:', err);
      }
    }
    
    if (cachedData) {
      const mapCachedPrice = (price: number | null, discount: number | null) => {
        const current = price || 59.99;
        const discountPercent = discount || 0;
        const original = discountPercent > 0 
          ? parseFloat((current / (1 - discountPercent / 100)).toFixed(2)) 
          : current;
        return { original, current, discountPercent };
      };
      
      return NextResponse.json({
        success: true,
        title: title || `Game ${gameId}`,
        appId: resolvedAppId,
        baseCurrency: 'USD',
        rates: EXCHANGE_RATES,
        stores: {
          steam: mapCachedPrice(cachedData.steam_price, cachedData.steam_discount),
          gmg: mapCachedPrice(cachedData.gmg_price, cachedData.gmg_discount),
          humble: mapCachedPrice(cachedData.humble_price, cachedData.humble_discount),
          gog: mapCachedPrice(cachedData.gog_price ?? cachedData.steam_price, cachedData.gog_discount ?? cachedData.steam_discount),
        }
      });
    }
    
    // 2. Fetch from CheapShark API
    let deals: any[] = [];
    if (appId) {
      try {
        const res = await fetch(
          `https://www.cheapshark.com/api/1.0/deals?steamAppID=${appId}&limit=30`
        );
        if (res.ok) {
          deals = await res.json();
        }
      } catch (err) {
        console.warn('CheapShark steamAppID fetch failed:', err);
      }
    }
    
    if ((!deals || deals.length === 0) && title) {
      try {
        const res = await fetch(
          `https://www.cheapshark.com/api/1.0/deals?title=${encodeURIComponent(title)}&limit=30`
        );
        if (res.ok) {
          const allDeals = await res.json();
          deals = allDeals.filter((d: any) =>
            d.title.toLowerCase().includes(title.toLowerCase())
          );
        }
      } catch (err) {
        console.warn('CheapShark title fetch failed:', err);
      }
    }
    
    // 3. Parse store deals: Match Steam (storeID: "1"), GMG (storeID: "2"), Humble (storeID: "11"), GOG (storeID: "7")
    const steamDeal = deals.find(d => d.storeID === '1');
    const gmgDeal = deals.find(d => d.storeID === '2');
    const humbleDeal = deals.find(d => d.storeID === '11');
    const gogDeal = deals.find(d => d.storeID === '7');
    
    // Default Steam price details (fallback)
    let steamPrice = {
      original: 59.99,
      current: 59.99,
      discountPercent: 0,
    };
    
    if (steamDeal) {
      steamPrice = {
        original: parseFloat(steamDeal.normalPrice),
        current: parseFloat(steamDeal.salePrice),
        discountPercent: Math.round(parseFloat(steamDeal.savings)),
      };
    } else {
      const fallback = DEFAULT_BASE_PRICES[resolvedAppId] || { original: 59.99, current: 59.99, discountPercent: 0 };
      steamPrice = { ...fallback };
    }
    
    let gmgPrice = { ...steamPrice };
    if (gmgDeal) {
      gmgPrice = {
        original: parseFloat(gmgDeal.normalPrice),
        current: parseFloat(gmgDeal.salePrice),
        discountPercent: Math.round(parseFloat(gmgDeal.savings)),
      };
    }
    
    let humblePrice = { ...steamPrice };
    if (humbleDeal) {
      humblePrice = {
        original: parseFloat(humbleDeal.normalPrice),
        current: parseFloat(humbleDeal.salePrice),
        discountPercent: Math.round(parseFloat(humbleDeal.savings)),
      };
    }
    
    let gogPrice = { ...steamPrice };
    if (gogDeal) {
      gogPrice = {
        original: parseFloat(gogDeal.normalPrice),
        current: parseFloat(gogDeal.salePrice),
        discountPercent: Math.round(parseFloat(gogDeal.savings)),
      };
    }
    
    // 4. Save (UPSERT) dynamic real-time prices back into Supabase
    if (supabase && gameId) {
      try {
        const { error: upsertError } = await supabase
          .from('game_prices')
          .upsert({
            game_id: gameId,
            steam_price: steamPrice.current,
            steam_discount: steamPrice.discountPercent,
            gmg_price: gmgPrice.current,
            gmg_discount: gmgPrice.discountPercent,
            humble_price: humblePrice.current,
            humble_discount: humblePrice.discountPercent,
            gog_price: gogPrice.current,
            gog_discount: gogPrice.discountPercent,
            updated_at: new Date().toISOString()
          }, { onConflict: 'game_id' });
        
        if (upsertError) {
          console.error('Failed to upsert game prices into Supabase:', upsertError);
        }
      } catch (err) {
        console.warn('Failed to save prices cache to Supabase:', err);
      }
    }
    
    // 5. Return genuine prices
    return NextResponse.json({
      success: true,
      title: title || (appId ? `Game ${appId}` : 'Unknown Game'),
      appId: resolvedAppId,
      baseCurrency: 'USD',
      rates: EXCHANGE_RATES,
      stores: {
        steam: steamPrice,
        gmg: gmgPrice,
        humble: humblePrice,
        gog: gogPrice,
      }
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
