import React from 'react';
import GamesListClient from '@/components/GamesListClient';
import { getGamesWithTrainers } from '@/lib/supabase';
import { Locale, getCommonDict } from '@/lib/i18n/index';
import { ShieldCheck, Zap, Info } from 'lucide-react';
import GamesListSkeleton from '@/components/GamesListSkeleton';

export const revalidate = 3600;

async function GamesFetcher({ locale }: { locale: Locale }) {
  const gamesData = (await getGamesWithTrainers()) as any[];
  const games = gamesData.map(({ trainers, ...game }) => game);
  const trainersList = gamesData
    .filter(g => g.trainers && g.trainers.length > 0)
    .map(g => ({
      id: g.trainers[0].id,
      game_id: g.id,
      version_str: g.trainers[0].version_str,
      option_count: g.trainers[0].option_count
    }));

  return <GamesListClient games={games} trainers={trainersList} locale={locale} />;
}

export default async function LocalePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const currentLocale = (locale === 'en' || locale === 'ja' || locale === 'ko' || locale === 'de' || locale === 'es') ? (locale as Locale) : 'ko';
  const t = getCommonDict(currentLocale);

  return (
    <div className="max-w-7xl mx-auto px-6 py-12 flex flex-col items-center">
      {/* Hero Section */}
      <div className="text-center max-w-2xl mb-12">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full border border-cyan-500/30 bg-cyan-950/40 text-xs font-semibold text-cyan-400 mb-4 tracking-wide glow-cyan">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></span>
          <span>{t.badgeSecure}</span>
        </div>
        <h1 className="font-bold text-4xl sm:text-5xl tracking-tight mb-4 text-transparent bg-clip-text bg-gradient-to-b from-white to-slate-300 font-outfit">
          {t.subtitle}
        </h1>
        <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
          {t.desc}
        </p>
      </div>

      {/* Security Trust Badges Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl w-full mb-16">
        <div className="flex items-center space-x-3.5 p-4 rounded-xl border border-slate-800/80 bg-slate-900/40">
          <div className="p-2.5 rounded-lg bg-cyan-500/10 text-cyan-400">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">{t.badgeAnonTitle}</h4>
            <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{t.badgeAnonDesc}</p>
          </div>
        </div>

        <div className="flex items-center space-x-3.5 p-4 rounded-xl border border-slate-800/80 bg-slate-900/40">
          <div className="p-2.5 rounded-lg bg-indigo-500/10 text-indigo-400">
            <Zap className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">{t.badgeSpeedTitle}</h4>
            <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{t.badgeSpeedDesc}</p>
          </div>
        </div>

        <div className="flex items-center space-x-3.5 p-4 rounded-xl border border-slate-800/80 bg-slate-900/40">
          <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-400">
            <Info className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">{t.badgeTechTitle}</h4>
            <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{t.badgeTechDesc}</p>
          </div>
        </div>
      </div>

      <React.Suspense fallback={<GamesListSkeleton />}>
        <GamesFetcher locale={currentLocale} />
      </React.Suspense>

      {/* SEO Content Section for Thin Content requirements */}
      <section className="mt-24 max-w-4xl text-center px-4 md:px-0">
        <h2 className="text-xl font-bold text-slate-200 mb-4 tracking-tight">{t.seoTitle}</h2>
        <p className="text-sm text-slate-400 leading-relaxed text-justify md:text-center">
          {t.seoContent}
        </p>
      </section>
    </div>
  );
}
