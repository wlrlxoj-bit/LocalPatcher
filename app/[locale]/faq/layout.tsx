import type { Metadata } from 'next';
import { SITE_URL, localizedAlternates } from '@/lib/site';

import { Locale } from '@/lib/i18n/index';
import { getFaqContent } from '@/lib/i18n/index';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const currentLocale: Locale = (locale === 'en' || locale === 'ja' || locale === 'ko' || locale === 'de' || locale === 'es') ? (locale as Locale) : 'ko';
  const copy = getFaqContent(currentLocale);
  const title = `${copy.title} | LocalPatcher`;
  const url = `${SITE_URL}/${currentLocale}/faq`;

  return {
    title,
    description: copy.sub,
    ...(currentLocale === 'en' ? { robots: { index: false, follow: true } } : {}),
    alternates: {
      canonical: url,
      languages: localizedAlternates('/faq'),
    },
    openGraph: {
      type: 'website',
      siteName: 'LocalPatcher',
      title,
      description: copy.sub,
      url,
    },
  };
}

export default function FAQLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
