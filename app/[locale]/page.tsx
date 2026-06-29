import React from 'react';
import GamesListClient from '@/components/GamesListClient';
import { getGamesWithTrainers } from '@/lib/supabase';
import { Locale } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

export default async function LocalePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const currentLocale = (locale === 'en' || locale === 'ja' || locale === 'ko') ? locale : 'ko';

  // Fetch all games with their trainers in a single query
  const gamesData = (await getGamesWithTrainers()) as any[];

  // Map the returned data list to games and trainersList cleanly without changing expected types
  const games = gamesData.map(({ trainers, ...game }) => game);
  const trainersList = gamesData
    .filter(g => g.trainers && g.trainers.length > 0)
    .map(g => ({
      id: g.trainers[0].id,
      game_id: g.id,
      version_str: g.trainers[0].version_str,
      option_count: g.trainers[0].option_count
    }));

  return (
    <GamesListClient 
      games={games} 
      trainers={trainersList} 
      locale={currentLocale as Locale} 
    />
  );
}
