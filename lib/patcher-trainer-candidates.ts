/** 공개 패처 후보를 모으는 정확한 canonical/source 쌍입니다. 별칭을 추측하지 않습니다. */
export const ELDEN_RING_CANONICAL_SLUG = 'elden-ring';
export const ELDEN_RING_SOURCE_SLUG = 'elden-ring-shadow-of-the-erdtree-trainer-1768067282';

type GameIdentity = { id: number; slug: string };
type TrainerCandidate = { id: number; game_id: number; option_count: number | null; version_str: string };

/** 기존 version_str 문법의 마지막 v 숫자 끝점만 읽습니다. 미인식 버전은 빈 배열입니다. */
export function parseVersion(version: string): number[] {
  const matches = [...version.matchAll(/v(\d+(?:\.\d+)*)/gi)];
  const latest = matches.at(-1)?.[1] ?? '';
  return latest.split('.').filter(Boolean).map(Number);
}

/** 누락한 버전 자릿수는 0으로 보고 기존 내림차순 비교값을 반환합니다. */
export function compareVersionParts(left: number[], right: number[]): number {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (right[index] ?? 0) - (left[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/** 입력 배열은 바꾸지 않고 마지막 버전 끝점, 동일 버전의 ID 내림차순으로 정렬합니다. */
export function sortTrainersLatestFirst<T extends { id: number; version_str: string }>(trainers: T[]): T[] {
  return [...trainers].sort((left, right) =>
    compareVersionParts(parseVersion(left.version_str), parseVersion(right.version_str)) ||
    right.id - left.id
  );
}

/** 정확한 엘든 링 canonical에서만 source 게임을 합쳐 기존 화면의 후보 집합을 보존합니다. */
export function getPatcherTrainers<T extends TrainerCandidate>(
  game: GameIdentity,
  games: GameIdentity[],
  trainers: T[],
): T[] {
  const trainerGameIds = new Set([game.id]);
  if (game.slug === ELDEN_RING_CANONICAL_SLUG) {
    const sourceGame = games.find((candidate) => candidate.slug === ELDEN_RING_SOURCE_SLUG);
    if (sourceGame && sourceGame.id !== game.id) trainerGameIds.add(sourceGame.id);
  }
  return sortTrainersLatestFirst(trainers.filter((trainer) => trainerGameIds.has(trainer.game_id)));
}

/** 같은 순수 후보 집합에서 첫 트레이너를 반환하며 빈 입력이면 undefined입니다. */
export function getLatestPatcherTrainer<T extends TrainerCandidate>(
  game: GameIdentity,
  games: GameIdentity[],
  trainers: T[],
): T | undefined {
  return getPatcherTrainers(game, games, trainers)[0];
}

