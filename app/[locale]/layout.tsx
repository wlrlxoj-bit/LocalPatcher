import React from 'react';
import Header from '@/layouts/Header';
import Footer from '@/layouts/Footer';
import '@/app/globals.css';
import Script from 'next/script';
import { SITE_URL } from '@/lib/site';
import type { Locale } from '@/lib/i18n';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const currentLocale = (locale === 'en' || locale === 'ja' || locale === 'ko' || locale === 'de' || locale === 'es') ? locale : 'ko';
  
  const title = currentLocale === 'ko' 
    ? '게임 트레이너 한글 패치 & 다운로드 플랫폼 | LocalPatcher' 
    : currentLocale === 'ja' 
      ? 'ゲームトレーナー日本語化パッチ＆ダウンロード | LocalPatcher' 
      : currentLocale === 'de'
        ? 'LocalPatcher - Spiele-Trainer Lokalisierungs-Tool'
        : currentLocale === 'es'
          ? 'LocalPatcher - Herramienta de Localización de Trainers'
          : 'LocalPatcher - Trainer Localization Portal';
      
  const description = currentLocale === 'ko' 
    ? '스팀 게임 트레이너 및 플링(FLiNG) 치트 키 한글화 패치 플랫폼. 서버 업로드 없이 브라우저에서 로컬로 한글 패치를 적용하고 다운로드하세요.'
    : currentLocale === 'ja'
      ? 'SteamゲームトレーナーおよびFLiNGチートツールの日本語化パッチプラットフォーム。ファイルをサーバーにアップロードせず、ブラウザ上でローカルに日本語訳パッチを適用・ダウンロードできます。'
      : currentLocale === 'de'
        ? 'Ein Browser-Tool zum lokalen Übersetzen von Spiele-Trainern ohne Datei-Upload.'
        : currentLocale === 'es'
          ? 'Una herramienta de navegador para parchear trainers de juegos localmente sin subir archivos.'
          : 'A client-side trainer patch utility that replaces supported text in game trainers with localized strings without uploading files to our server.';

  const keywords = currentLocale === 'ko'
    ? ['게임', '한글', '패치', '트레이너', '치트', '스팀', '플링', '번역', '다운로드', '무료', '로컬패처', 'LocalPatcher']
    : currentLocale === 'ja'
      ? ['ゲーム', '日本語化', '日本語訳', 'パッチ', 'トレーナー', 'チート', '無料', 'ダウンロード', '日本', 'ローカルパッチャー', 'LocalPatcher']
      : currentLocale === 'de'
        ? ['spiele', 'trainer', 'cheats', 'übersetzung', 'patch', 'download', 'deutsch', 'localpatcher']
        : currentLocale === 'es'
          ? ['juegos', 'trainer', 'trucos', 'traducción', 'parche', 'descargar', 'español', 'localpatcher']
          : ['game', 'trainer', 'cheats', 'translation', 'patch', 'download', 'free', 'localized', 'localpatcher'];

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
