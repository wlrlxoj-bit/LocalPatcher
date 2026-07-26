import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, FileCheck2, Monitor, ShieldOff } from 'lucide-react';
import { SITE_URL, localizedAlternates } from '@/lib/site';
import type { Locale } from '@/lib/i18n';
import { getAboutContent } from '@/lib/i18n-page-content';

const localeOf = (value: string): Locale => (value === 'en' || value === 'ja' || value === 'ko' || value === 'de' || value === 'es') ? value as Locale : 'ko';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> { 
  const { locale } = await params; 
  const current = localeOf(locale); 
  const page = getAboutContent(current); 
  return { title: `${page.title} | LocalPatcher`, description: page.description, alternates: { canonical: `${SITE_URL}/${current}/about`, languages: localizedAlternates('/about') } }; 
}

export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) { 
  const current = localeOf((await params).locale); 
  const page = getAboutContent(current); 
  const icons = [Monitor, FileCheck2, FileCheck2, ShieldOff]; 
  return <main className="max-w-4xl mx-auto px-5 sm:px-6 py-10 md:py-14"><Link href={`/${current}`} className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-cyan-400"><ArrowLeft className="w-4 h-4" />{page.back}</Link><header className="my-10"><h1 className="text-3xl md:text-4xl font-bold text-white">{page.title}</h1><p className="mt-4 text-slate-300 leading-relaxed">{page.intro}</p></header><div className="grid gap-5 md:grid-cols-2">{page.sections.map(([title, text], index: number) => { const Icon = icons[index]; return <section key={title} className="rounded-2xl border border-slate-800 bg-slate-900/30 p-6"><Icon className="w-5 h-5 text-cyan-400" /><h2 className="mt-4 text-lg font-bold text-white">{title}</h2><p className="mt-3 text-sm leading-7 text-slate-400">{text}</p></section>; })}</div></main>; 
}
