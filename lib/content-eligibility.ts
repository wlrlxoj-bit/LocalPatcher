import { cache } from 'react';
import { sortTrainersLatestFirst, supabase } from '@/lib/supabase';
import { canonicalizeListedGameSlug } from '@/lib/game-slug-aliases';
import { PUBLIC_LOCALIZATION_LOCALES } from '@/lib/site';

/** 자동 현지화와 검색 노출을 허용하는 언어입니다. 영문 원문은 FLiNG로 연결합니다. */
export const AUTO_LOCALIZATION_LOCALES = PUBLIC_LOCALIZATION_LOCALES;
export type IndexableLocale = (typeof AUTO_LOCALIZATION_LOCALES)[number];
export const ELDEN_RING_CANONICAL_SLUG = 'elden-ring';
export const ELDEN_RING_SOURCE_SLUG = 'elden-ring-shadow-of-the-erdtree-trainer-1768067282';

const PAGE_SIZE = 1000;
const MAX_PAGES = 100;
const ID_CHUNK_SIZE = 500;
// translation_validation.py의 OPTION_RE와 같은 단축키 문법을 사용한다. 숫자가
// 설명 문장에 포함된 경우를 옵션으로 오인하지 않고, `Ctrl + Num 1 -`, `Num + :`처럼
// modifier·Num 특수 키·구분자 앞 공백이 있는 승인 원문도 유효한 옵션으로 센다.
const OPTION_KEY_PATTERN = String.raw`(?:Num(?:Pad)?[ \t]*(?:[0-9]|Plus|Minus|Decimal|Divide|Multiply|[+\-./*])|F(?:[1-9]|1[0-9]|2[0-4])|Ctrl|Alt|Shift|Home|End|Insert|Delete|PageUp|PageDown|Up|Down|Left|Right|Arrow(?:Up|Down|Left|Right)|Bracket(?:Left|Right)|[\[\]]|[A-Z0-9+\-=.,/])`;
const OPTION_LABEL_PATTERN = new RegExp(
  String.raw`^[ \t]*${OPTION_KEY_PATTERN}(?:[ \t]*\+[ \t]*${OPTION_KEY_PATTERN})*[ \t]*(?=(?:->|—|–|→|-|:)[ \t]*\S)`,
  'gim',
);

type TrainerRow = { id: number; game_id: number; option_count: number; version_str: string };
type GameIdentity = { id: number; slug: string };
type MappingRow = {
  trainer_id: number;
  original_text: string | null;
  translated_text: string | null;
  is_approved: boolean;
};

export function isAutoLocalizationLocale(locale: string): locale is IndexableLocale {
  return AUTO_LOCALIZATION_LOCALES.includes(locale as IndexableLocale);
}

/** 승인된 원문이 번역 검증기와 같은 수의 실제 옵션을 포함하는지 확인합니다. */
export function hasCompleteApprovedMappings(rows: MappingRow[], optionCount: number): boolean {
  if (rows.length === 0 || !rows.every((row) => row.is_approved &&
    typeof row.original_text === 'string' && row.original_text.trim().length > 0 &&
    typeof row.translated_text === 'string' && row.translated_text.trim().length > 0
  )) return false;

  // 한 슬롯에 전체 옵션 블록을 저장하는 최신 형식과, 슬롯을 나눈 과거 형식 모두를
  // 허용하되 승인된 원문에서 실제 옵션 수를 확인한다. 일부 슬롯만 승인된 페이지는
  // sitemap/index에 들어갈 수 없다.
  const optionLabels = rows.flatMap((row) => {
    OPTION_LABEL_PATTERN.lastIndex = 0;
    return row.original_text!.match(OPTION_LABEL_PATTERN) || [];
  });
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
  const uniqueTrainerIds = [...new Set(trainerIds)];
  if (!supabase || uniqueTrainerIds.length === 0) return [];
  const rows: MappingRow[] = [];
  for (let index = 0; index < uniqueTrainerIds.length; index += ID_CHUNK_SIZE) {
    const { data, error } = await supabase
      .from('translation_mappings')
      .select('trainer_id,original_text,translated_text,is_approved')
      .in('trainer_id', uniqueTrainerIds.slice(index, index + ID_CHUNK_SIZE))
      .eq('language_code', locale);
    if (error || !data) throw error || new Error('언어별 번역 매핑을 조회하지 못했습니다.');
    rows.push(...data as MappingRow[]);
  }
  return rows;
}

