import type { Metadata } from 'next';
import { SITE_URL, localizedAlternates } from '@/lib/site';

import { Locale } from '@/lib/i18n';

const metadataCopy: Partial<Record<Locale, { title: string; description: string }>> = {
  ko: {
    title: '자주 묻는 질문',
    description: '파일 처리, 백신 경고 및 안전한 이용 방법을 안내합니다.',
  },
  en: {
    title: 'Frequently Asked Questions',
    description: 'File processing, antivirus alerts, and safer use.',
  },
  ja: {
    title: 'よくある質問',
    description: 'ファイル処理、ウイルス対策ソフトの警告、安全な利用方法をご案内します。',
  },
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const currentLocale: Locale = (locale === 'en' || locale === 'ja' || locale === 'ko' || locale === 'de' || locale === 'es') ? (locale as Locale) : 'ko';
  const copy = (metadataCopy as Record<string, any>)[currentLocale] || metadataCopy.en;

  return {
    title: `${copy.title} | LocalPatcher`,
    description: copy.description,
    alternates: {
      canonical: `${SITE_URL}/${currentLocale}/faq`,
      languages: localizedAlternates('/faq'),
    },
  };
}

export default function FAQLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
