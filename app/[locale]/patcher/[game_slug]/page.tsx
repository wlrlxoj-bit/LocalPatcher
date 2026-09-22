import React from 'react';
import { notFound, permanentRedirect } from 'next/navigation';
import PatcherClient from '@/components/PatcherClient';
import SteamNews from '@/components/SteamNews';
import SteamPlayerCount from '@/components/SteamPlayerCount';
import SystemRequirements from '@/components/SystemRequirements';
import PatcherUniqueContent from '@/components/PatcherUniqueContent';
import AdsterraBanner from '@/components/AdsterraBanner';
import {
  getGameBySlug,
  getTrainersForGame,
  getLatestUnapprovedStatusesForTrainers,
  getMappingsForTrainers,
  resolveGameSlugAlias,
  getPopularGamesWithTrainers,
  getRelatedGames,
} from '@/lib/supabase';
import { Locale, getGameTitle, getPatcherDict } from '@/lib/i18n/index';
import { translateGenre } from '@/lib/i18n/genres';
import { SITE_URL } from '@/lib/site';
import { extractSteamAppId } from '@/lib/steam';
import {
  AUTO_LOCALIZATION_LOCALES,
  ELDEN_RING_CANONICAL_SLUG,
  ELDEN_RING_SOURCE_SLUG,
  getEligiblePatcherSlugs,
  getPatcherIndexEligibilityByGameIds,
  getPatcherIndexEligibilityByLocales,
  getPatcherTrainers,
} from '@/lib/content-eligibility';
import { getTrainerOptionSummary } from '@/lib/trainer-option-summary';
import { getTrainerProvenance } from '@/lib/trainer-provenance';
import PatcherVerificationProvenance from '@/components/PatcherVerificationProvenance';

export const revalidate = 3600; // 1 hour ISR cache

