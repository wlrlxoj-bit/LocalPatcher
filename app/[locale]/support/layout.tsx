import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { SITE_URL, localizedAlternates } from '@/lib/site';
import type { Locale } from '@/lib/i18n/index';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const currentLocale: Locale = (locale === 'en' || locale === 'ja' || locale === 'ko' || locale === 'de' || locale === 'es')
    ? (locale as Locale)
    : 'ko';

  return {
    robots: { index: false, follow: true },
    alternates: {
      canonical: `${SITE_URL}/${currentLocale}/support`,
      languages: localizedAlternates('/support'),
    },
  };
}

export default function SupportLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
