import Link from 'next/link';
import { ArrowLeft, FileText, ShieldAlert } from 'lucide-react';
import { getDictionary, Locale } from '@/lib/i18n';
import type { Metadata } from 'next';
import { SITE_URL, localizedAlternates } from '@/lib/site';
import { getTermsContent } from '@/lib/i18n-page-content';
import React from 'react';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const currentLocale: Locale = (locale === 'en' || locale === 'ja' || locale === 'ko' || locale === 'de' || locale === 'es') ? locale as Locale : 'ko';
  const page = getTermsContent(currentLocale);

  return {
    title: `${page.title} | LocalPatcher`,
    description: page.subtitle,
    alternates: {
      canonical: `${SITE_URL}/${currentLocale}/terms`,
      languages: localizedAlternates('/terms'),
    },
  };
}

export default async function TermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const currentLocale: Locale = (locale === 'en' || locale === 'ja' || locale === 'ko' || locale === 'de' || locale === 'es') ? locale as Locale : 'ko';
  const t = getDictionary(currentLocale);
  const page = getTermsContent(currentLocale);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      <Link href={`/${currentLocale}`} className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 transition-colors hover:text-cyan-400">
        <ArrowLeft className="h-3.5 w-3.5" />{t.backToHome}
      </Link>
      <header className="my-10 text-center sm:my-14">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10">
          <FileText className="h-7 w-7 text-cyan-400" />
        </div>
        <h1 className="text-3xl font-bold text-white sm:text-4xl">{page.title}</h1>
        <p className="mt-3 text-sm text-slate-400">{page.subtitle}</p>
        <p className="mt-3 text-xs text-slate-500">{page.updated}</p>
      </header>
      <div className="mb-8 rounded-2xl border border-amber-500/25 bg-amber-950/20 p-5 sm:p-6">
        <div className="flex gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
          <p className="text-sm leading-7 text-slate-300">{page.warning}</p>
        </div>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        {page.sections.map(([Icon, title, text]) => {
          const IconComp = Icon as React.ElementType;
          return (
            <section key={String(title)} className="rounded-2xl border border-slate-800 bg-slate-900/30 p-5 transition-colors hover:border-slate-700 sm:p-6">
              <IconComp className="mb-3 h-5 w-5 text-cyan-400" />
              <h2 className="font-bold leading-6 text-white">{String(title)}</h2>
              <p className="mt-3 text-sm leading-7 text-slate-400">{String(text)}</p>
            </section>
          );
        })}
      </div>
      <aside className="mt-8 rounded-2xl border border-cyan-500/20 bg-cyan-950/10 p-5 text-sm leading-7 text-slate-300 sm:p-6">
        {page.privacy}{' '}
        <Link href={`/${currentLocale}/privacy`} className="font-semibold text-cyan-400 underline decoration-cyan-400/30 underline-offset-4 hover:text-cyan-300">
          {t.viewPrivacyPolicyLink}
        </Link>
      </aside>
    </main>
  );
}
