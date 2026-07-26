import React from 'react';
import { getSteamPlayerCount } from '@/lib/steam';
import { getPatcherDict, Locale } from '@/lib/i18n/index';

interface SteamPlayerCountProps {
  steamAppId: number;
  locale: Locale;
}

export default async function SteamPlayerCount({ steamAppId, locale }: SteamPlayerCountProps) {
  const count = await getSteamPlayerCount(steamAppId);
  if (count === null) {
    return null; // Do not render if fetch fails
  }

  const pt = getPatcherDict(locale);

  // Format number with commas
  const formattedCount = new Intl.NumberFormat(locale === 'ko' ? 'ko-KR' : 'en-US').format(count);

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900/50 border border-emerald-500/20 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.1)] w-fit mt-3">
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
