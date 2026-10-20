import 'server-only';

import { resolvePatcherPublication } from '@/lib/patcher-publication';
import { isPublicationReadRequest, type PublicationReadRequest, type PublicationReadResult } from './patcher-publication-input';

const REASONS = [
  'INVALID_REQUEST', 'ADMIN_CLIENT_UNAVAILABLE', 'RPC_FAILED', 'INVALID_RPC_PAYLOAD', 'READER_FAILED',
  'NO_TRAINERS', 'UNSUPPORTED_LOCALE', 'INVALID_TRAINER_INPUT', 'NO_COMPLETE_APPROVED_TRANSLATION',
] as const;
type DryRunReason = typeof REASONS[number];
export interface PublicationDryRunSummary {
  status: 'complete' | 'invalid_batch';
  total: number;
  available: number;
  latest: number;
  previous: number;
  unavailable: number;
  reasons: Record<DryRunReason, number>;
}
export type PublicationInputReader = (request: PublicationReadRequest) => Promise<PublicationReadResult>;

/**
 * 주입한 읽기 콜백만 최대 20회 순차 호출하는 운영 비활성 진단입니다. DB·캐시·outbox 쓰기와
 * 자동 reader 생성은 없으며 원문·번역·버전·게임 ID·fingerprint 대신 고정 집계만 반환합니다.
 */
export async function dryRunPatcherPublication(
  requests: readonly PublicationReadRequest[],
  readInput: PublicationInputReader,
): Promise<PublicationDryRunSummary> {
  const summary: PublicationDryRunSummary = {
    status: 'complete', total: 0, available: 0, latest: 0, previous: 0, unavailable: 0,
    reasons: Object.fromEntries(REASONS.map((reason) => [reason, 0])) as Record<DryRunReason, number>,
  };
  if (!Array.isArray(requests) || requests.length > 20 || typeof readInput !== 'function') {
    summary.status = 'invalid_batch';
    return summary;
  }
  for (const request of requests) {
    summary.total += 1;
    let failure: DryRunReason | null = null;
    if (!isPublicationReadRequest(request)) failure = 'INVALID_REQUEST';
    else {
      try {
        const result = await readInput(request);
        if (result.status === 'failed') {
          failure = REASONS.includes(result.reason) ? result.reason : 'INVALID_RPC_PAYLOAD';
        } else if (result.status !== 'ready' || result.input.locale !== request.locale) {
          failure = 'INVALID_RPC_PAYLOAD';
        } else {
          const publication = resolvePatcherPublication(result.input);
          if (publication.status === 'available') {
            summary.available += 1;
            if (publication.usesPreviousVersion) summary.previous += 1;
            else summary.latest += 1;
          } else failure = publication.reason;
        }
      } catch {
        failure = 'READER_FAILED';
      }
    }
    if (failure) { summary.unavailable += 1; summary.reasons[failure] += 1; }
  }
  return summary;
}

