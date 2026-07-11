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
  | 'file_selected'
  | 'patch_completed';

type SafeEventParameters = {
  ad_gate?: 'opened' | 'blocked' | 'unavailable';
  adblock?: 'detected';
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
