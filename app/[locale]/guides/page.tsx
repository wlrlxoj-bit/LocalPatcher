import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, ExternalLink, ShieldAlert } from 'lucide-react';
import { SITE_URL, localizedAlternates } from '@/lib/site';
import { Locale } from '@/lib/i18n/index';
import { getGuidesContent } from '@/lib/i18n/index';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const currentLocale: Locale = (locale === 'en' || locale === 'ja' || locale === 'ko' || locale === 'de' || locale === 'es') ? (locale as Locale) : 'ko';
  const t = getGuidesContent(currentLocale);
  return { title: `${t.title} | LocalPatcher`, description: t.description, alternates: { canonical: `${SITE_URL}/${currentLocale}/guides`, languages: localizedAlternates('/guides') } };
}

export default async function GuidesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const currentLocale: Locale = (locale === 'en' || locale === 'ja' || locale === 'ko' || locale === 'de' || locale === 'es') ? (locale as Locale) : 'ko';
  const t = getGuidesContent(currentLocale);
  return <main className="max-w-4xl mx-auto px-5 py-10 md:py-14">
    <header className="text-center mb-10">
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-cyan-500/30 bg-cyan-950/30 text-xs font-bold text-cyan-400 mb-4"><ShieldAlert className="w-4 h-4" />{t.badge}</div>
      <h1 className="font-bold text-3xl md:text-4xl text-white font-outfit">{t.title}</h1>
      <p className="mt-3 text-sm text-slate-400 leading-relaxed">{t.description}</p>
    </header>
    <section className="p-6 rounded-2xl border border-red-500/30 bg-red-950/20 mb-8 flex gap-4" aria-labelledby="online-warning">
      <AlertTriangle className="w-6 h-6 text-red-400 shrink-0" />
      <div><h2 id="online-warning" className="font-bold text-red-300">{t.warningTitle}</h2><p className="mt-2 text-sm leading-relaxed text-slate-300">{t.warning}</p></div>
    </section>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {t.sections.map(([title, text]) => <section key={title} className="p-6 rounded-2xl border border-slate-800 bg-slate-900/20"><CheckCircle2 className="w-5 h-5 text-cyan-400 mb-3" /><h2 className="font-bold text-white">{title}</h2><p className="mt-2 text-sm text-slate-400 leading-relaxed">{text}</p></section>)}
    </div>
    <p className="mt-8 p-5 rounded-xl bg-amber-500/5 border border-amber-500/20 text-sm text-slate-300 leading-relaxed">{t.note}</p>
    <nav aria-label="Legal" className="mt-6 flex flex-wrap gap-3 text-sm"><Link href={`/${currentLocale}/terms`} className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300">{t.terms}<ExternalLink className="w-3.5 h-3.5" /></Link><Link href={`/${currentLocale}/privacy`} className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300">{t.privacy}<ExternalLink className="w-3.5 h-3.5" /></Link></nav>
  </main>;
}
