import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Bug, ExternalLink, FileWarning, ShieldAlert } from 'lucide-react';
import { SITE_URL, localizedAlternates } from '@/lib/site';
import type { Locale } from '@/lib/i18n';
import { getContactContent } from '@/lib/i18n-page-content';

const localeOf = (value: string): Locale => (value === 'en' || value === 'ja' || value === 'ko' || value === 'de' || value === 'es') ? value as Locale : 'ko';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> { 
  const current = localeOf((await params).locale); 
  const page = getContactContent(current); 
  return { title: `${page.title} | LocalPatcher`, description: page.description, alternates: { canonical: `${SITE_URL}/${current}/contact`, languages: localizedAlternates('/contact') } }; 
}

export default async function ContactPage({ params }: { params: Promise<{ locale: string }> }) { 
  const current = localeOf((await params).locale); 
  const page = getContactContent(current); 
  const icons = [FileWarning, Bug, Bug]; 
  return <main className="max-w-4xl mx-auto px-5 sm:px-6 py-10 md:py-14"><Link href={`/${current}`} className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-cyan-400"><ArrowLeft className="w-4 h-4" />{page.back}</Link><header className="my-10"><h1 className="text-3xl md:text-4xl font-bold text-white">{page.title}</h1><p className="mt-4 rounded-2xl border border-cyan-500/20 bg-cyan-950/20 p-5 text-sm leading-7 text-slate-300">{page.notice}</p><a href="https://github.com/wlrlxoj-bit/LocalPatcher/issues" target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-5 py-3 text-sm font-bold text-slate-950 hover:bg-cyan-400">{page.action}<ExternalLink className="w-4 h-4" /></a></header><div className="grid gap-5 md:grid-cols-3">{page.items.map(([title, text], index: number) => { const Icon = icons[index]; return <section key={title} className="rounded-2xl border border-slate-800 bg-slate-900/30 p-6"><Icon className="w-5 h-5 text-cyan-400" /><h2 className="mt-4 font-bold text-white">{title}</h2><p className="mt-3 text-sm leading-7 text-slate-400">{text}</p></section>; })}</div><aside className="mt-8 flex gap-3 rounded-2xl border border-amber-500/20 bg-amber-950/10 p-5 text-sm leading-7 text-amber-100/80"><ShieldAlert className="mt-1 w-5 h-5 shrink-0 text-amber-400" /><p>{page.privacy}</p></aside></main>; 
}
