import React from 'react';
import Header from '@/layouts/Header';
import Footer from '@/layouts/Footer';
import '@/app/globals.css';
import { Locale } from '@/lib/i18n';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const isKo = locale === 'ko';
  const isJa = locale === 'ja';
  
  return {
    title: isKo 
      ? 'LocalPatcher - 안전한 트레이너 한글 패치 플랫폼' 
      : isJa 
        ? 'LocalPatcher - 安全なトレーナーパッチプラットフォーム' 
        : 'LocalPatcher - Secure Trainer Localization Portal',
    description: isKo 
      ? '사용자 파일을 서버로 절대 업로드하지 않고, 브라우저 로컬에서 안전하게 1:1 영문 문자열만 덮어쓰는 게임 트레이너 다국어 패칭 유틸리티입니다.' 
      : isJa
        ? 'ファイルをアップロードすることなく、ブラウザローカルで安全にゲームトレーナーを日本語化するパッチユーティリティです。'
        : 'A safe client-side trainer patch utility that overwrites English text in game trainers with local language strings. No server uploads.',
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
