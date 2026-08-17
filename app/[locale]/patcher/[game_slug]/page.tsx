import React from 'react';
import { notFound, permanentRedirect } from 'next/navigation';
import PatcherClient from '@/components/PatcherClient';
import SteamNews from '@/components/SteamNews';
import SteamPlayerCount from '@/components/SteamPlayerCount';
import SystemRequirements from '@/components/SystemRequirements';
import PatcherUniqueContent from '@/components/PatcherUniqueContent';
import {
  getGameBySlug,
  getTrainersForGame,
  getLatestUnapprovedStatusesForTrainers,
  getMappingsForTrainers,
  resolveGameSlugAlias,
  getPopularGamesWithTrainers,
  getRelatedGames,
  sortTrainersLatestFirst,
} from '@/lib/supabase';
import { Locale, getGameTitle, getPatcherDict } from '@/lib/i18n/index';
import { translateGenre } from '@/lib/i18n/genres';
import { SITE_URL } from '@/lib/site';
import { extractSteamAppId } from '@/lib/steam';

export const revalidate = 3600; // 1 hour ISR cache

export async function generateStaticParams() {
  const locales = ['ko', 'en', 'ja', 'de', 'es'];
  const popularGames = await getPopularGamesWithTrainers();
  
  const params: { locale: string; game_slug: string }[] = [];
  
  for (const locale of locales) {
    for (const game of popularGames) {
      params.push({ locale, game_slug: game.slug });
    }
  }
  
  return params;
}
interface PatcherPageProps {
  params: Promise<{
    locale: string;
    game_slug: string;
  }>;
}

const ELDEN_RING_SOURCE_SLUG = 'elden-ring-shadow-of-the-erdtree-trainer-1768067282';