function groupMappingsByTrainer(rows: MappingRow[]): Map<number, MappingRow[]> {
  const mappingsByTrainer = new Map<number, MappingRow[]>();
  for (const mapping of rows) {
    mappingsByTrainer.set(mapping.trainer_id, [...(mappingsByTrainer.get(mapping.trainer_id) || []), mapping]);
  }
  return mappingsByTrainer;
}

type EligibilityData = {
  requestedGames: GameIdentity[];
  allGames: GameIdentity[];
  latestTrainerByGameId: Map<number, TrainerRow | undefined>;
};

/**
 * 여러 화면 카드가 같은 언어의 자격을 물을 때 게임·트레이너를 한 번만 읽습니다.
 * 엘든 링의 source 트레이너도 이 시점에 포함해 화면과 sitemap의 최신 버전 선택을
 * 동일하게 유지합니다.
 */
async function loadEligibilityData(gameIds: number[]): Promise<EligibilityData> {
  if (!supabase) throw new Error('색인 자격 DB가 설정되지 않았습니다.');
  const uniqueGameIds = [...new Set(gameIds.filter((id) => Number.isSafeInteger(id) && id > 0))];
  if (uniqueGameIds.length === 0) {
    return { requestedGames: [], allGames: [], latestTrainerByGameId: new Map() };
  }

  const { data: requestedRows, error: requestedError } = await supabase
    .from('games')
    .select('id,slug')
    .in('id', uniqueGameIds);
  if (requestedError || !requestedRows) throw requestedError || new Error('색인 대상 게임을 조회하지 못했습니다.');
  const requestedGames = requestedRows as GameIdentity[];

  let allGames = requestedGames;
  if (requestedGames.some((game) => game.slug === ELDEN_RING_CANONICAL_SLUG)) {
    const { data: sourceRows, error: sourceError } = await supabase
      .from('games')
      .select('id,slug')
      .eq('slug', ELDEN_RING_SOURCE_SLUG);
    if (sourceError) throw sourceError;
    if (sourceRows?.length === 1 && !requestedGames.some((game) => game.id === sourceRows[0].id)) {
      allGames = [...requestedGames, sourceRows[0] as GameIdentity];
    }
  }

  const { data: trainerRows, error: trainerError } = await supabase
    .from('trainers')
    .select('id,game_id,option_count,version_str')
    .in('game_id', allGames.map((game) => game.id));
  if (trainerError || !trainerRows) throw trainerError || new Error('최신 트레이너를 조회하지 못했습니다.');
  const trainers = trainerRows as TrainerRow[];
  const latestTrainerByGameId = new Map(requestedGames.map((game) => [
    game.id,
    getLatestPatcherTrainer(game, allGames, trainers),
  ]));
  return { requestedGames, allGames, latestTrainerByGameId };
}

function resolveEligibility(data: EligibilityData, mappings: MappingRow[]): Map<number, boolean> {
  const mappingsByTrainer = groupMappingsByTrainer(mappings);
  return new Map(data.requestedGames.map((game) => {
    const trainer = data.latestTrainerByGameId.get(game.id);
    return [game.id, Boolean(trainer && trainer.option_count > 0 &&
      hasCompleteApprovedMappings(mappingsByTrainer.get(trainer.id) || [], trainer.option_count))];
  }));
}

/**
 * 실제 패처 화면과 같은 트레이너 집합에서 최신 항목을 고릅니다.
 * 엘든 링은 레거시 source slug의 트레이너를 함께 비교하므로, 그 source의 더 새 버전이
 * 미승인 상태이면 canonical 엘든 링 페이지도 색인되지 않습니다.
 */
