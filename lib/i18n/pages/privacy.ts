import { Locale } from '@/lib/i18n/types';
import { 
  AlertOctagon, Ban, HelpCircle, Lock, 
  UserRoundX, EyeOff, Cookie, Cpu, Database,
  FileText, ShieldCheck, ShieldAlert,
  Monitor, FileCheck2, ShieldOff,
  BadgeCheck, RefreshCw, Bot, Megaphone,
  FileWarning, Bug, AlertTriangle, ExternalLink,
  ArrowLeft
} from 'lucide-react';

export const privacyPageContent = {
  ko: {
    title: '개인정보처리방침',
    subtitle: '로컬 파일 처리와 서비스 운영을 위한 데이터 사용 안내',
    updated: '최종 수정일: 2026년 7월 25일',
    notice: '이 문서는 현재 서비스의 운영 방식을 설명하며, 특정 국가나 지역에 대한 법률 자문이 아닙니다.',
    sections: [
      [UserRoundX, '1. 계정 및 직접 식별정보', 'LocalPatcher는 일반 사용자에게 회원가입이나 로그인을 요구하지 않으며, 이름·이메일·소셜 계정 정보 같은 직접 식별정보를 자체 데이터베이스에 저장하지 않습니다. 다만 Google Analytics 4 및 Google AdSense가 쿠키, 기기 정보와 접속 정보를 처리할 수 있습니다.'],
      [EyeOff, '2. 로컬 파일 처리', '도구에서 선택한 트레이너 실행 파일은 사용자의 브라우저 안에서 처리됩니다. LocalPatcher는 해당 파일을 자체 서버에 업로드하거나 저장하도록 설계하지 않았습니다.'],
      [Cookie, '3. 분석, 광고 및 쿠키', '서비스 이용 현황을 이해하기 위해 Google Analytics 4를 사용할 수 있으며, 서비스 운영을 위해 Google AdSense 광고를 표시할 수 있습니다. Google과 그 광고 파트너는 쿠키 또는 유사 기술을 이용해 광고 제공, 빈도 제한, 측정 및 부정행위 방지를 수행할 수 있습니다.'],
      [Cpu, '4. 다운로드와 외부 링크', '파일 다운로드는 외부 광고 페이지, 광고 관문 또는 광고 차단 감지를 요구하지 않습니다. 게임 상점이나 원본 배포처로 이동하는 외부 또는 제휴 링크가 제공될 수 있습니다.'],
    ],
  },
  en: {
    title: 'Privacy Policy',
    subtitle: 'How local file processing and service data are handled',
    updated: 'Last updated: July 25, 2026',
    notice: 'This page describes the current operation of the service and is not legal advice for any particular jurisdiction.',
    sections: [
      [UserRoundX, '1. Accounts and direct identifiers', 'LocalPatcher does not require general users to create an account or sign in, and does not store direct identifiers such as names, email addresses, or social account details in its own database. However, Google Analytics 4 and Google AdSense may process cookies, device information, and access data.'],
      [EyeOff, '2. Local file processing', 'Trainer executables selected in the tool are processed locally in your browser. LocalPatcher is not designed to upload or store those files on its own servers.'],
      [Cookie, '3. Analytics, advertising, and cookies', 'We may use Google Analytics 4 to understand service usage and Google AdSense to display advertising. Google and its advertising partners may use cookies or similar technologies to serve ads, limit frequency, measure performance, and prevent fraud.'],
      [Cpu, '4. Downloads and external links', 'File downloads do not require an external ad page, an advertising gate, or ad-block detection. External or affiliate links to game stores or original distribution sources may be provided.'],
    ],
  },
  ja: {
    title: 'プライバシーポリシー',
    subtitle: 'ローカルファイル処理およびサービスデータの取扱い',
    updated: '最終更新日：2026年7月25日',
    notice: '本ページは現在のサービス運用を説明するものであり、特定の国または地域に対する法的助言ではありません。',
    sections: [
      [UserRoundX, '1. アカウントおよび直接識別情報', 'LocalPatcherは一般利用者にアカウント作成やログインを求めず、氏名、メールアドレスなどの直接識別情報を独自のデータベースに保存しません。ただし、Google Analytics 4およびGoogle AdSenseがCookie、デバイス情報、アクセス情報を処理する場合があります。'],
      [EyeOff, '2. ローカルファイル処理', 'ツールで選択したトレーナー実行ファイルは、利用者のブラウザ内でローカルに処理されます。該当ファイルを自社サーバーへアップロードまたは保存する設計ではありません。'],
      [Cookie, '3. アクセス解析、広告、Cookie', 'サービス利用状況を把握するためGoogle Analytics 4を使用し、サービス運営のためGoogle AdSense広告を表示する場合があります。Googleおよびその広告パートナーは、広告配信、頻度の制限、測定、不正行為の防止のためにCookieや類似技術を使用することがあります。'],
      [Cpu, '4. ダウンロードと外部リンク', 'ファイルのダウンロードに外部広告ページ、広告ゲート、広告ブロック検出は必要ありません。ゲームストアや元の配布元へ移動する外部リンクまたはアフィリエイトリンクが提供される場合があります。'],
    ],
  },
  de: {
    title: 'Datenschutzbestimmungen',
    subtitle: 'Hinweise zur lokalen Dateiverarbeitung und Datennutzung',
    updated: 'Zuletzt aktualisiert: 25. Juli 2026',
    notice: 'Diese Seite beschreibt die aktuelle Funktionsweise des Dienstes und stellt keine Rechtsberatung für eine bestimmte Gerichtsbarkeit dar.',
    sections: [
      [UserRoundX, '1. Konten und direkte Identifikatoren', 'LocalPatcher erfordert keine Registrierung oder Anmeldung von allgemeinen Benutzern und speichert keine direkten Identifikatoren wie Namen, E-Mail-Adressen oder Social-Media-Kontoinformationen in eigenen Datenbanken. Google Analytics 4 und Google AdSense können jedoch Cookies, Geräteinformationen und Zugriffsdaten verarbeiten.'],
      [EyeOff, '2. Lokale Dateiverarbeitung', 'Die im Tool ausgewählten Trainer-Ausführungsdateien werden in Ihrem Browser verarbeitet. LocalPatcher ist nicht dafür konzipiert, diese Dateien auf eigene Server hochzuladen oder dort zu speichern.'],
      [Cookie, '3. Analysen, Werbung und Cookies', 'Um die Nutzung unseres Dienstes zu verstehen, können wir Google Analytics 4 verwenden. Zur Finanzierung des Dienstes können Google AdSense-Anzeigen eingeblendet werden. Google und seine Werbepartner können Cookies oder ähnliche Technologien verwenden, um Anzeigen bereitzustellen, die Häufigkeit zu begrenzen, Messungen durchzuführen und Betrug zu verhindern.'],
      [Cpu, '4. Downloads und externe Links', 'Datei-Downloads erfordern keine externe Werbeseite, kein Werbegate und keine Ad-Blocker-Erkennung. Es können jedoch externe oder Affiliate-Links bereitgestellt werden, die zu Spiele-Shops oder ursprünglichen Download-Quellen führen.'],
    ],
  },
  es: {
    title: 'Política de Privacidad',
    subtitle: 'Información sobre el procesamiento local de archivos y el uso de datos',
    updated: 'Última actualización: 25 de julio de 2026',
    notice: 'Esta página describe el funcionamiento actual del servicio y no constituye asesoramiento legal para ninguna jurisdicción en particular.',
    sections: [
      [UserRoundX, '1. Cuentas e identificadores directos', 'LocalPatcher no requiere que los usuarios generales se registren o inicien sesión, y no almacena identificadores directos como nombres, correos electrónicos o detalles de cuentas sociales en sus propias bases de datos. Sin embargo, Google Analytics 4 y Google AdSense pueden procesar cookies, información del dispositivo y datos de acceso.'],
      [EyeOff, '2. Procesamiento local de archivos', 'Los archivos ejecutables trainer seleccionados en la herramienta se procesan en su navegador. LocalPatcher no está diseñado para cargar ni almacenar dichos archivos en sus propios servidores.'],
      [Cookie, '3. Analítica, publicidad y cookies', 'Para comprender el uso del servicio, podemos usar Google Analytics 4, y para respaldar las operaciones, podemos mostrar anuncios de Google AdSense. Google y sus socios publicitarios pueden usar cookies o tecnologías similares para publicar anuncios, limitar la frecuencia, medir el rendimiento y prevenir fraudes.'],
      [Cpu, '4. Descargas y enlaces externos', 'Las descargas de archivos no requieren una página de publicidad externa, una puerta publicitaria ni detección de bloqueo de anuncios. No obstante, se pueden proporcionar enlaces externos o de afiliados que dirijan a tiendas de juegos o fuentes de distribución originales.'],
    ],
  },
};

export function getPrivacyContent(locale: Locale) {
  return privacyPageContent[locale] || privacyPageContent.en;
}
