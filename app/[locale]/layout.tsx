import React from 'react';
import Header from '@/layouts/Header';
import Footer from '@/layouts/Footer';
import '@/app/globals.css';
import Script from 'next/script';
import { SITE_URL } from '@/lib/site';
import type { Locale } from '@/lib/i18n';
import { getLayoutMetadata } from '@/lib/i18n-page-content';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const currentLocale = (locale === 'en' || locale === 'ja' || locale === 'ko' || locale === 'de' || locale === 'es') ? (locale as Locale) : 'ko';
  
  const meta = getLayoutMetadata(currentLocale);
  const { title, description, keywords } = meta;

  return {
    metadataBase: new URL(SITE_URL),
    title,
    description,
    keywords,
    verification: {
      other: {
        'naver-site-verification': '3531a31999851fd3a7ad0f180edc86a1bbbbe36a',
      },
    },
    alternates: {
      canonical: `/${currentLocale}`,
      languages: {
        'ko': '/ko',
        'en': '/en',
        'ja': '/ja',
        'de': '/de',
        'es': '/es',
        'x-default': '/en',
      },
    },
    openGraph: {
      type: 'website',
      siteName: 'LocalPatcher',
      title,
      description,
      url: `${SITE_URL}/${currentLocale}`,
      locale: currentLocale === 'ko' ? 'ko_KR' : currentLocale === 'ja' ? 'ja_JP' : currentLocale === 'de' ? 'de_DE' : currentLocale === 'es' ? 'es_ES' : 'en_US',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
    icons: {
      icon: '/favicon.ico',
    }
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const currentLocale = (locale === 'en' || locale === 'ja' || locale === 'ko' || locale === 'de' || locale === 'es') ? locale as Locale : 'ko';
  const gaId = process.env.NEXT_PUBLIC_GA_ID || 'G-DDZ96EFNR3';
  const adsenseId = process.env.NEXT_PUBLIC_ADSENSE_ID;
  const hasValidAdsenseId = /^ca-pub-\d+$/.test(adsenseId || '');
  const hasValidAdSlot = [
    process.env.NEXT_PUBLIC_ADSENSE_PATCHER_MID_SLOT,
    process.env.NEXT_PUBLIC_ADSENSE_PATCHER_BOTTOM_SLOT,
    process.env.NEXT_PUBLIC_ADSENSE_HOME_MID_SLOT,
  ].some((slot) => /^\d+$/.test(slot || ''));

  return (
    <html lang={currentLocale} className="dark">
      <head>
        {hasValidAdsenseId && hasValidAdSlot && (
          <Script
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsenseId}`}
            crossOrigin="anonymous"
            strategy="lazyOnload"
          />
        )}
      </head>
      <body className="min-h-screen bg-slate-950 text-slate-100 font-sans antialiased selection:bg-cyan-500 selection:text-slate-950 flex flex-col justify-between">
        {/* Google Analytics 4 */}
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${gaId}');
          `}
        </Script>

        <div>
          <Header locale={currentLocale} />
          {children}
        </div>
        <Footer locale={currentLocale} />
      </body>
    </html>
  );
}
