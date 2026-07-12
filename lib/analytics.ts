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

export function trackAnalyticsEvent(eventName: AnalyticsEvent, parameters?: SafeEventParameters) {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;

  try {
    window.gtag('event', eventName, parameters);
  } catch {
    // 분석 도구 오류가 다운로드 및 번역 기능에 영향을 주지 않도록 무시합니다.
  }
}
