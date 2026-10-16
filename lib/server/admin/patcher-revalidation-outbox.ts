import 'server-only';

import { revalidatePath, revalidateTag } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getPatcherMappingCacheTag, getPatcherTrainerListCacheTag } from '@/lib/patcher-cache-tags';

type ClaimedOutboxEntry = {
  id: number;
  trainer_id: number | null;
  game_id: number | null;
  locale_codes: string[];
  reason: 'content_changed' | 'sitemap_debounce';
  lease_token: string;
  canonical_slug: string | null;
  attempt_count: number;
};

export type PatcherOutboxDrainResult = {
  bootstrapped: boolean;
  claimed: number;
  completed: number;
  deferred: number;
};

/** 재시도 폭주를 막되, lease 만료 뒤 같은 작업을 빠르게 회복할 수 있는 상한 있는 지연값입니다. */
export function getPatcherOutboxRetryDelaySeconds(attemptCount: number): number {
  const normalizedAttempt = Number.isSafeInteger(attemptCount) && attemptCount > 0 ? attemptCount : 1;
  return Math.min(3600, 60 * (2 ** Math.min(normalizedAttempt - 1, 6)));
}

async function finishEntry(
  client: SupabaseClient,
  entry: ClaimedOutboxEntry,
  state: 'completed' | 'deferred',
  failureCode: string | null = null,
) {
  const { data, error } = await client.rpc('finish_patcher_revalidation_outbox', {
    p_id: entry.id,
    p_lease_token: entry.lease_token,
    p_state: state,
    p_failure_code: failureCode,
    p_delay_seconds: state === 'deferred' ? getPatcherOutboxRetryDelaySeconds(entry.attempt_count) : 0,
  });
  // 만료/탈취된 lease가 false를 반환하면 완료로 오인하지 않고 다음 worker 회수를 기다린다.
  if (error || data !== true) throw error || new Error('patcher outbox lease finish rejected');
}

/**
 * DB의 lease를 가진 항목만 처리하고, 성공·실패 모두 같은 lease token으로 종료한다.
 * 재검증은 멱등 작업이므로 worker 중단 뒤 lease가 만료되면 다음 실행이 안전하게 재시도한다.
 */
export async function drainPatcherRevalidationOutbox(
  client: SupabaseClient,
  limit = 10,
): Promise<PatcherOutboxDrainResult> {
  const { data: bootstrapData, error: bootstrapError } = await client.rpc(
    'bootstrap_patcher_index_eligibility_snapshot',
  );
  if (bootstrapError) throw bootstrapError;

  const { data, error } = await client.rpc('claim_patcher_revalidation_outbox', { p_limit: limit });
  if (error) throw error;
  const entries = (data || []) as ClaimedOutboxEntry[];
  const result: PatcherOutboxDrainResult = {
    bootstrapped: Number(bootstrapData || 0) > 0,
    claimed: entries.length,
    completed: 0,
    deferred: 0,
  };

  for (const entry of entries) {
    try {
      if (entry.reason === 'sitemap_debounce') {
        revalidatePath('/sitemap.xml');
      } else {
        if (!entry.canonical_slug || !Number.isSafeInteger(entry.trainer_id) || (entry.trainer_id ?? 0) <= 0 ||
          !Number.isSafeInteger(entry.game_id) || (entry.game_id ?? 0) <= 0 ||
          !Array.isArray(entry.locale_codes) || entry.locale_codes.length === 0) {
          await finishEntry(client, entry, 'deferred', 'OUTBOX_PAYLOAD_INVALID');
          result.deferred += 1;
          continue;
        }
        // outbox의 game_id는 canonical snapshot 대상입니다. alias 소스 게임의 목록은
        // 별도 캐시이므로 trainer가 실제 소속된 game_id를 캐시 없이 확인해야 합니다.
        const { data: trainer, error: trainerError } = await client.from('trainers')
          .select('game_id').eq('id', entry.trainer_id as number).maybeSingle();
        const sourceGameId = trainer?.game_id;
        if (trainerError || !Number.isSafeInteger(sourceGameId) || sourceGameId <= 0) {
          await finishEntry(client, entry, 'deferred', 'OUTBOX_TRAINER_GAME_LOOKUP_FAILED');
          result.deferred += 1;
          continue;
        }
        // 정확한 source/canonical 두 게임만 갱신하며 같은 ID라면 한 번만 만료합니다.
        for (const gameId of new Set<number>([sourceGameId, entry.game_id as number])) {
          revalidateTag(getPatcherTrainerListCacheTag(gameId), { expire: 0 });
        }
        for (const locale of entry.locale_codes) {
          revalidateTag(getPatcherMappingCacheTag(entry.trainer_id as number, locale), { expire: 0 });
        }
        for (const locale of entry.locale_codes) {
          revalidatePath(`/${locale}/patcher/${entry.canonical_slug}`);
        }
      }
      await finishEntry(client, entry, 'completed');
      result.completed += 1;
    } catch {
      // 외부 cache provider 또는 finish RPC 장애는 인증 정보 없이 코드만 남긴다.
      try {
        await finishEntry(client, entry, 'deferred', 'PATCHER_REVALIDATE_FAILED');
        result.deferred += 1;
      } catch {
        // lease 만료가 fence 역할을 하므로 finish 실패 항목은 다음 worker가 회수한다.
        console.warn('[PATCHER_REVALIDATION_OUTBOX_FINISH_DEFERRED]');
      }
    }
  }
  return result;
}