export function getPatcherTrainers(
  game: GameIdentity,
  games: GameIdentity[],
  trainers: TrainerRow[],
): TrainerRow[] {
  const trainerGameIds = new Set([game.id]);
  if (game.slug === ELDEN_RING_CANONICAL_SLUG) {
    const sourceGame = games.find((candidate) => candidate.slug === ELDEN_RING_SOURCE_SLUG);
    if (sourceGame && sourceGame.id !== game.id) trainerGameIds.add(sourceGame.id);
  }
  return sortTrainersLatestFirst(trainers.filter((trainer) => trainerGameIds.has(trainer.game_id)));
}

/** 실제 패처 화면과 같은 병합 집합의 최신 트레이너를 반환합니다. */
export function getLatestPatcherTrainer(
  game: GameIdentity,
  games: GameIdentity[],
  trainers: TrainerRow[],
): TrainerRow | undefined {
  return getPatcherTrainers(game, games, trainers)[0];
}

/**
 * 최신 트레이너의 옵션과 해당 언어의 승인된 완전 매핑이 모두 있을 때만 색인을 허용합니다.
 * DB 조회 실패는 false로 처리해 미완성 URL이 검색 엔진에 노출되지 않도록 합니다.
 */
export async function getPatcherIndexEligibilityByGameIds(gameIds: number[], locale: string): Promise<Map<number, boolean>> {
  const emptyResult = new Map(gameIds.map((gameId) => [gameId, false]));
  if (!isAutoLocalizationLocale(locale) || !supabase) return emptyResult;
  try {
    const eligibilityData = await loadEligibilityData(gameIds);
    const trainerIds = [...eligibilityData.latestTrainerByGameId.values()]
      .filter((trainer): trainer is TrainerRow => Boolean(trainer && trainer.option_count > 0))
      .map((trainer) => trainer.id);
    return resolveEligibility(eligibilityData, await readLocaleMappings(trainerIds, locale));
  } catch (error) {
    console.warn('패처 색인 자격을 확정하지 못해 noindex로 처리합니다:', error);
    return emptyResult;
  }
}

/** 한 게임의 기존 호출부를 위한 fail-closed 편의 함수입니다. */
export const isPatcherIndexEligible = cache(async (gameId: number, locale: string): Promise<boolean> => {
  return (await getPatcherIndexEligibilityByGameIds([gameId], locale)).get(gameId) === true;
});

/** metadata/hreflang이 한 게임의 네 언어를 계산할 때 게임·트레이너 조회를 공유합니다. */
export async function getPatcherIndexEligibilityByLocales(
  gameId: number,
  locales: readonly string[],
): Promise<Map<string, boolean>> {
  const result = new Map(locales.map((locale) => [locale, false]));
  if (!supabase) return result;
  const validLocales = [...new Set(locales.filter(isAutoLocalizationLocale))];
  if (validLocales.length === 0) return result;
  try {
    const eligibilityData = await loadEligibilityData([gameId]);
    const trainer = eligibilityData.latestTrainerByGameId.get(gameId);
    if (!trainer || trainer.option_count <= 0) return result;
    const mappingRowsByLocale = await Promise.all(validLocales.map(async (locale) => [
      locale,
      await readLocaleMappings([trainer.id], locale),
    ] as const));
    for (const [locale, rows] of mappingRowsByLocale) {
      result.set(locale, resolveEligibility(eligibilityData, rows).get(gameId) === true);
    }
  } catch (error) {
    console.warn('패처 다국어 색인 자격을 확정하지 못해 noindex로 처리합니다:', error);
  }
  return result;
}

/**
 * 사이트맵·디렉터리용 목록입니다. 현재 최신 트레이너가 승인·완전 번역된 게임만 반환합니다.
 * 과거 스냅샷과 오래된 캐시를 사용하지 않아 DB 장애 시 빈 목록으로 fail-closed 합니다.
 */
