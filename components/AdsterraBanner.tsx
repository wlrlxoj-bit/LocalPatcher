'use client';

import { useEffect, useRef, useState } from 'react';
import type { Locale } from '@/lib/i18n/types';

const consentKey = 'localpatcher:adsterra-consent:v1';
/**
 * 제3자 광고의 전역 중단 스위치입니다. 설정이 없으면 항상 꺼진 상태로 시작합니다.
 * 공개 환경 변수로 번들에 포함되므로, 설정을 바꾼 뒤에는 새 배포가 필요합니다.
 */
export const adsterraEnabledByDefault = process.env.NEXT_PUBLIC_ADSTERRA_ENABLED === 'true';
const copy = {
  ko: { label: '광고', notice: '허용하면 Adsterra와 광고 파트너가 광고 제공·측정을 위해 쿠키, 기기 및 접속 정보를 처리할 수 있습니다. 허용하지 않아도 모든 도구를 사용할 수 있습니다.', allow: '이 세션에서 제3자 광고 허용', revoke: '광고 허용 철회', privacy: '개인정보처리방침' },
  en: { label: 'Advertisement', notice: 'If you allow ads, Adsterra and its partners may process cookies, device and access information for ad delivery and measurement. All tools remain available without allowing ads.', allow: 'Allow third-party ads for this session', revoke: 'Withdraw ad permission', privacy: 'Privacy policy' },
  ja: { label: '広告', notice: '許可すると、Adsterraと広告パートナーが広告配信・測定のためCookie、デバイス情報、アクセス情報を処理する場合があります。許可しなくてもすべてのツールを利用できます。', allow: 'このセッションで第三者広告を許可', revoke: '広告の許可を取り消す', privacy: 'プライバシーポリシー' },
  de: { label: 'Werbung', notice: 'Wenn Sie Werbung erlauben, können Adsterra und seine Partner Cookies, Geräte- und Zugriffsdaten für die Auslieferung und Messung von Werbung verarbeiten. Alle Werkzeuge sind auch ohne Erlaubnis nutzbar.', allow: 'Drittanbieterwerbung für diese Sitzung erlauben', revoke: 'Werbeerlaubnis widerrufen', privacy: 'Datenschutzbestimmungen' },
  es: { label: 'Publicidad', notice: 'Si permite anuncios, Adsterra y sus socios pueden tratar cookies y datos del dispositivo y de acceso para ofrecer y medir publicidad. Todas las herramientas están disponibles sin permitir anuncios.', allow: 'Permitir publicidad de terceros durante esta sesión', revoke: 'Retirar el permiso de publicidad', privacy: 'Política de privacidad' },
};

// 발급받은 300×250 배너 코드를 유지하며 iframe은 전역 변수와 레이아웃을 분리합니다.
// 보안 격리가 아니므로 제3자 광고 코드의 팝업·이동 동작 차단을 보장하지 않습니다.
const bannerDocument = `<!doctype html><html><head><meta name="viewport" content="width=300,initial-scale=1"><style>html,body{margin:0;padding:0;width:300px;height:250px;overflow:hidden}</style></head><body><script>atOptions={'key':'a5c2200df69026fe35b21b2a9ec505c1','format':'iframe','height':250,'width':300,'params':{}};</script><script src="https://www.highrevenueformat.com/a5c2200df69026fe35b21b2a9ec505c1/invoke.js"></script></body></html>`;

/** 명시적 세션 동의 후에만 외부 배너를 생성하고, 철회 시 문서를 제거합니다. */
export interface AdsterraBannerProps {
  locale: Locale;
  /** 서버가 전달하는 운영 중단 스위치입니다. 생략하면 공개 환경 변수만 사용합니다. */
  enabled?: boolean;
}

export default function AdsterraBanner({ locale, enabled = adsterraEnabledByDefault }: AdsterraBannerProps) {
  const t = copy[locale] || copy.en;
  const [allowed, setAllowed] = useState(false);
  const [scale, setScale] = useState(1);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try { setAllowed(sessionStorage.getItem(consentKey) === 'allowed'); } catch { /* 저장 차단 시 기본 비허용 유지 */ }
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const element = container.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      setScale(Math.min(1, Math.max(0, entry.contentRect.width / 300)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  function setPermission(value: boolean) {
    setAllowed(value);
    try {
      if (value) sessionStorage.setItem(consentKey, 'allowed');
      else sessionStorage.removeItem(consentKey);
    } catch { /* 저장 불가 환경에서도 현재 화면의 허용·철회는 작동합니다. */ }
  }

  // 중단 스위치가 꺼진 경우에는 동의 UI·iframe 모두 만들지 않아 외부 요청 경로가 없습니다.
  if (!enabled) return null;

  return <aside aria-label={t.label} className="mt-8 rounded-xl border border-slate-800 p-4 text-center">
    <p className="text-xs text-slate-500">{t.label}</p>
    <p className="mx-auto mt-2 max-w-xl text-xs leading-relaxed text-slate-400">{t.notice}</p>
    <a href={`/${locale}/privacy`} className="mt-2 inline-block text-xs text-cyan-400 underline">{t.privacy}</a>
    <div ref={container} className="mx-auto mt-3 w-full max-w-[300px] overflow-hidden">
      {allowed && <div style={{ height: 250 * scale }}>
        <iframe title={t.label} width="300" height="250" srcDoc={bannerDocument}
          style={{ border: 0, transform: `scale(${scale})`, transformOrigin: 'top left' }} />
      </div>}
    </div>
    <button type="button" onClick={() => setPermission(!allowed)}
      className="mt-3 max-w-full rounded-lg border border-slate-600 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-cyan-400">
      {allowed ? t.revoke : t.allow}
    </button>
  </aside>;
}
