import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ChevronRight, Gamepad2 } from 'lucide-react';
import GameCard from '@/components/GameCard';
import { getGamesWithTrainers, sortTrainersLatestFirst } from '@/lib/supabase';
import {
  AUTO_LOCALIZATION_LOCALES,
  getEligiblePatcherSlugsForListedGames,
  isAutoLocalizationLocale,
} from '@/lib/content-eligibility';
import { canonicalizeListedGameSlug } from '@/lib/game-slug-aliases';
import { Locale, getPatcherDict } from '@/lib/i18n/index';
import {
  GENRE_HUBS,
  getGenreHubBySlug,
  getGenreHubSeoCopy,
} from '@/lib/i18n/genres';
import { SITE_URL, localizedAlternates } from '@/lib/site';

// 장르 허브 페이지는 24시간 ISR로 캐시하고, 기존 86400초 게임 목록 캐시를 재사용합니다.
export const revalidate = 86400;

export async function generateStaticParams() {
  const params: { locale: string; genre: string }[] = [];
  for (const locale of AUTO_LOCALIZATION_LOCALES) {
    for (const hub of GENRE_HUBS) {
      params.push({ locale, genre: hub.slug });
    }
  }
  return params;
}

interface GenreHubPageProps {
  params: Promise<{
    locale: string;
    genre: string;
  }>;
}

const OG_LOCALE_MAP: Record<Locale, string> = {
  ko: 'ko_KR',
  ja: 'ja_JP',
  de: 'de_DE',
  es: 'es_ES',
  en: 'en_US',
};

function resolveLocale(locale: string): Locale {
  return locale === 'en' || locale === 'ja' || locale === 'ko' || locale === 'de' || locale === 'es'
    ? locale
    : 'ko';
}

export async function generateMetadata({ params }: GenreHubPageProps): Promise<Metadata> {
  const { locale, genre } = await params;
  const hub = getGenreHubBySlug(genre);

  // 알 수 없는 장르 슬러그는 DB·Data Cache를 전혀 호출하지 않고 즉시 noindex 처리합니다.
  if (!hub) {
    return { robots: { index: false, follow: false } };
  }

  const currentLocale = resolveLocale(locale);
  const copy = getGenreHubSeoCopy(hub, currentLocale);
  const isIndexable = isAutoLocalizationLocale(currentLocale);
  const canonicalPath = `/${currentLocale}/genre/${hub.slug}`;
  const canonicalUrl = `${SITE_URL}${canonicalPath}`;

  return {
    title: copy.title,
    description: copy.description,
    robots: isIndexable ? { index: true, follow: true } : { index: false, follow: true },
    alternates: {
      canonical: canonicalPath,
      languages: localizedAlternates(`/genre/${hub.slug}`),
    },
    openGraph: {
      type: 'website',
      siteName: 'LocalPatcher',
      locale: OG_LOCALE_MAP[currentLocale],
      title: copy.title,
      description: copy.description,
      url: canonicalUrl,
    },
    twitter: {
      card: 'summary',
      title: copy.title,
      description: copy.description,
    },
  };
}

