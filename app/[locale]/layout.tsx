import React from 'react';
import Header from '@/layouts/Header';
import Footer from '@/layouts/Footer';
import '@/app/globals.css';
import Script from 'next/script';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const currentLocale = (locale === 'en' || locale === 'ja' || locale === 'ko') ? locale : 'ko';
  
  const isKo = currentLocale === 'ko';
  const isJa = currentLocale === 'ja';
  
  const title = isKo 
    ? '게임 트레이너 한글 패치 & 다운로드 플랫폼 | LocalPatcher' 
    : isJa 
      ? 'ゲームトレーナー日本語化パッチ＆ダウンロード | LocalPatcher' 
      : 'LocalPatcher - Trainer Localization Portal';
      
  const description = isKo 
    ? '스팀 게임 트레이너 및 플링(FLiNG) 치트 키 한글화 패치 플랫폼. 서버 업로드 없이 브라우저에서 로컬로 한글 패치를 적용하고 다운로드하세요.'
    : isJa
      ? 'SteamゲームトレーナーおよびFLiNGチートツールの日本語化パッチプラットフォーム。ファイルをサーバーにアップロードせず、ブラウザ上でローカルに日本語訳パッチを適用・ダウンロードできます。'
      : 'A client-side trainer patch utility that replaces supported text in game trainers with localized strings without uploading files to our server.';

  const keywords = isKo
    ? ['게임', '한글', '패치', '트레이너', '치트', '스팀', '플링', '번역', '다운로드', '무료', '로컬패처', 'LocalPatcher']
    : isJa
      ? ['ゲーム', '日本語化', '日本語訳', 'パッチ', 'トレーナー', 'チート', '無料', 'ダウンロード', '日本', 'ローカルパッチャー', 'LocalPatcher']
      : ['game', 'trainer', 'cheats', 'translation', 'patch', 'download', 'free', 'localized', 'localpatcher'];

  return {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://local-patcher.vercel.app'),
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
        'x-default': '/en',
      },
    },
    openGraph: {
      type: 'website',
      siteName: 'LocalPatcher',
      title,
      description,
      url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://local-patcher.vercel.app'}/${currentLocale}`,
      locale: currentLocale === 'ko' ? 'ko_KR' : currentLocale === 'ja' ? 'ja_JP' : 'en_US',
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
  const currentLocale = (locale === 'en' || locale === 'ja' || locale === 'ko') ? locale : 'ko';
  const gaId = process.env.NEXT_PUBLIC_GA_ID || 'G-DDZ96EFNR3';

  return (
    <html lang={currentLocale}>
      <head>
        {/* Impact.com 소유권 인증 */}
        <meta name="impact-site-verification" content="78fe6405-d192-45b2-9632-5604beb6e721" />
      </head>

      {/* 구글 애널리틱스(GA4) 추적 스크립트 */}
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
        strategy="afterInteractive"
      />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${gaId}', {
            page_path: window.location.pathname,
          });
        `}
      </Script>
      {process.env.NEXT_PUBLIC_ADSENSE_ID && (
        <>
          <Script
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${process.env.NEXT_PUBLIC_ADSENSE_ID}`}
            crossOrigin="anonymous"
            strategy="afterInteractive"
            data-ad-client={process.env.NEXT_PUBLIC_ADSENSE_ID}
          />
          {/* SPA 환경에서 페이지 이동 시 애드센스 광고 갱신 지원을 위한 클라이언트 헬퍼 */}
          <Script id="adsense-spa-helper" strategy="afterInteractive">
            {`
              (function() {
                let lastPathname = window.location.pathname;
                const observer = new MutationObserver(() => {
                  if (window.location.pathname !== lastPathname) {
                    lastPathname = window.location.pathname;
                    try {
                      if (window.adsbygoogle) {
                        (window.adsbygoogle = window.adsbygoogle || []).push({});
                      }
                    } catch (e) {
                      console.error('AdSense SPA update failed:', e);
                    }
                  }
                });
                observer.observe(document.documentElement, { childList: true, subtree: true });
              })();
            `}
          </Script>
        </>
      )}
      <body className="bg-slate-950 text-slate-100 min-h-screen flex flex-col font-sans antialiased selection:bg-cyan-500 selection:text-slate-950">
        <div className="relative min-h-screen flex flex-col z-0">
          {/* Background Decorative Light Gradients */}
          <div className="absolute top-0 left-1/4 w-[400px] md:w-[600px] h-[400px] md:h-[600px] bg-cyan-500/5 rounded-full blur-[100px] md:blur-[150px] pointer-events-none z-0"></div>
          <div className="absolute bottom-1/4 right-1/4 w-[500px] md:w-[700px] h-[500px] md:h-[700px] bg-indigo-500/5 rounded-full blur-[120px] md:blur-[180px] pointer-events-none z-0"></div>

          <Header locale={currentLocale} />
          
          <main className="flex-grow z-10 relative">
            {children}
          </main>

          <Footer locale={currentLocale} />
        </div>
      </body>
    </html>
  );
}
