import Link from 'next/link';
import { AlertOctagon, ChevronDown, HelpCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Locale, getFaqContent } from '@/lib/i18n/index';

export default async function FAQPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const currentLocale: Locale = (locale === 'en' || locale === 'ja' || locale === 'ko' || locale === 'de' || locale === 'es') ? (locale as Locale) : 'ko';
  const t = getFaqContent(currentLocale);
  const items = t.items as [LucideIcon, string, string][];

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(([, q, a]) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: a,
      },
    })),
  };

  return (
    <article className="max-w-4xl mx-auto px-5 py-10 md:py-14">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd).replace(/</g, '\\u003c') }}
      />
      <header className="text-center mb-10">
        <HelpCircle className="w-8 h-8 text-cyan-400 mx-auto mb-3" />
        <h1 className="text-3xl md:text-4xl font-bold text-white font-outfit">{t.title}</h1>
        <p className="mt-3 text-sm text-slate-400">{t.sub}</p>
      </header>

      {/* 모든 FAQ 답변은 초기 SSR HTML에 포함되어 검색엔진이 즉시 색인할 수 있습니다. */}
      <div className="space-y-4">
        {items.map(([Icon, q, a], i) => (
          <details
            key={q}
            open={i === 0}
            className="group rounded-2xl border border-slate-800 overflow-hidden"
          >
            <summary className="list-none cursor-pointer w-full p-5 flex items-center gap-3 text-left text-sm md:text-base font-bold text-slate-200 [&::-webkit-details-marker]:hidden">
              <Icon className="w-5 h-5 text-cyan-400 shrink-0" />
              <h2 className="flex-1 text-sm md:text-base font-bold text-slate-200">{q}</h2>
              <ChevronDown className="w-4 h-4 shrink-0 transition-transform group-open:rotate-180" />
            </summary>
            <div className="px-5 pb-5 pt-3 text-sm text-slate-400 leading-relaxed border-t border-slate-800">
              {a}
            </div>
          </details>
        ))}
      </div>

      <Link
        href={`/${currentLocale}/guides`}
        prefetch={false}
        className="mt-8 inline-flex items-center gap-2 text-cyan-400 hover:text-cyan-300"
      >
        <AlertOctagon className="w-4 h-4" />
        {t.guide}
      </Link>
    </article>
  );
}