export default async function GenreHubPage({ params }: GenreHubPageProps) {
  const { locale, genre } = await params;
  const hub = getGenreHubBySlug(genre);

  // 알 수 없는 장르 슬러그는 DB·Data Cache를 호출하지 않고 즉시 404를 반환합니다.
  if (!hub) {
    notFound();
  }

  const currentLocale = resolveLocale(locale);
  const isIndexable = isAutoLocalizationLocale(currentLocale);
  const copy = getGenreHubSeoCopy(hub, currentLocale);
  const pt = getPatcherDict(currentLocale);

  // 기존 86400초 캐시된 getGamesWithTrainers()를 재사용해 새 Data Cache 키를 만들지 않습니다.
  const gamesData = await getGamesWithTrainers();
  const eligibleSlugs = new Set(await getEligiblePatcherSlugsForListedGames(gamesData, currentLocale));

  const directoryCandidates = gamesData.filter((game) =>
    game.trainers?.some((trainer) => trainer.option_count > 0),
  );
  const existingSlugs = new Set(directoryCandidates.map((game) => game.slug));
  const titleBySlug = new Map(directoryCandidates.map((game) => [game.slug, game.title_en]));
  const targetGenreLower = hub.dbName.toLowerCase();

  const eligibleGenreGames = directoryCandidates.filter((game) => {
    const hasGenre = (game.genres ?? []).some(
      (candidateGenre) => candidateGenre.trim().toLowerCase() === targetGenreLower,
    );
    if (!hasGenre) return false;
    const canonicalSlug = canonicalizeListedGameSlug(game.slug, existingSlugs, titleBySlug);
    return eligibleSlugs.has(canonicalSlug);
  });

  const gameBySlug = new Map(eligibleGenreGames.map((game) => [game.slug, game]));
  const deduplicatedGames = [
    ...new Map(
      eligibleGenreGames.map((game) => {
        const canonicalSlug = canonicalizeListedGameSlug(game.slug, existingSlugs, titleBySlug);
        const canonicalGame = gameBySlug.get(canonicalSlug) || game;
        return [canonicalSlug, { ...canonicalGame, slug: canonicalSlug }] as const;
      }),
    ).values(),
  ];

  // 인기 게임 우선(is_popular desc, popularity_index asc), 이후 최신 트레이너 순으로 정렬합니다.
  const sortedGames = [...deduplicatedGames].sort((left, right) => {
    const popularDiff = Number(Boolean(right.is_popular)) - Number(Boolean(left.is_popular));
    if (popularDiff !== 0) return popularDiff;

    const leftPopIndex = typeof left.popularity_index === 'number' ? left.popularity_index : Number.MAX_SAFE_INTEGER;
    const rightPopIndex = typeof right.popularity_index === 'number' ? right.popularity_index : Number.MAX_SAFE_INTEGER;
    if (leftPopIndex !== rightPopIndex) return leftPopIndex - rightPopIndex;

    const leftMaxTrainerId = left.trainers?.length > 0 ? Math.max(...left.trainers.map((t) => t.id)) : 0;
    const rightMaxTrainerId = right.trainers?.length > 0 ? Math.max(...right.trainers.map((t) => t.id)) : 0;
    if (leftMaxTrainerId !== rightMaxTrainerId) return rightMaxTrainerId - leftMaxTrainerId;

    return right.id - left.id;
  });

  const canonicalUrl = `${SITE_URL}/${currentLocale}/genre/${hub.slug}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        name: copy.h1,
        description: copy.description,
        url: canonicalUrl,
        inLanguage: currentLocale,
        numberOfItems: sortedGames.length,
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: copy.breadcrumbHome,
            item: `${SITE_URL}/${currentLocale}`,
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: copy.label,
            item: canonicalUrl,
          },
        ],
      },
    ],
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      {isIndexable && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
        />
      )}

      {/* Breadcrumb Navigation */}
      <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-2 text-xs text-slate-400">
        <Link
          href={`/${currentLocale}`}
          prefetch={false}
          className="hover:text-cyan-400 transition-colors"
        >
          {copy.breadcrumbHome}
        </Link>
        <ChevronRight className="w-3.5 h-3.5 text-slate-600" aria-hidden="true" />
        <span className="text-slate-200 font-medium" aria-current="page">
          {copy.label}
        </span>
      </nav>

      {/* Genre Hub Header */}
      <header className="mb-8 pb-6 border-b border-slate-800/80">
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-cyan-500/30 bg-cyan-950/40 text-xs font-semibold text-cyan-400">
            <Gamepad2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{copy.label}</span>
          </div>
          <span className="text-xs font-medium text-slate-400 px-2.5 py-1 rounded-full border border-slate-800 bg-slate-900/60">
            {copy.countBadge(sortedGames.length)}
          </span>
        </div>
        <h1 className="font-bold text-3xl sm:text-4xl tracking-tight text-white font-outfit mb-3">
          {copy.h1}
        </h1>
        <p className="text-slate-400 text-sm sm:text-base max-w-3xl leading-relaxed">
          {copy.intro}
        </p>
      </header>

      {/* Genre Switcher Pills */}
      <nav aria-label={copy.navLabel} className="mb-10 flex flex-wrap gap-2">
        {GENRE_HUBS.map((item) => {
          const isActive = item.slug === hub.slug;
          return (
            <Link
              key={item.slug}
              href={`/${currentLocale}/genre/${item.slug}`}
              prefetch={false}
              aria-current={isActive ? 'page' : undefined}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                isActive
                  ? 'border-cyan-500/60 bg-cyan-500/15 text-cyan-300'
                  : 'border-slate-800 bg-slate-900/40 text-slate-300 hover:border-cyan-500/40 hover:text-cyan-300'
              }`}
            >
              {item.labels[currentLocale] || item.labels.en}
            </Link>
          );
        })}
      </nav>

      {/* Crawlable Game Grid */}
      {sortedGames.length > 0 ? (
        <section aria-label={copy.h1} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {sortedGames.map((game, index) => {
            const latestTrainer = sortTrainersLatestFirst(game.trainers ?? [])[0];
            return (
              <GameCard
                key={game.id}
                game={game}
                trainerVersion={latestTrainer?.version_str ?? 'v1.0'}
                optionCount={latestTrainer?.option_count ?? 0}
                locale={currentLocale}
                optionsLabel={pt.optionsCount}
                priority={index === 0}
              />
            );
          })}
        </section>
      ) : (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-10 text-center">
          <p className="text-sm text-slate-400 mb-4">{copy.emptyMessage}</p>
          <Link
            href={`/${currentLocale}`}
            prefetch={false}
            className="inline-flex items-center px-4 py-2 rounded-xl border border-cyan-500/40 bg-cyan-500/10 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/20 transition-colors"
          >
            {copy.backToHome}
          </Link>
        </div>
      )}
    </div>
  );
}
