import 'server-only';

import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';

const PUBLIC_LOCALES = ['ko', 'ja', 'de', 'es'] as const;
type TrainerGameLookup = { games: { slug: string } | { slug: string }[] | null };

export type PatcherRevalidationResult =
  | { revalidated: true; paths: number; sitemap: 'deferred' }
  | { revalidated: false; retryRequired: true; reason: 'trainer_game_lookup_unavailable' | 'trainer_game_lookup_missing' };

/**
 * 승인 상태 변경 뒤 실제 game slug를 아는 공개 경로만 무효화한다.
 * 관계 조회가 실패했을 때 동적 경로 전체를 무효화하면 모든 페이지가 재생성될 수 있으므로,
 * 호출자에게 안전한 재시도 상태만 돌려준다. sitemap은 최대 하루의 시간 기반 갱신으로
 * 처리해 trainer별 무효화 폭주를 피한다.
 */
export async function revalidatePatcherForTrainer(client: SupabaseClient, trainerId: number): Promise<PatcherRevalidationResult> {
  const { data, error } = await client.from('trainers').select('games(slug)').eq('id', trainerId).maybeSingle();
  if (error) {
    console.warn('[PATCHER_REVALIDATE_RETRY_REQUIRED] trainer_game_lookup_unavailable');
    return { revalidated: false, retryRequired: true, reason: 'trainer_game_lookup_unavailable' };
  }
  const games = (data as TrainerGameLookup | null)?.games;
  const game = Array.isArray(games) ? games[0] : games;
  if (!game?.slug) {
    console.warn('[PATCHER_REVALIDATE_RETRY_REQUIRED] trainer_game_lookup_missing');
    return { revalidated: false, retryRequired: true, reason: 'trainer_game_lookup_missing' };
  }
  for (const locale of PUBLIC_LOCALES) revalidatePath(`/${locale}/patcher/${game.slug}`);
  return { revalidated: true, paths: PUBLIC_LOCALES.length, sitemap: 'deferred' };
}
