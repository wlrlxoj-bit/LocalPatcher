const PATCHER_LOCALES = new Set(['ko', 'ja', 'de', 'es', 'en']);

/** 신규 버전 등록 시 해당 게임의 트레이너 목록만 즉시 갱신하는 태그입니다. */
export function getPatcherTrainerListCacheTag(gameId: number): string {
  if (!Number.isSafeInteger(gameId) || gameId <= 0) {
    throw new Error('트레이너 목록 캐시 태그 입력이 올바르지 않습니다.');
  }
  return `patcher:game:${gameId}:trainers`;
}

/** 트레이너 ID와 언어별 공개 매핑·처리 상태 캐시의 정확한 무효화 태그를 생성합니다. */
export function getPatcherMappingCacheTag(trainerId: number, locale: string): string {
  if (!Number.isSafeInteger(trainerId) || trainerId <= 0 || !PATCHER_LOCALES.has(locale)) {
    throw new Error('패처 캐시 태그 입력이 올바르지 않습니다.');
  }
  return `patcher:trainer:${trainerId}:locale:${locale}`;
}
