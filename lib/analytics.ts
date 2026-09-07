'use client';

/**
 * GA4가 로드되지 않았거나 차단된 환경에서도 화면 동작을 방해하지 않는 이벤트 전송 도우미입니다.
 * 개인 식별자, 파일명, 게임 제목처럼 카디널리티가 높은 값은 전송하지 않습니다.
 */
type AnalyticsEvent =
  | 'download_started'
  | 'ad_gate_opened'
  | 'popup_blocked'
  | 'adblock_detected'
  | 'price_compare_viewed'
  | 'merchant_clicked'
  | 'affiliate_merchant_clicked'
  | 'patcher_viewed'
  | 'file_selection_attempted'
  | 'file_selected'
  | 'patch_completed'
  | 'fling_download_clicked'
  | 'patch_failed';

type SafeEventParameters = {
  ad_gate?: 'opened' | 'blocked' | 'unavailable';
  adblock?: 'detected';
  /** 파일명·해시·원본 오류를 보내지 않는 제한된 패치 실패 분류입니다. */
  patch_failure_reason?: 'invalid_type' | 'file_too_large' | 'not_pe' | 'unsupported_version' | 'processing_error';
  [key: string]: string | number | boolean | undefined;
};

declare global {
  interface Window {
    gtag?: (command: 'event', eventName: AnalyticsEvent, parameters?: SafeEventParameters) => void;
  }
}

const MAX_PENDING_EVENTS = 40;
const MAX_WAIT_MS = 30_000;
const RETRY_INTERVAL_MS = 250;
const pendingEvents: {
  eventName: AnalyticsEvent;
  parameters?: SafeEventParameters;
  expiresAt: number;
}[] = [];
let retryTimer: ReturnType<typeof setTimeout> | undefined;

/** 기존 GA 초기화가 끝난 뒤 대기 이벤트를 전달하며, 차단 시에는 유한 시간 후 폐기합니다. */
function flushPendingEvents() {
  if (retryTimer !== undefined) {
    clearTimeout(retryTimer);
    retryTimer = undefined;
  }
  while (pendingEvents.length && pendingEvents[0].expiresAt <= Date.now()) {
    pendingEvents.shift();
  }
  if (typeof window.gtag === 'function') {
    for (const event of pendingEvents.splice(0)) {
      try {
        window.gtag('event', event.eventName, event.parameters);
      } catch {
        // 중복 전송을 막기 위해 실패 이벤트를 재시도하지 않습니다.
      }
    }
  } else if (pendingEvents.length) {
    retryTimer = setTimeout(flushPendingEvents, RETRY_INTERVAL_MS);
  }
}

/** lazyOnload 전에 발생한 이벤트를 메모리에만 잠시 보관하며 GA 설정·동의 상태는 변경하지 않습니다. */
export function trackAnalyticsEvent(eventName: AnalyticsEvent, parameters?: SafeEventParameters) {
  if (typeof window === 'undefined') return;

  if (pendingEvents.length >= MAX_PENDING_EVENTS) pendingEvents.shift();
  pendingEvents.push({
    eventName,
    parameters: parameters ? { ...parameters } : undefined,
    expiresAt: Date.now() + MAX_WAIT_MS,
  });
  flushPendingEvents();
}
