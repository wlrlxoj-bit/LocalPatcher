import { cache } from 'react';
import { supabase } from '@/lib/supabase';
import { canonicalizeListedGameSlug } from '@/lib/game-slug-aliases';

export type IndexableLocale = 'en' | 'ko' | 'ja' | 'de' | 'es';
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

/** 영어나 다국어 번역 여부에 관계없이 트레이너(옵션)가 존재하면 무조건 색인(Index)을 허용합니다. */
export const isPatcherIndexEligible = cache(async (gameId: number, locale: string): Promise<boolean> => {
  if (locale !== 'en' && locale !== 'ko' && locale !== 'ja' && locale !== 'de' && locale !== 'es') return false;
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
    const eligible = !!(trainers && trainers.length > 0);
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
    const games = await readAllPages<{ id: number; slug: string; title_en: string }>(async (from, to) => await client.from('games').select('id, slug, title_en').order('id').range(from, to));
    if (!games.length) {
      sitemapEligibilityCache.set(locale, { value: [], cachedAt: Date.now() });
      return [];
    }
    const trainers = await readAllPages<{ id: number; game_id: number; option_count: number }>(async (from, to) => await client.from('trainers').select('id, game_id, option_count').gt('option_count', 0).order('id').range(from, to));
    if (!trainers.length) {
      sitemapEligibilityCache.set(locale, { value: [], cachedAt: Date.now() });
      return [];
    }
    
    // 번역 여부에 관계없이 트레이너가 존재하는 모든 게임을 색인 대상(사이트맵)에 포함합니다.
    const eligibleGameIds = new Set(trainers.map((trainer) => trainer.game_id));
    const eligibleSlugs = games.filter((game) => eligibleGameIds.has(game.id)).map((game) => game.slug);
    
    const existingSlugs = new Set(eligibleSlugs);
    const finalSlugs = [...new Set(eligibleSlugs.map((slug) => canonicalizeListedGameSlug(slug, existingSlugs)))];
    
    sitemapEligibilityCache.set(locale, { value: finalSlugs, cachedAt: Date.now() });
    return finalSlugs;

  } catch (error) {
    const cached = readStaleCache(sitemapEligibilityCache.get(locale));
    if (cached !== undefined) return [...cached];
    throw error;
  }
}