export async function generateStaticParams() {
  const eligibleSlugsByLocale = await Promise.all(
    AUTO_LOCALIZATION_LOCALES.map(async (locale) => ({ locale, slugs: await getEligiblePatcherSlugs(locale) }))
  );
  const params: { locale: string; game_slug: string }[] = [];
  for (const { locale, slugs } of eligibleSlugsByLocale) {
    for (const gameSlug of slugs) {
      params.push({ locale, game_slug: gameSlug });
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
  if (game.slug === ELDEN_RING_CANONICAL_SLUG) {
    const sourceGame = await getGameBySlug(ELDEN_RING_SOURCE_SLUG);
    if (sourceGame && sourceGame.id !== game.id) {
      const sourceTrainers = await getTrainersForGame(sourceGame.id);
      trainers = getPatcherTrainers(game, [game, sourceGame], [...trainers, ...sourceTrainers]);
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
    return {};
  }

  const { canonicalSlug, game, trainers } = patcherData;
  const eligibleByLocale = await getPatcherIndexEligibilityByLocales(game.id, AUTO_LOCALIZATION_LOCALES);
  const indexEligible = eligibleByLocale.get(currentLocale) === true;
  // metadata의 '승인됨' 표기도 실제 색인 자격과 같은 최신·완전 매핑 기준을 사용합니다.
  const hasApprovedTranslation = indexEligible;
  const eligibleLocales = AUTO_LOCALIZATION_LOCALES.map((candidate) => ({
    candidate,
    eligible: eligibleByLocale.get(candidate) === true,
  }));
  const alternateLanguages: Record<string, string> = Object.fromEntries(eligibleLocales
    .filter(({ eligible }) => eligible)
    .map(({ candidate }) => [candidate, `/${candidate}/patcher/${canonicalSlug}`]));
  if (alternateLanguages.ko) {
    alternateLanguages['x-default'] = alternateLanguages.ko;
  }

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
  // metadata와 본문 외부 노출 판단을 같은 최신·완전 승인 기준으로 맞춘다.
  // 대기/실패 번역 페이지는 사용자에게 남기되 구조화 데이터·광고 대상에서는 제외한다.
  // 3. Pre-fetch mappings for all trainers of this game in a single batch query
  const mappingsMap = await getMappingsForTrainers(trainers.map(t => t.id), currentLocale);
  const unapprovedStatusMap = currentLocale !== 'en'
    ? await getLatestUnapprovedStatusesForTrainers(trainers.map(t => t.id), currentLocale)
    : {};

  // 4. Build JSON-LD structured data for SoftwareApplication

  // 4. Build JSON-LD structured data for SoftwareApplication
  const pt = getPatcherDict(currentLocale as Locale);

  const [popularCandidates, relatedCandidates] = await Promise.all([
    getPopularGamesWithTrainers(),
    getRelatedGames(game.id),
  ]);
  // 본문, 인기·관련 카드의 최신 승인 자격을 단일 게임·트레이너 조회로 계산합니다.
  const eligibleByGameId = await getPatcherIndexEligibilityByGameIds(
    [game.id, ...popularCandidates.map((candidate) => candidate.id), ...relatedCandidates.map((candidate) => candidate.id)],
    currentLocale,
  );
  const indexEligible = eligibleByGameId.get(game.id) === true;
  const popularGames = popularCandidates.filter((candidate) => eligibleByGameId.get(candidate.id) === true);
  const relatedGames = relatedCandidates.filter((candidate) => eligibleByGameId.get(candidate.id) === true);

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

  const steamAppId = extractSteamAppId(game.cover_image_url);
  const localizedDescription = game[`description_${currentLocale}` as keyof typeof game];
  const description = typeof localizedDescription === 'string' && localizedDescription.trim()
    ? localizedDescription
    : game.description_en;
  const latestTrainer = trainers[0];
  const latestOptionCount = latestTrainer?.option_count;
  const supportedOptionCount = typeof latestOptionCount === 'number' &&
    Number.isSafeInteger(latestOptionCount) && latestOptionCount > 0
    ? latestOptionCount
    : 0;
  const hasApprovedLatestMapping = latestTrainer
    ? (mappingsMap[latestTrainer.id] || []).length > 0
    : false;
  // 매핑 한 행에는 최신 트레이너의 전체 번역문이 들어가므로 행 개수가 아닌 옵션 수를 표시합니다.
  const translatedOptionCount = hasApprovedLatestMapping ? supportedOptionCount : 0;
  // 최신 트레이너의 승인 매핑에서 원문·번역 단축키가 일치하는 옵션만 SSR 정보로 노출합니다.
  const optionSummary = latestTrainer
    ? getTrainerOptionSummary(mappingsMap[latestTrainer.id] || [])
    : null;
  // getMappingsForTrainers는 승인된 행만 반환한다. provenance 생성기에도 그 경계를
  // 명시해 불완전한 최신 매핑은 서버 본문에서 숨긴다.
  const provenance = getTrainerProvenance({
    sourceUrl: game.fling_url,
    trainers,
    latestMappings: (latestTrainer ? mappingsMap[latestTrainer.id] || [] : []).map((mapping) => ({
      original_text: mapping.original_text,
      translated_text: mapping.translated_text,
      is_approved: true,
    })),
  });
  const supportedVersions = [...new Set(
    trainers
      .map((trainer) => trainer.version_str?.trim())
      .filter((version): version is string => Boolean(version))
  )];

  return (
    <>
      {indexEligible && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}

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
        showAds={indexEligible}
        popularGames={popularGames}
        relatedGames={relatedGames}
        locale={currentLocale as Locale}
        gameInfoSlot={(
          <>
            <PatcherUniqueContent
              locale={currentLocale as Locale}
              gameTitle={getGameTitle(game, currentLocale as Locale)}
              gameTitleEn={game.title_en}
              description={description}
              versions={supportedVersions}
              optionCount={supportedOptionCount}
              genres={Array.isArray(game.genres) ? game.genres : []}
              tags={Array.isArray(game.tags) ? game.tags : []}
              sourceUrl={game.fling_url}
              translatedOptionCount={translatedOptionCount}
              optionSummary={optionSummary}
            />
            {indexEligible && provenance && (
              <PatcherVerificationProvenance locale={currentLocale as Locale} provenance={provenance} />
            )}
          </>
        )}
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

        {indexEligible && <AdsterraBanner locale={currentLocale as Locale} enabled={process.env.ADSTERRA_ENABLED === 'true'} />}
      </div>
    </>
  );
}
