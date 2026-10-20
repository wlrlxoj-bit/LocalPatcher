import { PUBLIC_LOCALIZATION_LOCALES } from './site';
import {
  getTrainerOptionTable,
  type TrainerOptionTable,
  type TrainerOptionTableMapping,
} from './trainer-option-table';

/** 호출자가 이미 정렬한 수집 버전입니다. 원본 파일의 신원을 증명하는 자료는 아닙니다. */
export interface PublicationTrainer {
  id: number;
  version_str: string;
  option_count: number | null;
}

export interface PatcherPublicationInput {
  locale: string;
  orderedTrainers: readonly PublicationTrainer[];
  mappingsByTrainer: Readonly<Record<number, readonly TrainerOptionTableMapping[] | undefined>>;
}

export type PatcherPublicationResult = {
  status: 'available';
  latestDiscoveredTrainer: PublicationTrainer;
  publishedTrainer: PublicationTrainer;
  optionTable: TrainerOptionTable;
  usesPreviousVersion: boolean;
} | {
  status: 'unavailable';
  latestDiscoveredTrainer: PublicationTrainer | null;
  reason: 'NO_TRAINERS' | 'UNSUPPORTED_LOCALE' | 'INVALID_TRAINER_INPUT' | 'NO_COMPLETE_APPROVED_TRANSLATION';
};

/** 외부 필드를 전파하지 않고 공개 버전 식별에 필요한 값만 복사합니다. */
function copyTrainer(trainer: PublicationTrainer): PublicationTrainer {
  return { id: trainer.id, version_str: trainer.version_str, option_count: trainer.option_count };
}

/**
 * 호출자 순서를 보존하여 현재 언어의 완전한 승인 옵션 표가 있는 첫 버전을 선택합니다.
 * 입력·배열을 변경하지 않으며 파일 다운로드, DB 조회, 색인 허용 판정을 수행하지 않습니다.
 * 내부 indexEligible:true는 표 검증기를 호출하기 위한 값일 뿐 실제 색인 승인이나
 * 바이너리 신원·해시 검증 완료를 뜻하지 않습니다. 자체 현지화 공개 언어만 대상으로 하며
 * 영어의 별도 정보·FLiNG 안내 경로나 기존 색인 정책은 변경하지 않습니다.
 */
export function resolvePatcherPublication({ locale, orderedTrainers, mappingsByTrainer }: PatcherPublicationInput): PatcherPublicationResult {
  if (!Array.isArray(orderedTrainers)) {
    return { status: 'unavailable', latestDiscoveredTrainer: null, reason: 'INVALID_TRAINER_INPUT' };
  }
  const seenIds = new Set<number>();
  for (const trainer of orderedTrainers) {
    if (!trainer || !Number.isSafeInteger(trainer.id) || trainer.id <= 0 || seenIds.has(trainer.id) ||
      typeof trainer.version_str !== 'string' || !trainer.version_str.trim() ||
      !(trainer.option_count === null || Number.isSafeInteger(trainer.option_count) && trainer.option_count >= 0)) {
      return { status: 'unavailable', latestDiscoveredTrainer: null, reason: 'INVALID_TRAINER_INPUT' };
    }
    seenIds.add(trainer.id);
  }
  const latestDiscoveredTrainer = orderedTrainers[0] ? copyTrainer(orderedTrainers[0]) : null;
  if (!(PUBLIC_LOCALIZATION_LOCALES as readonly string[]).includes(locale)) {
    return { status: 'unavailable', latestDiscoveredTrainer, reason: 'UNSUPPORTED_LOCALE' };
  }
  if (!latestDiscoveredTrainer) {
    return { status: 'unavailable', latestDiscoveredTrainer: null, reason: 'NO_TRAINERS' };
  }

  for (const trainer of orderedTrainers) {
    // 미확인 수량은 수집 최신 상태로 보존하되 완전한 게시 표로 선택하지 않습니다.
    if (trainer.option_count === null || trainer.option_count === 0) continue;
    const storedMappings = mappingsByTrainer?.[trainer.id];
    if (!Array.isArray(storedMappings)) continue;
    // 다른 언어는 격리하고, 같은 언어의 미승인·잘못된 ID는 후보 전체를 거부합니다.
    const mappings = storedMappings.filter((mapping) => mapping?.language_code === locale);
    if (mappings.some((mapping) => typeof mapping.original_text !== 'string' || typeof mapping.translated_text !== 'string')) continue;
    const optionTable = getTrainerOptionTable({
      latestTrainerId: trainer.id,
      locale,
      optionCount: trainer.option_count,
      indexEligible: true,
      mappings,
    });
    if (optionTable) {
      return {
        status: 'available', latestDiscoveredTrainer, publishedTrainer: copyTrainer(trainer),
        optionTable, usesPreviousVersion: trainer.id !== latestDiscoveredTrainer.id,
      };
    }
  }
  return { status: 'unavailable', latestDiscoveredTrainer, reason: 'NO_COMPLETE_APPROVED_TRANSLATION' };
}

