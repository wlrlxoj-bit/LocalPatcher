import React from 'react';
import { notFound } from 'next/navigation';
import PatcherClient from '@/components/PatcherClient';
import { getGameBySlug, getTrainersForGame, getMappingsForTrainer } from '@/lib/supabase';
import { Locale } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

interface PatcherPageProps {
  params: Promise<{
    locale: string;
    game_slug: string;
  }>;
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

  // 3. Pre-fetch mappings for all trainers of this game
  const mappingsMap: Record<number, any[]> = {};
  for (const trainer of trainers) {
    const mappings = await getMappingsForTrainer(trainer.id, currentLocale);
    mappingsMap[trainer.id] = mappings;
  }

  return (
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
  );
}