async function getEligibleSlugsByLocaleFromRows(
  games: Array<{ id: number; slug: string; title_en: string }>,
  trainers: TrainerRow[],
  locales: readonly IndexableLocale[],
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>(locales.map((locale) => [locale, []]));
  if (locales.length === 0) return result;
  try {
    const gameIdentities = games.map(({ id, slug }) => ({ id, slug }));
    const latestTrainers = games
      .map((game) => getLatestPatcherTrainer(game, gameIdentities, trainers))
      .filter((trainer): trainer is TrainerRow => Boolean(trainer && trainer.option_count > 0));
    const latestTrainerByGameId = new Map(games.map((game) => [
      game.id,
      getLatestPatcherTrainer(game, gameIdentities, trainers),
    ]));
    const titleBySlug = new Map(games.map((game) => [game.slug, game.title_en]));
    const mappingRowsByLocale = await Promise.all(locales.map(async (locale) => [
      locale,
      groupMappingsByTrainer(await readLocaleMappings(latestTrainers.map((trainer) => trainer.id), locale)),
    ] as const));
    for (const [locale, mappingsByTrainer] of mappingRowsByLocale) {
      const eligibleSlugs = games.filter((game) => {
        const trainer = latestTrainerByGameId.get(game.id);
        return Boolean(trainer && trainer.option_count > 0 &&
          hasCompleteApprovedMappings(mappingsByTrainer.get(trainer.id) || [], trainer.option_count));
      }).map((game) => game.slug);
      const existingSlugs = new Set(eligibleSlugs);
      result.set(locale, [...new Set(eligibleSlugs.map((slug) => canonicalizeListedGameSlug(slug, existingSlugs, titleBySlug)))]);
    }
    return result;
  } catch (error) {
    console.warn('사이트맵 색인 자격을 확정하지 못해 빈 목록으로 처리합니다:', error);
    return result;
  }
}

export async function getEligiblePatcherSlugsByLocale(locales: readonly string[]): Promise<Map<string, string[]>> {
  const result = new Map(locales.map((locale) => [locale, []]));
  const client = supabase;
  const validLocales = [...new Set(locales.filter(isAutoLocalizationLocale))];
  if (!client || validLocales.length === 0) return result;
  try {
    const [games, trainers] = await Promise.all([
      readAllPages<{ id: number; slug: string; title_en: string }>(async (from, to) =>
        await client.from('games').select('id,slug,title_en').order('id').range(from, to)
      ),
      readAllPages<TrainerRow>(async (from, to) =>
        await client.from('trainers').select('id,game_id,option_count,version_str').order('id').range(from, to)
      ),
    ]);
    return await getEligibleSlugsByLocaleFromRows(games, trainers, validLocales);
  } catch (error) {
    console.warn('사이트맵 색인 자격을 확정하지 못해 빈 목록으로 처리합니다:', error);
    return result;
  }
}

/**
 * 홈이 이미 읽은 목록·중첩 트레이너를 재사용해 두 번째 전체 games/trainers 스캔을 막습니다.
 * 목록이 불완전하거나 매핑 조회가 실패하면 빈 목록을 반환해 기존 fail-closed 정책을 지킵니다.
 */
export async function getEligiblePatcherSlugsForListedGames(
  games: Array<{ id: number; slug: string; title_en: string; trainers?: Array<{ id: number; version_str: string; option_count: number }> }>,
  locale: string,
): Promise<string[]> {
  if (!isAutoLocalizationLocale(locale)) return [];
  const trainers = games.flatMap((game) => (game.trainers || []).map((trainer) => ({
    ...trainer,
    game_id: game.id,
  })));
  return (await getEligibleSlugsByLocaleFromRows(games, trainers, [locale])).get(locale) || [];
}

/** 단일 언어 목록 호출부의 호환용 래퍼입니다. */
export async function getEligiblePatcherSlugs(locale: string): Promise<string[]> {
  return (await getEligiblePatcherSlugsByLocale([locale])).get(locale) || [];
}
