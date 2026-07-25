import React from 'react';
import { notFound, permanentRedirect } from 'next/navigation';
import PatcherClient from '@/components/PatcherClient';
import {
  getGameBySlug,
  getTrainersForGame,
  getMappingsForTrainers,
  resolveGameSlugAlias,
  sortTrainersLatestFirst,
} from '@/lib/supabase';
import { Locale } from '@/lib/i18n';
import { SITE_URL } from '@/lib/site';

export const dynamic = 'force-dynamic';

interface PatcherPageProps {
  params: Promise<{
    locale: string;
    game_slug: string;
  }>;
}

const ELDEN_RING_SOURCE_SLUG = 'elden-ring-shadow-of-the-erdtree-trainer-1768067282';

async function getCanonicalPatcherData(requestedSlug: string) {
  const aliasSlug = await resolveGameSlugAlias(requestedSlug);
  const canonicalSlug = aliasSlug ?? requestedSlug;
  const game = await getGameBySlug(canonicalSlug);
  if (!game) return null;

  let trainers = await getTrainersForGame(game.id);
  if (canonicalSlug === 'elden-ring') {
    const sourceGame = await getGameBySlug(ELDEN_RING_SOURCE_SLUG);
    if (sourceGame && sourceGame.id !== game.id) {
      const sourceTrainers = await getTrainersForGame(sourceGame.id);
      const trainersById = new Map(
        [...trainers, ...sourceTrainers].map((trainer) => [trainer.id, trainer])
      );
      trainers = sortTrainersLatestFirst([...trainersById.values()]);
    }
  }

  return { canonicalSlug, game, trainers };
}

export async function generateMetadata({ params }: PatcherPageProps) {
  const { locale, game_slug } = await params;
  const currentLocale = (locale === 'en' || locale === 'ja' || locale === 'ko') ? locale : 'ko';

  const patcherData = await getCanonicalPatcherData(game_slug);
  if (!patcherData) {
    return {};
  }
  const { canonicalSlug, game, trainers } = patcherData;
  const enEligible = trainers.some((trainer) => trainer.option_count > 0);
  const eligibleTrainerIds = trainers
    .filter((trainer) => trainer.option_count > 0)
    .map((trainer) => trainer.id);
  const getLocaleMappings = (
    targetLocale: 'ko' | 'ja'
  ): Promise<Record<number, Array<unknown>>> =>
    eligibleTrainerIds.length > 0
      ? getMappingsForTrainers(eligibleTrainerIds, targetLocale)
      : Promise.resolve({} as Record<number, Array<unknown>>);
  const [koMappings, jaMappings] = await Promise.all([
    getLocaleMappings('ko'),
    getLocaleMappings('ja'),
  ]);
  const koEligible = Object.values(koMappings).some((mappings) => mappings.length > 0);
  const jaEligible = Object.values(jaMappings).some((mappings) => mappings.length > 0);
  const indexEligible = currentLocale === 'en'
    ? enEligible
    : currentLocale === 'ko'
      ? koEligible
      : jaEligible;
  const latestTrainer = trainers[0];
  const metadataMappings = latestTrainer
    ? await getMappingsForTrainers([latestTrainer.id], currentLocale)
    : {};
  const hasApprovedTranslation = latestTrainer
    ? (metadataMappings[latestTrainer.id] || []).length > 0
    : false;
  const alternateLanguages: Record<string, string> = {};
  if (enEligible) {
    alternateLanguages.en = `/en/patcher/${canonicalSlug}`;
    alternateLanguages['x-default'] = `/en/patcher/${canonicalSlug}`;
  }
  if (koEligible) alternateLanguages.ko = `/ko/patcher/${canonicalSlug}`;
  if (jaEligible) alternateLanguages.ja = `/ja/patcher/${canonicalSlug}`;
  const versionsStr = trainers && trainers.length > 0
    ? trainers.map(t => t.version_str).join(', ')
    : '';

  let title = '';
  let description = '';

  if (currentLocale === 'ko') {
    title = `${game.title_ko} 트레이너 한글 패치 - 무설치 브라우저 로컬 변환 | LocalPatcher`;
    description = hasApprovedTranslation
      ? `${game.title_ko} (${game.title_en}) 트레이너 한글 번역 패치(${versionsStr})를 제공합니다. 파일을 서버에 올리지 않고 웹브라우저에서 로컬로 변환할 수 있습니다.`
      : `${game.title_ko} (${game.title_en}) 트레이너(${versionsStr})의 변환 지원 정보와 번역 검수 상태를 확인하세요. 파일은 서버에 업로드되지 않습니다.`;
  } else if (currentLocale === 'ja') {
    const titleJa = game.title_ja || game.title_en;
    title = `${titleJa} トレーナー日本語化パッチ - ブラウザでのローカル変換 | LocalPatcher`;
    description = hasApprovedTranslation
      ? `${titleJa}の最新トレーナー用日本語化翻訳パッチ(${versionsStr})です。サーバーにファイルを一切アップロードせず、Webブラウザ内で完全にローカルで日本語化できます。`
      : `${titleJa}のトレーナー(${versionsStr})に関する変換対応情報と翻訳レビュー状況を確認できます。ファイルはサーバーにアップロードされません。`;
  } else {
    title = `${game.title_en} Original Trainer Information & Compatibility | LocalPatcher`;
    description = `Check original English trainer versions, supported option counts, compatibility, and the official download source for ${game.title_en} (${versionsStr}).`;
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
    robots: indexEligible ? { index: true, follow: true } : { index: false, follow: true },
    alternates: {
      canonical: `/${currentLocale}/patcher/${canonicalSlug}`,
      ...(Object.keys(alternateLanguages).length > 0 ? { languages: alternateLanguages } : {}),
    },
    openGraph: {
      type: 'website',
      title,
      description,
      url: `${SITE_URL}/${currentLocale}/patcher/${canonicalSlug}`,
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
  const patcherData = await getCanonicalPatcherData(game_slug);
  if (patcherData && patcherData.canonicalSlug !== game_slug) {
    permanentRedirect(`/${currentLocale}/patcher/${patcherData.canonicalSlug}`);
  }
  let game = patcherData?.game ?? null;
  if (!game && game_slug.endsWith('-trainer')) {
    const canonicalSlug = game_slug.slice(0, -'-trainer'.length);
    game = await getGameBySlug(canonicalSlug);
    if (game) {
      permanentRedirect(`/${currentLocale}/patcher/${canonicalSlug}`);
    }
  }
  if (!game) {
    notFound();
  }

  // 2. Fetch trainers for this game
  const trainers = patcherData?.trainers ?? await getTrainersForGame(game.id);
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
        : `Original English trainer version, option count, compatibility, and official source information for ${game.title_en}.`,
    'screenshot': game.cover_image_url,
    'softwareVersion': trainers[0]?.version_str || '1.0',
    'downloadUrl': `${SITE_URL}/${currentLocale}/patcher/${patcherData?.canonicalSlug ?? game.slug}`,
  };

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
          original_file_size: t.original_file_size,
          option_count: t.option_count
        }))}
        mappingsMap={mappingsMap}
        locale={currentLocale as Locale}
      />
    </>
  );
}
