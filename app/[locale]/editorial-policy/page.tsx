import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, BadgeCheck, Bot, Megaphone, RefreshCw } from 'lucide-react';
import { SITE_URL, localizedAlternates } from '@/lib/site';
import type { Locale } from '@/lib/i18n';
import { getEditorialContent } from '@/lib/i18n-page-content';

const localeOf = (value: string): Locale => (value === 'en' || value === 'ja' || value === 'ko' || value === 'de' || value === 'es') ? value as Locale : 'ko';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> { 
  const current = localeOf((await params).locale); 
  const page = getEditorialContent(current); 
  return { title: `${page.title} | LocalPatcher`, description: page.description, alternates: { canonical: `${SITE_URL}/${current}/editorial-policy`, languages: localizedAlternates('/editorial-policy') } }; 
}

export default async function EditorialPolicyPage({ params }: { params: Promise<{ locale: string }> }) { 
  const current = localeOf((await params).locale); 
  const page = getEditorialContent(current); 
  const icons = [BadgeCheck, BadgeCheck, RefreshCw, Bot, Megaphone]; 
  return <main className="max-w-4xl mx-auto px-5 sm:px-6 py-10 md:py-14"><Link href={`/${current}`} className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-cyan-400"><ArrowLeft className="w-4 h-4" />{page.back}</Link><header className="my-10"><h1 className="text-3xl md:text-4xl font-bold text-white">{page.title}</h1><p className="mt-4 text-slate-300 leading-relaxed">{page.intro}</p></header><div className="space-y-5">{page.sections.map(([title, text], index: number) => { const Icon = icons[index]; return <section key={title} className="rounded-2xl border border-slate-800 bg-slate-900/30 p-6"><div className="flex items-start gap-4"><Icon className="mt-0.5 w-5 h-5 shrink-0 text-cyan-400" /><div><h2 className="text-lg font-bold text-white">{title}</h2><p className="mt-3 text-sm leading-7 text-slate-400">{text}</p></div></div></section>; })}</div></main>; 
}
