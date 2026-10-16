import 'server-only';

import { revalidatePath, revalidateTag } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getPatcherMappingCacheTag, getPatcherTrainerListCacheTag } from '@/lib/patcher-cache-tags';

const PUBLIC_LOCALES = ['ko', 'ja', 'de', 'es'] as const;
type TrainerGameLookup = { game_id: number; games: { slug: string } | { slug: string }[] | null };
type SnapshotTarget = { canonical_slug: string };

export type PatcherRevalidationResult =
  | { revalidated: true; paths: number; sitemap: 'deferred' }
  | { revalidated: false; retryRequired: true; reason: 'trainer_game_lookup_unavailable' | 'trainer_game_lookup_missing' | 'snapshot_enqueue_unavailable' | 'canonical_snapshot_unavailable' };

/**
 * 승인 상태 변경 뒤 snapshot이 확정한 canonical 공개 경로만 무효화한다.
 * 관계 조회가 실패했을 때 동적 경로 전체를 무효화하면 모든 페이지가 재생성될 수 있으므로,
 * 호출자에게 안전한 재시도 상태만 돌려준다. sitemap은 별도 outbox 항목으로 처리한다.
 */
export async function revalidatePatcherForTrainer(client: SupabaseClient, trainerId: number): Promise<PatcherRevalidationResult> {
  const { data, error } = await client.from('trainers').select('game_id,games(slug)').eq('id', trainerId).maybeSingle();
  if (error) {
    console.warn('[PATCHER_REVALIDATE_RETRY_REQUIRED] trainer_game_lookup_unavailable');
    return { revalidated: false, retryRequired: true, reason: 'trainer_game_lookup_unavailable' };
  }
  const trainer = data as TrainerGameLookup | null;
  const games = trainer?.games;
  const game = Array.isArray(games) ? games[0] : games;
  if (!trainer || !game?.slug || !Number.isSafeInteger(trainer.game_id) || trainer.game_id <= 0) {
    console.warn('[PATCHER_REVALIDATE_RETRY_REQUIRED] trainer_game_lookup_missing');
    return { revalidated: false, retryRequired: true, reason: 'trainer_game_lookup_missing' };
  }
  // DB 변경과 snapshot/outbox 기록은 하나의 RPC transaction에서 끝낸다. 이 단계가
  // 실패하면 즉시 revalidatePath를 호출하지 않아, 새 본문과 오래된 sitemap 자격이
  // 서로 어긋난 채 공개되는 일을 막는다.
  const { error: snapshotError } = await client.rpc('refresh_patcher_index_and_enqueue', {
    p_trainer_id: trainerId,
  });
  if (snapshotError) {
    console.warn('[PATCHER_REVALIDATE_RETRY_REQUIRED] snapshot_enqueue_unavailable');
    return { revalidated: false, retryRequired: true, reason: 'snapshot_enqueue_unavailable' };
  }
  const { data: targetData, error: targetError } = await client.rpc('get_patcher_revalidation_target', {
    p_trainer_id: trainerId,
  });
  const targets = targetData as SnapshotTarget[] | null;
  if (targetError || !Array.isArray(targets) || targets.length !== 1 || !targets[0]?.canonical_slug) {
    console.warn('[PATCHER_REVALIDATE_RETRY_REQUIRED] canonical_snapshot_unavailable');
    return { revalidated: false, retryRequired: true, reason: 'canonical_snapshot_unavailable' };
  }
  // Route Handler에서 정확한 trainer·언어의 데이터 캐시를 먼저 만료시킨 뒤 공개 경로를 갱신합니다.
  revalidateTag(getPatcherTrainerListCacheTag(trainer.game_id), { expire: 0 });
  for (const locale of PUBLIC_LOCALES) revalidateTag(getPatcherMappingCacheTag(trainerId, locale), { expire: 0 });
  for (const locale of PUBLIC_LOCALES) revalidatePath(`/${locale}/patcher/${targets[0].canonical_slug}`);
  // 즉시 호출은 lease/세대 소유권이 없다. 이후 enqueue와 경합하는 작업까지 완료하지
  // 않도록 outbox는 닫지 않고 worker가 자기 lease로 canonical 경로를 다시 검증한다.
  return { revalidated: true, paths: PUBLIC_LOCALES.length, sitemap: 'deferred' };
}
