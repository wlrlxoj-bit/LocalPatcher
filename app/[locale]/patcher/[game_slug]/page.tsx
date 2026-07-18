import React from 'react';
import { notFound } from 'next/navigation';
import PatcherClient from '@/components/PatcherClient';
import { getGameBySlug, getTrainersForGame, getMappingsForTrainers } from '@/lib/supabase';
import { Locale } from '@/lib/i18n';
import { SITE_URL } from '@/lib/site';

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
    title = `${game.title_ko} 트레이너 한글 패치 - 무설치 브라우저 로컬 변환 | LocalPatcher`;
    description = `${game.title_ko} (${game.title_en}) 트레이너 한글 번역 패치(${versionsStr})를 제공합니다. 파일을 서버에 올리지 않고 웹브라우저에서 로컬로 변환할 수 있습니다.`;
  } else if (currentLocale === 'ja') {
    const titleJa = game.title_ja || game.title_en;
    title = `${titleJa} トレーナー日本語化パッチ - ブラウザでのローカル変換 | LocalPatcher`;
    description = `${titleJa}の最新トレーナー用日本語化翻訳パッチ(${versionsStr})です。サーバーにファイルを一切アップロードせず、Webブラウザ内で完全にローカルで日本語化できます。`;
  } else {
    title = `${game.title_en} Trainer Translation & Localization Patch | LocalPatcher`;
    description = `Apply client-side translation and localization patches for ${game.title_en} game trainers (${versionsStr}) directly in your web browser with no server uploads.`;
  }

  const gameName = currentLocale === 'ko' ? game.title_ko : currentLocale === 'ja' ? (game.title_ja || game.title_en) : game.title_en;
  const gameNameEn = game.title_en;

  const keywords = currentLocale === 'ko'
    ? [gameName, gameNameEn, '게임', '한글', '패치', '트레이너', '치트', '스팀', '플링', '번역', '다운로드', '무료']
    : currentLocale === 'ja'
      ? [gameName, gameNameEn, 'ゲーム', '日本語化', 'パッチ', 'トレーナー', 'チート', '無料', 'ダウンロード', '日本'].filter(Boolean)
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
      url: `${SITE_URL}/${currentLocale}/patcher/${game_slug}`,
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
      ? `${game.title_ko} (${game.title_en}) 트레이너 한글 패치를 설치 없이 브라우저에서 로컬로 적용하는 유틸리티입니다.`
      : currentLocale === 'ja'
        ? `${game.title_en}のトレーナー日本語化パッチをブラウザ上でローカルに適用するツール。`
        : `Free browser-based patch tool to translate and localize ${game.title_en} game trainers client-side.`,
    'screenshot': game.cover_image_url,
    'softwareVersion': trainers[0]?.version_str || '1.0',
    'downloadUrl': `${SITE_URL}/${currentLocale}/patcher/${game.slug}`,
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
