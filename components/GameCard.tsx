'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, Lock } from 'lucide-react';
import { Locale } from '@/lib/i18n';

interface GameCardProps {
  game: {
    id: number;
    title_en: string;
    title_ko: string;
    title_ja?: string;
    slug: string;
    cover_image_url: string;
    anti_cheat: string;
    fling_url?: string;
  };
  trainerVersion: string;
  optionCount: number;
  locale: Locale;
  optionsLabel: string;
}

export default function GameCard({ game, trainerVersion, optionCount, locale, optionsLabel }: GameCardProps) {
  const displayTitle = locale === 'ko' ? game.title_ko : locale === 'ja' ? (game.title_ja || game.title_en) : game.title_en;
  
  return (
    <Link 
      href={`/${locale}/patcher/${game.slug}`}
      className="rounded-2xl border border-slate-800 bg-slate-900/30 overflow-hidden hover:border-slate-700 hover:bg-slate-900/50 hover:shadow-lg hover:shadow-cyan-500/5 transition-all duration-300 group cursor-pointer flex flex-col h-full"
    >
      {/* Game Cover Mock Image */}
      <div 
        className="h-36 bg-slate-800 relative flex items-center justify-center overflow-hidden bg-cover bg-center" 
        style={{ backgroundImage: `url(${game.cover_image_url})` }}
      >
        <div className="absolute inset-0 bg-slate-950/70 group-hover:bg-slate-950/60 transition-colors duration-300"></div>
        
        {/* Anti-cheat solution indicator badge */}
        {game.anti_cheat && game.anti_cheat !== 'none' && (
          <div className="absolute top-3 right-3 z-10 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-[10px] font-semibold text-amber-400 flex items-center space-x-1">
            <Lock className="w-3 h-3" />
            <span>{game.anti_cheat}</span>
          </div>
        )}

        <span className="absolute z-10 font-bold text-sm tracking-wider text-slate-400 group-hover:text-cyan-400 transition-colors uppercase text-center px-4 font-outfit">
          {game.title_en}
        </span>
      </div>

      {/* Info Details */}
      <div className="p-4 flex-grow flex flex-col justify-between">
        <div>
          <h4 className="text-sm font-bold text-slate-200 group-hover:text-white transition-colors line-clamp-1">
            {displayTitle}
          </h4>
          <p className="text-xs text-slate-500 mt-1">Version: {trainerVersion}</p>
        </div>

        <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-800/40">
          <span className="text-[10px] font-bold text-cyan-400/90 tracking-wide uppercase">
            {optionCount}{optionsLabel}
          </span>
          <div className="p-1 rounded-lg bg-slate-800/60 group-hover:bg-cyan-500 group-hover:text-slate-950 text-slate-400 transition-all">
            <ArrowRight className="w-4 h-4 transform group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>
      </div>
    </Link>
  );
}
