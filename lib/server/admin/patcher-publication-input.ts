import 'server-only';

import { Buffer } from 'node:buffer';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getAdminClient } from './access';
import {
  ELDEN_RING_CANONICAL_SLUG, ELDEN_RING_SOURCE_SLUG, getPatcherTrainers,
} from '@/lib/patcher-trainer-candidates';
import { PUBLIC_LOCALIZATION_LOCALES } from '@/lib/site';
import type { PatcherPublicationInput } from '@/lib/patcher-publication';
import type { TrainerOptionTableMapping } from '@/lib/trainer-option-table';

export interface PublicationReadRequest { canonicalSlug: string; locale: string }
export type PublicationReadFailure = 'INVALID_REQUEST' | 'ADMIN_CLIENT_UNAVAILABLE' | 'RPC_FAILED' | 'INVALID_RPC_PAYLOAD';
export type PublicationReadResult = {
  status: 'ready';
  /** DB 내 변경 감지용 불투명 값이며 신원 증명·승인 토큰이 아닙니다. 로그에 남기지 않습니다. */
  fingerprint: string;
  input: PatcherPublicationInput;
} | { status: 'failed'; reason: PublicationReadFailure };

type Identity = { id: number; slug: string };
type Candidate = { id: number; game_id: number; version_str: string; option_count: number | null };
const positiveId = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;
// 0/null만 수량 미확인으로 보존하며 손상된 수량을 추측하거나 보정하지 않습니다.
const candidateCount = (value: unknown): value is number | null => value === null || Number.isSafeInteger(value) && (value as number) >= 0;
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const slug = (value: unknown): value is string => typeof value === 'string' && value.length <= 200 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
export const PUBLICATION_INPUT_BUDGET = Object.freeze({ textBytes: 8388608, mappingTextBytes: 262144, jsonUpperBoundBytes: 16777216, timeoutMs: 15000 });

/** UTF8 본문과 JSON escape의 보수적 상한을 따로 세어 거대한 입력을 거부합니다. */
export function isPublicationPayloadWithinBudget(value: Record<string, unknown>): boolean {
  if (!Array.isArray(value.source_games) || !Array.isArray(value.candidate_trainers) || !Array.isArray(value.approved_mappings)) return false;
  let bytes = typeof value.locale === 'string' ? Buffer.byteLength(value.locale, 'utf8') : 0;
  const add = (text: unknown) => {
    if (typeof text !== 'string') return false;
    bytes += Buffer.byteLength(text, 'utf8');
    return bytes <= PUBLICATION_INPUT_BUDGET.textBytes;
  };
  if (!object(value.canonical_game) || !add(value.canonical_game.slug)) return false;
  for (const game of value.source_games) if (!object(game) || !add(game.slug)) return false;
  for (const trainer of value.candidate_trainers) if (!object(trainer) || !add(trainer.version_str)) return false;
  for (const mapping of value.approved_mappings) {
    if (!object(mapping) || typeof mapping.original_text !== 'string' || typeof mapping.translated_text !== 'string' ||
      Buffer.byteLength(mapping.original_text, 'utf8') + Buffer.byteLength(mapping.translated_text, 'utf8') > PUBLICATION_INPUT_BUDGET.mappingTextBytes ||
      !add(mapping.language_code) || !add(mapping.original_text) || !add(mapping.translated_text)) return false;
  }
  // 전송 바이트를 직접 측정한 값이 아니라, escape 6배와 행별 구조 비용을 포함한 상한입니다.
  return 1024 + 512 * (value.candidate_trainers.length + value.approved_mappings.length + 3) + 6 * bytes <= PUBLICATION_INPUT_BUDGET.jsonUpperBoundBytes;
}

/** 허용한 canonical 입력과 자체 현지화 언어만 RPC로 전달합니다. 별칭 해석은 하지 않습니다. */
export function isPublicationReadRequest(value: unknown): value is PublicationReadRequest {
  return object(value) && slug(value.canonicalSlug) && typeof value.locale === 'string' &&
    (PUBLIC_LOCALIZATION_LOCALES as readonly string[]).includes(value.locale);
}

