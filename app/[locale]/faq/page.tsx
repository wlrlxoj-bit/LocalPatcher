'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { AlertOctagon, Ban, ChevronDown, HelpCircle, Lock } from 'lucide-react';

import { Locale } from '@/lib/i18n/index';
import { getFaqContent } from '@/lib/i18n/index';

export default function FAQPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = React.use(params);
  const currentLocale: Locale = (locale === 'en' || locale === 'ja' || locale === 'ko' || locale === 'de' || locale === 'es') ? (locale as Locale) : 'ko';
  const t = getFaqContent(currentLocale);
  const [open, setOpen] = useState<number | null>(null);

  return (
    <main className="max-w-4xl mx-auto px-5 py-10 md:py-14">
      <header className="text-center mb-10">
        <HelpCircle className="w-8 h-8 text-cyan-400 mx-auto mb-3" />
        <h1 className="text-3xl md:text-4xl font-bold text-white font-outfit">{t.title}</h1>
        <p className="mt-3 text-sm text-slate-400">{t.sub}</p>
      </header>

      <div className="space-y-4">
        {t.items.map((item, i: number) => {
          const Icon = item[0] as any;
          const q = item[1] as string;
          const a = item[2] as string;
          const buttonId = `faq-button-${i}`;
          const panelId = `faq-panel-${i}`;
          const isOpen = open === i;

          return (
            <section key={q} className="rounded-2xl border border-slate-800 overflow-hidden">
              <h2>
                <button
                  id={buttonId}
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="w-full p-5 flex items-center gap-3 text-left text-sm md:text-base font-bold text-slate-200"
                >
                  <Icon className="w-5 h-5 text-cyan-400 shrink-0" />
                  <span className="flex-1">{q}</span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
              </h2>
              {isOpen && (
                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={buttonId}
                  className="px-5 pb-5 pt-1 text-sm text-slate-400 leading-relaxed border-t border-slate-800"
                >
                  {a}
                </div>
              )}
            </section>
          );
        })}
      </div>

      <Link href={`/${currentLocale}/guides`} className="mt-8 inline-flex items-center gap-2 text-cyan-400 hover:text-cyan-300">
        <AlertOctagon className="w-4 h-4" />
        {t.guide}
      </Link>
    </main>
  );
}
