import 'server-only';

import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';

const PUBLIC_LOCALES = ['ko', 'ja', 'de', 'es'] as const;
type TrainerGameLookup = { games: { slug: string } | { slug: string }[] | null };

/** 승인 상태 변경 뒤 해당 패처와 sitemap의 1시간 ISR 결과를 즉시 무효화한다. */
export async function revalidatePatcherForTrainer(client: SupabaseClient, trainerId: number) {
  const { data } = await client.from('trainers').select('games(slug)').eq('id', trainerId).maybeSingle();
  const games = (data as TrainerGameLookup | null)?.games;
  const game = Array.isArray(games) ? games[0] : games;
  if (game?.slug) {
    for (const locale of PUBLIC_LOCALES) revalidatePath(`/${locale}/patcher/${game.slug}`);
  } else {
    // 관계 조회가 일시 실패해도 stale noindex/robots 상태가 한 시간 남지 않도록 패처
    // 동적 경로 전체를 fallback으로 무효화한다.
    revalidatePath('/[locale]/patcher/[game_slug]', 'page');
  }
  revalidatePath('/sitemap.xml');
}
