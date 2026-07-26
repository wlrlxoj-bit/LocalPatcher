import type { Metadata } from 'next';
import { SITE_URL, localizedAlternates } from '@/lib/site';

import { Locale } from '@/lib/i18n/index';
import { getFaqContent } from '@/lib/i18n/index';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const currentLocale: Locale = (locale === 'en' || locale === 'ja' || locale === 'ko' || locale === 'de' || locale === 'es') ? (locale as Locale) : 'ko';
  const copy = getFaqContent(currentLocale);

  return {
    title: `${copy.title} | LocalPatcher`,
    description: copy.sub,
    alternates: {
      canonical: `${SITE_URL}/${currentLocale}/faq`,
      languages: localizedAlternates('/faq'),
    },
  };
}

export default function FAQLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
