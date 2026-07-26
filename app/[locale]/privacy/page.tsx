import Link from 'next/link';
import { ArrowLeft, Shield } from 'lucide-react';
import { getDictionary, Locale } from '@/lib/i18n';
import type { Metadata } from 'next';
import { SITE_URL, localizedAlternates } from '@/lib/site';
import { getPrivacyContent } from '@/lib/i18n-page-content';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const currentLocale: Locale = (locale === 'en' || locale === 'ja' || locale === 'ko' || locale === 'de' || locale === 'es') ? locale as Locale : 'ko';
  const page = getPrivacyContent(currentLocale);

  return {
    title: `${page.title} | LocalPatcher`,
    description: page.subtitle,
    alternates: {
      canonical: `${SITE_URL}/${currentLocale}/privacy`,
      languages: localizedAlternates('/privacy'),
    },
  };
}

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const currentLocale: Locale = (locale === 'en' || locale === 'ja' || locale === 'ko' || locale === 'de' || locale === 'es') ? locale as Locale : 'ko';
  const t = getDictionary(currentLocale);
  const page = getPrivacyContent(currentLocale);

  return <main className="max-w-4xl mx-auto px-6 py-12">
    <Link href={`/${currentLocale}`} className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-cyan-400"><ArrowLeft className="w-3.5 h-3.5" />{t.backToHome}</Link>
    <header className="text-center my-12"><Shield className="w-8 h-8 text-cyan-400 mx-auto mb-4" /><h1 className="font-bold text-3xl text-white">{page.title}</h1><p className="text-slate-400 text-sm mt-3">{page.subtitle}</p><p className="text-xs text-slate-500 mt-3">{page.updated}</p></header>
    <p className="p-5 mb-8 rounded-2xl border border-cyan-500/20 bg-cyan-950/10 text-xs leading-relaxed text-slate-300">{page.notice}</p>
    <div className="space-y-6">{page.sections.map(([Icon, title, text]) => {
      const IconComp = Icon as React.ElementType;
      return (
        <section key={String(title)} className="p-6 rounded-2xl border border-slate-800 bg-slate-900/20">
          <IconComp className="w-5 h-5 text-cyan-400 mb-3" />
          <h2 className="font-bold text-white">{String(title)}</h2>
          <p className="text-sm leading-relaxed text-slate-400 mt-3">{String(text)}</p>
        </section>
      );
    })}</div>
  </main>;
}
