import React from 'react';
import { notFound } from 'next/navigation';
import PatcherClient from '@/components/PatcherClient';
import { getGameBySlug, getTrainersForGame, getMappingsForTrainers } from '@/lib/supabase';
import { Locale } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

interface PatcherPageProps {
  params: Promise<{
    locale: string;
    game_slug: string;
  }>;
}

export async function generateMetadata({ params }: PatcherPageProps) {
  const { locale, game_slug } = await params;
  const currentLocale = (locale === 'en' || locale === 'ja' || locale === 'ko') ? locale : 'ko';

  const game = await getGameBySlug(game_slug);
  if (!game) {
    return {};
  }

  const trainers = await getTrainersForGame(game.id);
  const versionsStr = trainers && trainers.length > 0
    ? trainers.map(t => t.version_str).join(', ')
    : '';

  let title = '';
  let description = '';

  if (currentLocale === 'ko') {
    title = `${game.title_ko} 트레이너 한글 패치 - 100% 안전한 무설치 로컬 패처 | LocalPatcher`;
    description = `${game.title_ko} (${game.title_en}) 최신 트레이너 한글 번역 패치(${versionsStr})를 제공합니다. 서버에 파일을 올릴 필요 없이, 웹브라우저에서 3초 만에 안전하게 한글로 변환하여 사용하세요.`;
  } else if (currentLocale === 'ja') {
    title = `${game.title_en} ${game.title_ko !== game.title_en ? `(${game.title_ko})` : ''} トレーナー日本語化パッチ - 安全なウェブ版ローカル変換 | LocalPatcher`;
    description = `${game.title_en}の最新トレーナー用日本語化翻訳パッチ(${versionsStr})です。サーバーにファイルを一切アップロードせず、Webブラウザ内で完全にローカルで日本語化できます。`;
  } else {
    title = `${game.title_en} Trainer Translation & Localization Patch | LocalPatcher`;
    description = `Apply client-side translation and localization patches for ${game.title_en} game trainers (${versionsStr}). Safely modify original files directly in your web browser with no server uploads.`;
  }

  const gameName = game.title_ko || game.title_en;
  const gameNameEn = game.title_en;

  const keywords = currentLocale === 'ko'
    ? [gameName, gameNameEn, '게임', '한글', '패치', '트레이너', '치트', '스팀', '플링', '번역', '다운로드', '무료']
    : currentLocale === 'ja'
      ? [gameNameEn, gameName !== gameNameEn ? gameName : '', 'ゲーム', '日本語化', 'パッチ', 'トレーナー', 'チート', '無料', 'ダウンロード', '日本'].filter(Boolean)
      : [gameNameEn, 'game', 'trainer', 'cheats', 'translation', 'patch', 'download', 'free', 'localized'];

  return {
    title,
    description,
    keywords,
    alternates: {
      canonical: `/${currentLocale}/patcher/${game_slug}`,
      languages: {
        'ko': `/ko/patcher/${game_slug}`,
        'en': `/en/patcher/${game_slug}`,
        'ja': `/ja/patcher/${game_slug}`,
        'x-default': `/en/patcher/${game_slug}`,
      },
    },
    openGraph: {
      type: 'website',
      title,
      description,
      url: `https://local-patcher.vercel.app/${currentLocale}/patcher/${game_slug}`,
      images: [
        {
          url: game.cover_image_url,
          width: 460,
          height: 215,
          alt: `${game.title_en} Steam Cover Image`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [game.cover_image_url],
    },
  };
}

export default async function PatcherPage({ params }: PatcherPageProps) {
  const { locale, game_slug } = await params;
  const currentLocale = (locale === 'en' || locale === 'ja' || locale === 'ko') ? locale : 'ko';

  // 1. Fetch game details
  const game = await getGameBySlug(game_slug);
  if (!game) {
    notFound();
  }

  // 2. Fetch trainers for this game
  const trainers = await getTrainersForGame(game.id);
  if (!trainers || trainers.length === 0) {
    notFound();
  }

  // 3. Pre-fetch mappings for all trainers of this game in a single batch query
  const mappingsMap = await getMappingsForTrainers(trainers.map(t => t.id), currentLocale);

  // 4. Build JSON-LD structured data for SoftwareApplication
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    'name': `${game.title_en} Trainer Local Patcher`,
    'operatingSystem': 'Windows',
    'applicationCategory': 'GameApplication',
    'offers': {
      '@type': 'Offer',
      'price': '0',
      'priceCurrency': 'USD',
    },
    'description': currentLocale === 'ko'
      ? `${game.title_ko} (${game.title_en})의 최신 트레이너 한글 패치를 브라우저 로컬에서 설치 없이 안전하게 지원하는 유틸리티입니다.`
      : currentLocale === 'ja'
        ? `${game.title_en}の最新トレーナー日本語化パッチをブラウザローカルで安全かつ迅速に適用するツール。`
        : `Free browser-based patch tool to translate and localize ${game.title_en} game trainers client-side.`,
    'screenshot': game.cover_image_url,
    'softwareVersion': trainers[0]?.version_str || '1.0',
    'downloadUrl': `https://local-patcher.vercel.app/${currentLocale}/patcher/${game_slug}`,
  };

  const partnerKey = process.env.NEXT_PUBLIC_HUMBLE_PARTNER_KEY;
  const purchaseUrl = partnerKey
    ? `https://www.humblebundle.com/store/search?search=${encodeURIComponent(game.title_en)}&partner=${partnerKey}`
    : `https://store.steampowered.com/search/?term=${encodeURIComponent(game.title_en)}`;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      
      {/* 제휴사 할인 버튼 배너 */}
      <div className="max-w-4xl mx-auto px-6 pt-6 -mb-6">
        <a
          href={purchaseUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full flex items-center justify-between p-4 rounded-xl border border-emerald-500/20 bg-emerald-950/10 text-emerald-400 hover:bg-emerald-500/20 transition-all duration-200 shadow-md group"
        >
          <div className="flex items-center space-x-2">
            <span className="font-bold text-sm">
              {currentLocale === 'ko'
                ? '🎁 이 게임 최저가로 구매하기'
                : currentLocale === 'ja'
                  ? '🎁 このゲームを最安値で購入'
                  : '🎁 Buy This Game at Lowest Price'}
            </span>
            <span className="text-xs text-emerald-500/70">
              {currentLocale === 'ko'
                ? '(험블번들 제휴 할인 혜택 제공)'
                : currentLocale === 'ja'
                  ? '(Humble Bundle 提携割引特典提供)'
                  : '(Humble Bundle Partner Deal)'}
            </span>
          </div>
          <span className="text-sm font-bold group-hover:translate-x-1 transition-transform">↗</span>
        </a>
      </div>

      <PatcherClient
        game={game}
        trainers={trainers.map(t => ({
          id: t.id,
          version_str: t.version_str,
          original_file_hash: t.original_file_hash,
          original_file_size: t.original_file_size
        }))}
        mappingsMap={mappingsMap}
        locale={currentLocale as Locale}
      />
    </>
  );
}
