'use client';

import React, { useEffect, useState } from 'react';
import { getPatcherDict, Locale } from '@/lib/i18n/index';

interface SteamPlayerCountProps {
  steamAppId: number;
  locale: Locale;
}

/**
 * 실시간 접속자는 페이지 ISR 산출물에 포함하지 않는다. 마운트 뒤 짧게 CDN 캐시된
 * 전용 API를 호출해, 트래픽이 늘어도 패처 HTML 재생성을 유발하지 않는다.
 */
export default function SteamPlayerCount({ steamAppId, locale }: SteamPlayerCountProps) {
  const pt = getPatcherDict(locale);
  const [count, setCount] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const loadPlayerCount = async () => {
      try {
        const response = await fetch(`/api/steam/player-count?appid=${encodeURIComponent(String(steamAppId))}`, {
          signal: controller.signal,
          cache: 'force-cache',
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) return;
        const payload = await response.json() as { playerCount?: unknown };
        if (typeof payload.playerCount === 'number' && Number.isSafeInteger(payload.playerCount) && payload.playerCount >= 0) {
          setCount(payload.playerCount);
        }
      } catch {
        // 네트워크/Steam 일시 실패는 정적 페이지와 사용자 동작을 막지 않는다.
      } finally {
        if (!controller.signal.aborted) setLoaded(true);
      }
    };
    void loadPlayerCount();
    return () => controller.abort();
  }, [steamAppId]);

  if (!loaded) {
    return (
      <div
        className="h-12 w-40 animate-pulse rounded-full border border-slate-700/50 bg-slate-800/50"
        aria-busy="true"
        aria-label={pt.livePlayerCount}
      />
    );
  }

  if (count === null) return null;

  // Format number with commas
  const numberLocale = locale === 'ko' ? 'ko-KR' : locale === 'ja' ? 'ja-JP' : locale === 'de' ? 'de-DE' : locale === 'es' ? 'es-ES' : 'en-US';
  const formattedCount = new Intl.NumberFormat(numberLocale).format(count);

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900/50 border border-emerald-500/20 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.1)] w-fit my-2" role="status" aria-live="polite">
      <span className="relative flex h-2.5 w-2.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
      </span>
      <span className="text-xs font-bold text-emerald-400 tracking-wide font-mono">
        {pt.livePlayerCount}: {formattedCount}
      </span>
    </div>
  );
}
