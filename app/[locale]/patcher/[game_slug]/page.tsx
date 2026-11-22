import React from 'react';
import { notFound, permanentRedirect } from 'next/navigation';
import PatcherClient from '@/components/PatcherClient';
import type { GameCardData } from '@/components/GameCard';
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
import { getTrainerOptionTable } from '@/lib/trainer-option-table';
import { getTrainerProvenance } from '@/lib/trainer-provenance';
import PatcherVerificationProvenance from '@/components/PatcherVerificationProvenance';

// 페이지 변경은 승인·자동화 이벤트가 정확한 경로만 무효화한다. 시간 기반 재생성은
// 하루로 제한해 검색 크롤러/일반 방문이 ISR 쓰기를 급증시키지 않게 한다.
export const revalidate = 86400;

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

async function loadCanonicalPatcherData(requestedSlug: string) {
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

// 같은 요청 내 generateMetadata와 본문 렌더가 게임·별칭 조회를 중복 호출하지 않도록 요청 단위로 묶습니다.
const getCanonicalPatcherData =
  typeof React.cache === 'function' ? React.cache(loadCanonicalPatcherData) : loadCanonicalPatcherData;

export async function generateMetadata({ params }: PatcherPageProps) {
  const { locale, game_slug } = await params;
  const currentLocale = (locale === 'en' || locale === 'ja' || locale === 'ko' || locale === 'de' || locale === 'es') ? locale : 'ko';

  const patcherData = await getCanonicalPatcherData(game_slug);
  if (!patcherData || patcherData.canonicalSlug !== game_slug) {
    return { robots: { index: false, follow: false } };
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
  } else {
    const firstAlternateUrl = Object.values(alternateLanguages)[0];
    if (firstAlternateUrl) {
      alternateLanguages['x-default'] = firstAlternateUrl;
    }
  }

  const latestVersion = trainers?.[0]?.version_str?.trim() || '';
  const latestOptionCount = typeof trainers?.[0]?.option_count === 'number' && trainers[0].option_count > 0
    ? trainers[0].option_count
    : 0;
  const versionsStr = trainers && trainers.length > 0
    ? trainers.map(t => t.version_str).filter(Boolean).join(', ')
    : '';
  const optionBadge = latestOptionCount > 0 ? ({
    ko: ` (${latestOptionCount}개 옵션)`,
    ja: ` (${latestOptionCount}機能)`,
    de: ` (${latestOptionCount} Optionen)`,
    es: ` (${latestOptionCount} opciones)`,
    en: ` (${latestOptionCount} Options)`,
  }[currentLocale] ?? '') : '';

  const pt = getPatcherDict(currentLocale as Locale);
  const gameName = getGameTitle(game, currentLocale as Locale);
  const gameNameEn = game.title_en;
  const sameTitle = gameName.trim().toLowerCase() === gameNameEn.trim().toLowerCase();

  // 원제와 현지화 제목이 같으면 괄호 병기를 제거하고, 버전·옵션 배지를 깔끔히 치환합니다.
  const formatMetaText = (template: string) => {
    const base = sameTitle
      ? template.replace(/\s*\(\{gameTitleEn\}\)/g, '').replace(/（\{gameTitleEn\}）/g, '')
      : template;
    return base
      .replaceAll('{gameTitle}', gameName)
      .replaceAll('{gameTitleEn}', gameNameEn)
      .replaceAll('{optionBadge}', optionBadge)
      .replaceAll('{latestVersion}', latestVersion)
      .replaceAll('{optionCount}', String(latestOptionCount))
      .replaceAll('{versionsStr}', versionsStr)
      .replace(/\s{2,}/g, ' ')
      .replace(/\s+([.,。])/g, '$1')
      .trim();
  };

  const title = formatMetaText(hasApprovedTranslation ? pt.metaTitleApproved : pt.metaTitleUnapproved);
  const description = formatMetaText(hasApprovedTranslation ? pt.metaDescApproved : pt.metaDescUnapproved);

  const ogLocaleMap: Record<Locale, string> = {
    ko: 'ko_KR',
    ja: 'ja_JP',
    de: 'de_DE',
    es: 'es_ES',
    en: 'en_US',
  };

  return {
    title,
    description,
    robots: indexEligible ? { index: true, follow: true } : { index: false, follow: true },
    alternates: {
      canonical: `/${currentLocale}/patcher/${canonicalSlug}`,
      ...(Object.keys(alternateLanguages).length > 0 ? { languages: alternateLanguages } : {}),
    },
    openGraph: {
      type: 'website',
      siteName: 'LocalPatcher',
      locale: ogLocaleMap[currentLocale as Locale],
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
  // 3. 영문 페이지는 원본 FLiNG 안내만 표시하므로 불필요한 번역 매핑 조회·전송을 생략합니다.
  const mappingsMap = currentLocale !== 'en'
    ? await getMappingsForTrainers(trainers.map(t => t.id), currentLocale)
    : {};
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
  // 카드에 쓰는 필드와 첫 트레이너 요약만 클라이언트 경계로 전달합니다.
  const toCardData = (candidate: GameCardData): GameCardData => ({
    id: candidate.id,
    title_en: candidate.title_en,
    title_ko: candidate.title_ko,
    title_ja: candidate.title_ja,
    title_de: candidate.title_de,
    title_es: candidate.title_es,
    slug: candidate.slug,
    cover_image_url: candidate.cover_image_url,
    anti_cheat: candidate.anti_cheat,
    trainers: candidate.trainers?.slice(0, 1).map((trainer) => ({
      version_str: trainer.version_str,
      option_count: trainer.option_count,
    })),
  });
  const popularGames = popularCandidates
    .filter((candidate) => candidate.id !== game.id && eligibleByGameId.get(candidate.id) === true)
    .slice(0, 6)
    .map(toCardData);
  const relatedGames = relatedCandidates
    .filter((candidate) => candidate.id !== game.id && eligibleByGameId.get(candidate.id) === true)
    .slice(0, 6)
    .map(toCardData);

  const canonicalUrl = `${SITE_URL}/${currentLocale}/patcher/${patcherData?.canonicalSlug ?? game.slug}`;
  const localizedGameTitle = getGameTitle(game, currentLocale as Locale);
  const jsonLdNameMap: Record<Locale, string> = {
    ko: `${localizedGameTitle} 트레이너 한글 패치`,
    ja: `${localizedGameTitle} トレーナー日本語化パッチ`,
    de: `${localizedGameTitle} Trainer Deutsch Patch`,
    es: `${localizedGameTitle} Trainer Parche Español`,
    en: `${game.title_en} Trainer Local Patcher`,
  };
  const rawDateModified = (trainers[0] as { updated_at?: string; created_at?: string } | undefined)?.updated_at
    || (trainers[0] as { created_at?: string } | undefined)?.created_at
    || (game as { updated_at?: string; created_at?: string }).updated_at
    || (game as { created_at?: string }).created_at;
  const dateModified = typeof rawDateModified === 'string' && !Number.isNaN(Date.parse(rawDateModified))
    ? new Date(rawDateModified).toISOString()
    : undefined;
  const softwareApplicationLd = {
    '@type': 'SoftwareApplication',
    'name': jsonLdNameMap[currentLocale as Locale],
    'inLanguage': currentLocale,
    'url': canonicalUrl,
    'operatingSystem': 'Windows',
    'applicationCategory': 'GameApplication',
    'isAccessibleForFree': true,
    ...(dateModified ? { 'dateModified': dateModified } : {}),
    'offers': {
      '@type': 'Offer',
      'price': '0',
      'priceCurrency': 'USD',
    },
    'description': pt.jsonLdDescription
      .replaceAll('{gameTitle}', localizedGameTitle)
      .replaceAll('{gameTitleKo}', game.title_ko || game.title_en)
      .replaceAll('{gameTitleEn}', game.title_en),
    'screenshot': game.cover_image_url,
    'softwareVersion': trainers[0]?.version_str || '1.0',
    'downloadUrl': canonicalUrl,
  };
  const breadcrumbListLd = {
    '@type': 'BreadcrumbList',
    'itemListElement': [
      {
        '@type': 'ListItem',
        'position': 1,
        'name': pt.breadcrumbHome || 'Home',
        'item': `${SITE_URL}/${currentLocale}`,
      },
      {
        '@type': 'ListItem',
        'position': 2,
        'name': localizedGameTitle,
        'item': canonicalUrl,
      },
    ],
  };
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [softwareApplicationLd, breadcrumbListLd],
  };

  const steamAppId = extractSteamAppId(game.cover_image_url);
  const localizedDescription = game[`description_${currentLocale}` as keyof typeof game];
  const description = currentLocale === 'en'
    ? (typeof game.description_en === 'string' && game.description_en.trim() ? game.description_en : undefined)
    : (typeof localizedDescription === 'string' && localizedDescription.trim() ? localizedDescription : undefined);
  const latestTrainer = trainers[0];
  const latestOptionCount = latestTrainer?.option_count;
  const supportedOptionCount = typeof latestOptionCount === 'number' &&
    Number.isSafeInteger(latestOptionCount) && latestOptionCount > 0
    ? latestOptionCount
    : 0;
  // 최신 트레이너의 승인 매핑에서 원문·번역 단축키가 일치하는 옵션만 SSR 정보로 노출합니다.
  const optionSummary = latestTrainer
    ? getTrainerOptionSummary(mappingsMap[latestTrainer.id] || [])
    : null;
  // 전체 번역 목록은 최신 ID·현재 언어·승인·색인 자격 및 정확한 옵션 수를 다시 검증합니다.
  const optionTable = latestTrainer ? getTrainerOptionTable({
    latestTrainerId: latestTrainer.id,
    locale: currentLocale,
    optionCount: supportedOptionCount,
    indexEligible,
    mappings: mappingsMap[latestTrainer.id] || [],
  }) : null;
  // 완전하고 검증된 표의 실제 행만 승인 옵션 수로 표시합니다. 메타데이터 수량은 사용하지 않습니다.
  const translatedOptionCount = optionTable?.items.length ?? 0;
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
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
        />
      )}

      <PatcherClient
        game={{
          id: game.id,
          title_en: game.title_en,
          title_ko: game.title_ko,
          title_ja: game.title_ja,
          title_de: game.title_de,
          title_es: game.title_es,
          slug: game.slug,
          cover_image_url: game.cover_image_url,
          anti_cheat: game.anti_cheat,
          fling_url: game.fling_url,
        }}
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
              optionTable={optionTable}
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
        playerCountSlot={steamAppId ? <SteamPlayerCount steamAppId={steamAppId} locale={currentLocale as Locale} /> : undefined}
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
