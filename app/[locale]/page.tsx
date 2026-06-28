import React from 'react';
import GamesListClient from '@/components/GamesListClient';
import { getGames, getTrainersForGame } from '@/lib/supabase';
import { Locale } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

export default async function LocalePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const currentLocale = (locale === 'en' || locale === 'ja' || locale === 'ko') ? locale : 'ko';

  // Fetch all games
  const games = await getGames();

  // Fetch trainers for each game to build a flat list
  const trainersList = [];
  for (const game of games) {
    const trainers = await getTrainersForGame(game.id);
    if (trainers && trainers.length > 0) {
      // Get the latest trainer version or just the first one
      trainersList.push({
        id: trainers[0].id,
        game_id: game.id,
        version_str: trainers[0].version_str,
        option_count: trainers[0].option_count
      });
    }
  }

  return (
    <GamesListClient 
      games={games} 
      trainers={trainersList} 
      locale={currentLocale as Locale} 
    />
  );
}