async function getCanonicalPatcherData(requestedSlug: string) {
  const aliasSlug = await resolveGameSlugAlias(requestedSlug);
  let canonicalSlug = aliasSlug ?? requestedSlug;
  let game = await getGameBySlug(canonicalSlug);

  if (!game && canonicalSlug.endsWith('-trainer')) {
    const fallbackSlug = canonicalSlug.slice(0, -'-trainer'.length);
    const fallbackGame = await getGameBySlug(fallbackSlug);
    if (fallbackGame) {
      canonicalSlug = fallbackSlug;
      game = fallbackGame;
    }
  }

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
  const currentLocale = (locale === 'en' || locale === 'ja' || locale === 'ko' || locale === 'de' || locale === 'es') ? locale : 'ko';

  const patcherData = await getCanonicalPatcherData(game_slug);
  if (!patcherData) {
    return {};
  }
  
  if (patcherData.canonicalSlug !== game_slug) {
    permanentRedirect(`/${currentLocale}/patcher/${patcherData.canonicalSlug}`);
  }

  const { canonicalSlug, game, trainers } = patcherData;
  const enEligible = trainers.some((trainer) => trainer.option_count > 0);
  const eligibleTrainerIds = trainers
    .filter((trainer) => trainer.option_count > 0)
    .map((trainer) => trainer.id);
  const latestTrainer = trainers[0];
  const metadataMappings = latestTrainer
    ? await getMappingsForTrainers([latestTrainer.id], currentLocale)
    : {};
  const hasApprovedTranslation = latestTrainer
    ? (metadataMappings[latestTrainer.id] || []).length > 0
    : false;

  // 영어나 다국어 번역 여부에 관계없이 트레이너(옵션)가 존재하면 무조건 색인(Index)을 허용합니다.
  const indexEligible = enEligible;

  const alternateLanguages: Record<string, string> = {
    en: `/en/patcher/${canonicalSlug}`,
    'x-default': `/en/patcher/${canonicalSlug}`,
    ko: `/ko/patcher/${canonicalSlug}`,
    ja: `/ja/patcher/${canonicalSlug}`,
    de: `/de/patcher/${canonicalSlug}`,
    es: `/es/patcher/${canonicalSlug}`,
  };

  const versionsStr = trainers && trainers.length > 0
    ? trainers.map(t => t.version_str).join(', ')
    : '';

  const pt = getPatcherDict(currentLocale as Locale);
  const gameName = getGameTitle(game, currentLocale as Locale);
  const gameNameEn = game.title_en;

  const title = hasApprovedTranslation 
    ? pt.metaTitleApproved.replace('{gameTitle}', gameName).replace('{gameTitleEn}', gameNameEn)
    : pt.metaTitleUnapproved.replace('{gameTitle}', gameName).replace('{gameTitleEn}', gameNameEn);
    
  const description = hasApprovedTranslation
    ? pt.metaDescApproved.replace('{gameTitle}', gameName).replace('{gameTitleEn}', gameNameEn).replace('{versionsStr}', versionsStr)
    : pt.metaDescUnapproved.replace('{gameTitle}', gameName).replace('{gameTitleEn}', gameNameEn).replace('{versionsStr}', versionsStr);

  const baseKeywords = pt.metaKeywords.map(k => k.replace('{gameTitle}', gameName).replace('{gameTitleEn}', gameNameEn));
  const rawDynamic = [...(game.genres || []), ...(game.tags || [])].filter(Boolean);
  const dynamicKeywords = rawDynamic.map(tag => {
    // Only translate if locale is not 'en'
    if (locale !== 'en') {
      const translated = translateGenre(tag, locale);
      return translated !== tag ? `${translated}, ${tag}` : tag; // Include both localized and English if translated
    }
    return tag;
  });
  
  const keywords = [...baseKeywords, ...dynamicKeywords];

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
  const currentLocale = (locale === 'en' || locale === 'ja' || locale === 'ko' || locale === 'de' || locale === 'es') ? locale : 'ko';

  // 1. Fetch game details
  const patcherData = await getCanonicalPatcherData(game_slug);
  if (patcherData && patcherData.canonicalSlug !== game_slug) {
    permanentRedirect(`/${currentLocale}/patcher/${patcherData.canonicalSlug}`);
  }
  
  const game = patcherData?.game ?? null;
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
  const unapprovedStatusMap = currentLocale === 'ko' || currentLocale === 'ja'
    ? await getLatestUnapprovedStatusesForTrainers(trainers.map(t => t.id), currentLocale)
    : {};

  // 4. Build JSON-LD structured data for SoftwareApplication

  // 4. Build JSON-LD structured data for SoftwareApplication
  const pt = getPatcherDict(currentLocale as Locale);

  const popularGames = await getPopularGamesWithTrainers();
  const relatedGames = await getRelatedGames(game.id);

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
    'description': pt.jsonLdDescription.replace('{gameTitleKo}', game.title_ko || game.title_en).replace('{gameTitleEn}', game.title_en),
    'screenshot': game.cover_image_url,
    'softwareVersion': trainers[0]?.version_str || '1.0',
    'downloadUrl': `${SITE_URL}/${currentLocale}/patcher/${patcherData?.canonicalSlug ?? game.slug}`,
  };

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    'mainEntity': [
      {
        '@type': 'Question',
        'name': pt.jsonLdFaq1Q.replace('{gameTitle}', game.title_ko || game.title_en).replace('{gameTitleEn}', game.title_en),
        'acceptedAnswer': {
          '@type': 'Answer',
          'text': pt.jsonLdFaq1A
        }
      },
      {
        '@type': 'Question',
        'name': pt.jsonLdFaq2Q.replace('{gameTitle}', game.title_ko || game.title_en).replace('{gameTitleEn}', game.title_en),
        'acceptedAnswer': {
          '@type': 'Answer',
          'text': pt.jsonLdFaq2A
        }
      }
    ]
  };

  const steamAppId = extractSteamAppId(game.cover_image_url);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
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
        unapprovedStatusMap={unapprovedStatusMap}
        popularGames={popularGames}
        relatedGames={relatedGames}
        locale={currentLocale as Locale}
        steamNewsSlot={steamAppId ? (
          <React.Suspense fallback={<div className="h-64 animate-pulse bg-slate-800/50 rounded-xl border border-slate-700/50" />}>
            <SteamNews steamAppId={steamAppId} locale={currentLocale as Locale} />
          </React.Suspense>
        ) : undefined}
        playerCountSlot={steamAppId ? (
          <React.Suspense fallback={<div className="h-12 animate-pulse bg-slate-800/50 rounded-full border border-slate-700/50" />}>
            <SteamPlayerCount steamAppId={steamAppId} locale={currentLocale as Locale} />
          </React.Suspense>
        ) : undefined}
        systemReqSlot={steamAppId ? (
          <React.Suspense fallback={<div className="h-96 animate-pulse bg-slate-800/50 rounded-xl border border-slate-700/50" />}>
            <SystemRequirements steamAppId={steamAppId} locale={currentLocale as Locale} />
          </React.Suspense>
        ) : undefined}
      />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-20 w-full">
        <PatcherUniqueContent
          locale={currentLocale as Locale}
          gameTitle={game.title_ko || game.title_en}
          gameSlug={game.slug}
        />
      </div>
    </>
  );
}
