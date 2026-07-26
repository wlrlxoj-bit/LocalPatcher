import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Heart } from 'lucide-react';
import { getDictionary, Locale } from '@/lib/i18n';
import { getSupportContent } from '@/lib/i18n-page-content';

export default async function SupportPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const currentLocale = (locale === 'en' || locale === 'ja' || locale === 'ko' || locale === 'de' || locale === 'es') ? (locale as Locale) : 'ko';
  const t = getDictionary(currentLocale);
  const localizedContent = getSupportContent(currentLocale);

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      {/* Back link */}
      <div className="mb-6">
        <Link 
          href={`/${currentLocale}`} 
          className="inline-flex items-center space-x-2 text-xs font-semibold text-slate-400 hover:text-cyan-400 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>{t.backToHome}</span>
        </Link>
      </div>

      {/* Header */}
      <div className="text-center mb-12">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full border border-slate-700 bg-slate-900 text-[11px] font-bold text-slate-400 mb-4 tracking-wide shadow-sm">
          <Heart className="w-3.5 h-3.5" />
          <span>Patreon Support</span>
        </div>
        <h1 className="font-bold text-3xl md:text-4xl tracking-tight mb-3 text-white font-outfit">
          {localizedContent.title}
        </h1>
        <p className="text-slate-400 text-sm max-w-xl mx-auto leading-relaxed">
          {localizedContent.subtitle}
        </p>
      </div>

      {/* Patreon Premium Card (Disabled / Under Preparation) */}
      <div className="relative">
        <div className="absolute -inset-0.5 bg-slate-800 rounded-2xl blur opacity-25 pointer-events-none"></div>
        
        <div className="relative p-6 md:p-10 rounded-2xl border border-slate-800 bg-slate-950 flex flex-col items-center">
          
          <div className="w-14 h-14 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mb-6">
            <Heart className="w-7 h-7 text-slate-500 stroke-[2]" />
          </div>

          <h2 className="text-xl md:text-2xl font-bold text-white text-center mb-4">
            {localizedContent.cardTitle}
          </h2>

          <p className="text-xs md:text-sm text-slate-400 text-center max-w-2xl leading-relaxed mb-8">
            {localizedContent.cardIntro}
          </p>

          {/* Cost Items Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full mb-8">
            {localizedContent.costs.map(([Icon, label, desc]) => {
              const IconComp = Icon as React.ElementType;
              return (
                <div key={String(label)} className="p-5 rounded-xl border border-slate-900 bg-slate-900/30 flex flex-col items-center text-center">
                  <div className="p-2.5 rounded-lg bg-slate-950 text-slate-500 border border-slate-900 mb-3 shrink-0">
                    <IconComp className="w-5 h-5" />
                  </div>
                  <h4 className="font-bold text-xs md:text-sm text-slate-200 mb-2">
                    {String(label)}
                  </h4>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    {String(desc)}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Heartwarming Pledge Text */}
          <div className="p-5 rounded-xl border border-slate-900 bg-slate-900/20 text-center max-w-xl mb-8">
            <p className="text-xs md:text-sm text-slate-400 font-medium leading-relaxed">
              &ldquo;{localizedContent.pledgeText}&rdquo;
            </p>
          </div>

          {/* Call-to-action button (Coming Soon) */}
          <div
            className="inline-flex items-center space-x-2 px-8 py-4 rounded-xl bg-slate-900 border border-slate-800 text-slate-500 font-bold text-sm md:text-base cursor-not-allowed select-none shadow-inner"
          >
            <span>
              {localizedContent.comingSoonText}
            </span>
          </div>

          <p className="text-[10px] text-slate-600 mt-6 font-mono text-center">
            {localizedContent.footerNote}
          </p>
        </div>
      </div>
    </div>
  );
}
