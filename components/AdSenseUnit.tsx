'use client';

import { useEffect, useRef } from 'react';
import type { Locale } from '@/lib/i18n';

declare global {
  interface Window {
    adsbygoogle?: Record<string, unknown>[];
  }
}

interface AdSenseUnitProps {
  locale: Locale;
  slot?: string;
}

const publisherId = process.env.NEXT_PUBLIC_ADSENSE_ID;
const validPublisherId = /^ca-pub-\d+$/.test(publisherId || '');
const consentReady = process.env.NEXT_PUBLIC_ADSENSE_CONSENT_READY === 'true';
const labels: Record<Locale, string> = {
  ko: '광고',
  en: 'Advertisement',
  ja: '広告',
};

/**
 * 환경변수가 유효할 때만 표시되는 비고정형 광고 단위입니다.
 * 광고 스크립트 오류는 로컬 패치 및 다운로드 동작과 분리해 처리합니다.
 */
export default function AdSenseUnit({ locale, slot }: AdSenseUnitProps) {
  const pushedRef = useRef(false);
  const validSlot = /^\d+$/.test(slot || '');

  useEffect(() => {
    if (!consentReady || !validPublisherId || !validSlot || pushedRef.current) return;

    pushedRef.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // 광고 실패가 패처 기능에 영향을 주지 않도록 의도적으로 무시합니다.
    }
  }, [validSlot]);

  if (!consentReady || !validPublisherId || !validSlot) return null;

  return (
    <aside
      className="my-6 w-full min-w-0 overflow-hidden text-center"
      aria-label={labels[locale]}
    >
      <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-600">
        {labels[locale]}
      </p>
      <ins
        className="adsbygoogle block min-h-[100px] w-full max-w-full sm:min-h-[120px]"
        style={{ display: 'block' }}
        data-ad-client={publisherId}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </aside>
  );
}
