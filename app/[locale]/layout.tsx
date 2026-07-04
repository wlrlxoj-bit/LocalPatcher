import React from 'react';
import Header from '@/layouts/Header';
import Footer from '@/layouts/Footer';
import '@/app/globals.css';
import { Locale } from '@/lib/i18n';
import Script from 'next/script';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const currentLocale = (locale === 'en' || locale === 'ja' || locale === 'ko') ? locale : 'ko';
  
  const isKo = currentLocale === 'ko';
  const isJa = currentLocale === 'ja';
  
  const title = isKo 
    ? '게임 트레이너 한글 패치 & 다운로드 플랫폼 | LocalPatcher' 
    : isJa 
      ? 'LocalPatcher - 安全なトレーナーパッチプラットフォーム' 
      : 'LocalPatcher - Secure Trainer Localization Portal';
      
  const description = isKo 
    ? '스팀 게임 트레이너 및 플링(FLiNG) 치트 키 한글화 패치 플랫폼. 서버 업로드 없이 브라우저 로컬에서 100% 안전하고 간편하게 한글 패치를 적용하고 다운로드하세요.' 
    : isJa
      ? 'ファイルをアップロードすることなく、ブラウザローカルで安全にゲームトレーナーを日本語化するパッチユーティリティです。'
      : 'A safe client-side trainer patch utility that overwrites English text in game trainers with local language strings. No server uploads.';

  return {
    metadataBase: new URL('https://local-patcher.vercel.app'),
    title,
    description,
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
      url: `https://local-patcher.vercel.app/${currentLocale}`,
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

  return (
    <html lang={currentLocale}>
      <head>
        {process.env.NEXT_PUBLIC_GA_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GA_ID}`}
              strategy="afterInteractive"
            />
            <Script id="google-analytics" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${process.env.NEXT_PUBLIC_GA_ID}', {
                  page_path: window.location.pathname,
                });
              `}
            </Script>
          </>
        )}
      </head>
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
