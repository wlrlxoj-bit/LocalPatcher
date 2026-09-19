import { cache } from 'react';
import { sortTrainersLatestFirst, supabase } from '@/lib/supabase';
import { canonicalizeListedGameSlug } from '@/lib/game-slug-aliases';
import { PUBLIC_LOCALIZATION_LOCALES } from '@/lib/site';

/** 자동 현지화와 검색 노출을 허용하는 언어입니다. 영문 원문은 FLiNG로 연결합니다. */
export const AUTO_LOCALIZATION_LOCALES = PUBLIC_LOCALIZATION_LOCALES;
export type IndexableLocale = (typeof AUTO_LOCALIZATION_LOCALES)[number];

const PAGE_SIZE = 1000;
const MAX_PAGES = 100;
const ID_CHUNK_SIZE = 500;

type TrainerRow = { id: number; game_id: number; option_count: number; version_str: string };
type MappingRow = {
  trainer_id: number;
  original_text: string | null;
  translated_text: string | null;
  is_approved: boolean;
};

export function isAutoLocalizationLocale(locale: string): locale is IndexableLocale {
  return AUTO_LOCALIZATION_LOCALES.includes(locale as IndexableLocale);
}

function hasCompleteApprovedMappings(rows: MappingRow[], optionCount: number): boolean {
  if (rows.length === 0 || !rows.every((row) => row.is_approved &&
    typeof row.original_text === 'string' && row.original_text.trim().length > 0 &&
    typeof row.translated_text === 'string' && row.translated_text.trim().length > 0
  )) return false;

  // 한 슬롯에 전체 옵션 블록을 저장하는 최신 형식과, 슬롯을 나눈 과거 형식 모두를
  // 허용하되 승인된 원문에서 실제 옵션 수를 확인한다. 일부 슬롯만 승인된 페이지는
  // sitemap/index에 들어갈 수 없다.
  const optionLabels = rows.flatMap((row) => row.original_text!.match(/(?:^|\n)\s*(?:Num\s*)?\d+\s*[:.)-]/g) || []);
  return optionLabels.length >= optionCount;
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
  throw new Error('색인 자격 조회가 안전 상한을 초과했습니다.');
}

async function readLocaleMappings(trainerIds: number[], locale: IndexableLocale): Promise<MappingRow[]> {
  if (!supabase || trainerIds.length === 0) return [];
  const rows: MappingRow[] = [];
  for (let index = 0; index < trainerIds.length; index += ID_CHUNK_SIZE) {
    const { data, error } = await supabase
      .from('translation_mappings')
      .select('trainer_id,original_text,translated_text,is_approved')
      .in('trainer_id', trainerIds.slice(index, index + ID_CHUNK_SIZE))
      .eq('language_code', locale);
    if (error || !data) throw error || new Error('언어별 번역 매핑을 조회하지 못했습니다.');
    rows.push(...data as MappingRow[]);
  }
  return rows;
}

function latestTrainerByGame(trainers: TrainerRow[]): Map<number, TrainerRow> {
  const grouped = new Map<number, TrainerRow[]>();
  for (const trainer of trainers) {
    grouped.set(trainer.game_id, [...(grouped.get(trainer.game_id) || []), trainer]);
  }
  return new Map([...grouped.entries()].map(([gameId, gameTrainers]) => [
    gameId,
    sortTrainersLatestFirst(gameTrainers)[0],
  ]));
}

/**
 * 최신 트레이너의 옵션과 해당 언어의 승인된 완전 매핑이 모두 있을 때만 색인을 허용합니다.
 * DB 조회 실패는 false로 처리해 미완성 URL이 검색 엔진에 노출되지 않도록 합니다.
 */
export const isPatcherIndexEligible = cache(async (gameId: number, locale: string): Promise<boolean> => {
  if (!isAutoLocalizationLocale(locale) || !supabase) return false;
  try {
    const { data, error } = await supabase
      .from('trainers')
      .select('id,game_id,option_count,version_str')
      .eq('game_id', gameId);
    if (error || !data) throw error || new Error('최신 트레이너를 조회하지 못했습니다.');
    const latestTrainer = sortTrainersLatestFirst(data as TrainerRow[])[0];
    if (!latestTrainer || latestTrainer.option_count <= 0) return false;
    return hasCompleteApprovedMappings(await readLocaleMappings([latestTrainer.id], locale), latestTrainer.option_count);
  } catch (error) {
    console.warn('패처 색인 자격을 확정하지 못해 noindex로 처리합니다:', error);
    return false;
  }
});

/**
 * 사이트맵·디렉터리용 목록입니다. 현재 최신 트레이너가 승인·완전 번역된 게임만 반환합니다.
 * 과거 스냅샷과 오래된 캐시를 사용하지 않아 DB 장애 시 빈 목록으로 fail-closed 합니다.
 */
export async function getEligiblePatcherSlugs(locale: string): Promise<string[]> {
  const client = supabase;
  if (!isAutoLocalizationLocale(locale) || !client) return [];
  try {
    const [games, trainers] = await Promise.all([
      readAllPages<{ id: number; slug: string; title_en: string }>(async (from, to) =>
        await client.from('games').select('id,slug,title_en').order('id').range(from, to)
      ),
      readAllPages<TrainerRow>(async (from, to) =>
        await client.from('trainers').select('id,game_id,option_count,version_str').order('id').range(from, to)
      ),
    ]);
    const latestByGame = latestTrainerByGame(trainers);
    const latestTrainers = [...latestByGame.values()].filter((trainer) => trainer.option_count > 0);
    const mappingsByTrainer = new Map<number, MappingRow[]>();
    for (const mapping of await readLocaleMappings(latestTrainers.map((trainer) => trainer.id), locale)) {
      mappingsByTrainer.set(mapping.trainer_id, [...(mappingsByTrainer.get(mapping.trainer_id) || []), mapping]);
    }
    const eligibleGameIds = new Set(latestTrainers
      .filter((trainer) => hasCompleteApprovedMappings(mappingsByTrainer.get(trainer.id) || [], trainer.option_count))
      .map((trainer) => trainer.game_id));
    const eligibleSlugs = games.filter((game) => eligibleGameIds.has(game.id)).map((game) => game.slug);
    const existingSlugs = new Set(eligibleSlugs);
    const titleBySlug = new Map(games.map((game) => [game.slug, game.title_en]));
    return [...new Set(eligibleSlugs.map((slug) => canonicalizeListedGameSlug(slug, existingSlugs, titleBySlug)))];
  } catch (error) {
    console.warn('사이트맵 색인 자격을 확정하지 못해 빈 목록으로 처리합니다:', error);
    return [];
  }
}
