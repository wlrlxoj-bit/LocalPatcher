import { cache } from 'react';
import { supabase } from '@/lib/supabase';

export type IndexableLocale = 'ko' | 'ja';
const PAGE_SIZE = 1000;
const MAX_PAGES = 100;
const ID_CHUNK_SIZE = 500;
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_STALE_WINDOW_MS = 30 * 60 * 1000;
type TimedCacheEntry<T> = { value: T; cachedAt: number };
const eligibilityCache = new Map<string, TimedCacheEntry<boolean>>();
const sitemapEligibilityCache = new Map<IndexableLocale, TimedCacheEntry<string[]>>();

function readFreshCache<T>(entry: TimedCacheEntry<T> | undefined): T | undefined {
  return entry && Date.now() - entry.cachedAt <= CACHE_TTL_MS ? entry.value : undefined;
}

function readStaleCache<T>(entry: TimedCacheEntry<T> | undefined): T | undefined {
  return entry && Date.now() - entry.cachedAt <= CACHE_STALE_WINDOW_MS ? entry.value : undefined;
}

async function readAllPages<T>(fetchPage: (from: number, to: number) => Promise<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE_SIZE;
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1);
    if (error || !data) throw new Error('색인 자격 페이지 조회에 실패했습니다.');
    rows.push(...data);
    if (data.length < PAGE_SIZE) return rows;
  }
  console.warn('색인 자격 조회가 최대 페이지 수에 도달했습니다.');
  throw new Error('색인 자격 조회가 안전 상한을 초과했습니다.');
}

/** 승인된 번역 미리보기가 실제로 있는 상세 페이지만 색인 대상으로 판정합니다. */
export const isPatcherIndexEligible = cache(async (gameId: number, locale: string): Promise<boolean> => {
  if (locale !== 'ko' && locale !== 'ja') return false;
  const cacheKey = `${gameId}:${locale}`;
  const fresh = readFreshCache(eligibilityCache.get(cacheKey));
  if (fresh !== undefined) return fresh;
  if (!supabase) {
    const cached = readStaleCache(eligibilityCache.get(cacheKey));
    if (cached !== undefined) return cached;
    throw new Error('Supabase가 설정되지 않아 색인 자격을 확정할 수 없습니다.');
  }
  try {
    const { data: trainers, error: trainerError } = await supabase.from('trainers').select('id, option_count').eq('game_id', gameId).gt('option_count', 0);
    if (trainerError) throw trainerError;
    if (!trainers?.length) {
      eligibilityCache.set(cacheKey, { value: false, cachedAt: Date.now() });
      return false;
    }
    const { count, error } = await supabase.from('translation_mappings').select('id', { count: 'exact', head: true }).in('trainer_id', trainers.map((trainer) => trainer.id)).eq('language_code', locale).eq('is_approved', true);
    if (error) throw error;
    const eligible = (count ?? 0) > 0;
    eligibilityCache.set(cacheKey, { value: eligible, cachedAt: Date.now() });
    return eligible;
  } catch (error) {
    const cached = readStaleCache(eligibilityCache.get(cacheKey));
    if (cached !== undefined) return cached;
    throw error;
  }
});

export async function getEligiblePatcherSlugs(locale: IndexableLocale): Promise<string[]> {
  const fresh = readFreshCache(sitemapEligibilityCache.get(locale));
  if (fresh !== undefined) return [...fresh];
  if (!supabase) {
    const cached = readStaleCache(sitemapEligibilityCache.get(locale));
    if (cached !== undefined) return [...cached];
    throw new Error('Supabase가 설정되지 않아 사이트맵 색인 자격을 확정할 수 없습니다.');
  }
  const client = supabase;
  try {
    const games = await readAllPages<{ id: number; slug: string }>(async (from, to) => await client.from('games').select('id, slug').order('id').range(from, to));
    if (!games.length) {
      sitemapEligibilityCache.set(locale, { value: [], cachedAt: Date.now() });
      return [];
    }
    const trainers = await readAllPages<{ id: number; game_id: number; option_count: number }>(async (from, to) => await client.from('trainers').select('id, game_id, option_count').gt('option_count', 0).order('id').range(from, to));
    if (!trainers.length) {
      sitemapEligibilityCache.set(locale, { value: [], cachedAt: Date.now() });
      return [];
    }
    const mappings: Array<{ trainer_id: number }> = [];
    for (let offset = 0; offset < trainers.length; offset += ID_CHUNK_SIZE) {
      const ids = trainers.slice(offset, offset + ID_CHUNK_SIZE).map((trainer) => trainer.id);
      const chunk = await readAllPages<{ trainer_id: number }>(async (from, to) => await client.from('translation_mappings').select('trainer_id').in('trainer_id', ids).eq('language_code', locale).eq('is_approved', true).order('id').range(from, to));
      mappings.push(...chunk);
    }
    if (!mappings.length) {
      sitemapEligibilityCache.set(locale, { value: [], cachedAt: Date.now() });
      return [];
    }
    const mappedTrainerIds = new Set(mappings.map((mapping) => mapping.trainer_id));
    const eligibleGameIds = new Set(trainers.filter((trainer) => mappedTrainerIds.has(trainer.id)).map((trainer) => trainer.game_id));
    const slugs = games.filter((game) => eligibleGameIds.has(game.id)).map((game) => game.slug);
    sitemapEligibilityCache.set(locale, { value: slugs, cachedAt: Date.now() });
    return [...slugs];
  } catch (error) {
    const cached = readStaleCache(sitemapEligibilityCache.get(locale));
    if (cached !== undefined) return [...cached];
    throw error;
  }
}