/** 부분 응답·타 게임·타 언어·미승인 행은 전체 응답을 거부하며 원본 오류 내용은 반환하지 않습니다. */
export function parsePublicationReadPayload(value: unknown, request: PublicationReadRequest): PublicationReadResult {
  const invalid: PublicationReadResult = { status: 'failed', reason: 'INVALID_RPC_PAYLOAD' };
  if (!isPublicationReadRequest(request) || !object(value) || value.schema_version !== 1 || value.locale !== request.locale ||
    typeof value.fingerprint !== 'string' || !/^[0-9a-f]{64}$/.test(value.fingerprint) ||
    !object(value.canonical_game) || !positiveId(value.canonical_game.id) || value.canonical_game.slug !== request.canonicalSlug ||
    !object(value.counts) ||
    !Array.isArray(value.source_games) || value.source_games.length < 1 || value.source_games.length > 2 ||
    !Array.isArray(value.candidate_trainers) || value.candidate_trainers.length > 500 ||
    !Array.isArray(value.approved_mappings) || value.approved_mappings.length > 20000) return invalid;
  if (value.counts.source_games !== value.source_games.length || value.counts.candidate_trainers !== value.candidate_trainers.length ||
    value.counts.approved_mappings !== value.approved_mappings.length) return invalid;
  if (!isPublicationPayloadWithinBudget(value)) return invalid;

  const canonical: Identity = { id: value.canonical_game.id, slug: request.canonicalSlug };
  const games: Identity[] = [];
  const gameIds = new Set<number>();
  const gameSlugs = new Set<string>();
  for (const row of value.source_games) {
    if (!object(row) || !positiveId(row.id) || !slug(row.slug) || gameIds.has(row.id) || gameSlugs.has(row.slug) ||
      !(row.id === canonical.id && row.slug === canonical.slug ||
        canonical.slug === ELDEN_RING_CANONICAL_SLUG && row.slug === ELDEN_RING_SOURCE_SLUG && row.id !== canonical.id)) return invalid;
    gameIds.add(row.id); gameSlugs.add(row.slug);
    games.push({ id: row.id, slug: row.slug });
  }
  if (!gameIds.has(canonical.id)) return invalid;
  const trainers: Candidate[] = [];
  const trainerIds = new Set<number>();
  for (const row of value.candidate_trainers) {
    if (!object(row) || !positiveId(row.id) || trainerIds.has(row.id) || !positiveId(row.game_id) || !gameIds.has(row.game_id) ||
      typeof row.version_str !== 'string' || !row.version_str.trim() || !candidateCount(row.option_count)) return invalid;
    trainerIds.add(row.id);
    trainers.push({ id: row.id, game_id: row.game_id, version_str: row.version_str, option_count: row.option_count });
  }
  // 기존 공개 화면의 병합·버전 정렬 함수를 그대로 사용합니다. SQL에서 정렬을 재구현하지 않습니다.
  const orderedTrainers = getPatcherTrainers(canonical, games, trainers);
  if (orderedTrainers.length !== trainers.length) return invalid;
  const mappingsByTrainer: Record<number, TrainerOptionTableMapping[]> = {};
  for (const trainer of orderedTrainers) mappingsByTrainer[trainer.id] = [];
  const mappingIds = new Set<number>();
  const mappingOffsets = new Set<string>();
  for (const row of value.approved_mappings) {
    if (!object(row) || !positiveId(row.id) || mappingIds.has(row.id) || !positiveId(row.trainer_id) || !trainerIds.has(row.trainer_id) ||
      row.language_code !== request.locale || row.is_approved !== true ||
      !Number.isSafeInteger(row.offset_dec) || (row.offset_dec as number) < 0 ||
      typeof row.original_text !== 'string' || typeof row.translated_text !== 'string') return invalid;
    const offsetKey = `${row.trainer_id}:${row.offset_dec}`;
    if (mappingOffsets.has(offsetKey)) return invalid;
    mappingOffsets.add(offsetKey); mappingIds.add(row.id);
    mappingsByTrainer[row.trainer_id].push({
      trainer_id: row.trainer_id, language_code: request.locale, is_approved: true,
      offset_dec: row.offset_dec as number, original_text: row.original_text, translated_text: row.translated_text,
    });
  }
  return { status: 'ready', fingerprint: value.fingerprint, input: {
    locale: request.locale, orderedTrainers: orderedTrainers.map(({ id, version_str, option_count }) => ({ id, version_str, option_count })), mappingsByTrainer,
  } };
}

/**
 * 단일 읽기 RPC만 실행하며 15초 후 클라이언트 대기를 끝내고 취소 신호를 보냅니다.
 * 서버 쿼리 취소·실행시간 제한은 보장하지 않습니다. 자동 실행·재시도·쓰기도 없습니다.
 */
export async function readPatcherPublicationInput(
  request: PublicationReadRequest,
  client?: Pick<SupabaseClient, 'rpc'> | null,
): Promise<PublicationReadResult> {
  if (!isPublicationReadRequest(request)) return { status: 'failed', reason: 'INVALID_REQUEST' };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const controller = new AbortController();
  try {
    const reader = client === undefined ? getAdminClient() : client;
    if (!reader) return { status: 'failed', reason: 'ADMIN_CLIENT_UNAVAILABLE' };
    const rpc = reader.rpc('read_patcher_publication_input', {
      p_canonical_slug: request.canonicalSlug, p_locale: request.locale,
    }).abortSignal(controller.signal);
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error('PUBLICATION_RPC_TIMEOUT')); }, PUBLICATION_INPUT_BUDGET.timeoutMs);
    });
    // abort를 무시하는 fetch 구현에서도 대기는 종료합니다. 늦게 도착한 응답은 사용하지 않습니다.
    const { data, error } = await Promise.race([rpc, timeout]);
    if (error) return { status: 'failed', reason: 'RPC_FAILED' };
    return parsePublicationReadPayload(data, request);
  } catch {
    return { status: 'failed', reason: 'RPC_FAILED' };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

