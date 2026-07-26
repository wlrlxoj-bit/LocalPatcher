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
      [UserRoundX, '1. Accounts and direct identifiers', 'LocalPatcher does not require general users to create an account or sign in, and does not store direct identifiers such as names, email addresses, or social account details in its own database.'],
      [EyeOff, '2. Local file processing', 'Trainer executables selected in the tool are processed in your browser. LocalPatcher is not designed to upload or store those files on its own servers.'],
      [Cookie, '3. Analytics, advertising, and cookies', 'We may use Google Analytics 4 to understand service usage and Google AdSense to display advertising.'],
      [Cpu, '4. Downloads and external links', 'File downloads do not require an external ad page, an advertising gate, or ad-block detection.'],
    ],
  },
  ja: {
    title: 'プライバシーポリシー',
    subtitle: 'ローカルファイル処理およびサービスデータの取扱い',
    updated: '最終更新日：2026年7月25日',
    notice: '本ページは現在のサービス運用を説明するものであり、特定の国または地域に対する法的助言ではありません。',
    sections: [
      [UserRoundX, '1. アカウントおよび直接識別情報', 'LocalPatcherは一般利用者にアカウント作成やログインを求めず、氏名、メールアドレスなどの直接識別情報を独自のデータベースに保存しません。'],
      [EyeOff, '2. ローカルファイル処理', 'ツールで選択したトレーナー実行ファイルは、利用者のブラウザ内で処理されます。サーバーへアップロードまたは保存する設計ではありません。'],
      [Cookie, '3. アクセス解析、広告、Cookie', 'サービス利用状況を把握するためGoogle Analytics 4を使用し、広告表示のためGoogle AdSenseを使用する場合があります。'],
      [Cpu, '4. ダウンロードと外部リンク', 'ファイルのダウンロードに外部広告ページ、広告ゲート、広告ブロック検出は必要ありません。'],
    ],
  },
  de: {
    title: 'Datenschutzbestimmungen',
    subtitle: 'Hinweise zur lokalen Dateiverarbeitung und Datennutzung',
    updated: 'Zuletzt aktualisiert: 25. Juli 2026',
    notice: 'Diese Seite beschreibt die aktuelle Funktionsweise des Dienstes.',
    sections: [
      [UserRoundX, '1. Konten und direkte Identifikatoren', 'LocalPatcher erfordert keine Registrierung. Es werden keine persönlichen Daten in eigenen Datenbanken gespeichert.'],
      [EyeOff, '2. Lokale Dateiverarbeitung', 'Ausgewählte Dateien werden lokal in Ihrem Browser verarbeitet und nicht auf Server hochgeladen.'],
      [Cookie, '3. Analysen, Werbung und Cookies', 'Wir nutzen Google Analytics 4 und Google AdSense zur Analyse und Werbeanzeige.'],
      [Cpu, '4. Downloads und externe Links', 'Downloads erfordern keine Werbenotifikationen. Es gelten die Datenschutzrichtlinien der verlinkten Zielseiten.'],
    ],
  },
  es: {
    title: 'Política de Privacidad',
    subtitle: 'Información sobre el procesamiento local de archivos y el uso de datos',
    updated: 'Última actualización: 25 de julio de 2026',
    notice: 'Esta página describe el funcionamiento actual del servicio.',
    sections: [
      [UserRoundX, '1. Cuentas e identificadores directos', 'LocalPatcher no requiere registro ni almacena datos personales en sus bases de datos.'],
      [EyeOff, '2. Procesamiento local de archivos', 'Los archivos seleccionados se procesan localmente en su navegador y no se suben a servidores.'],
      [Cookie, '3. Analítica, publicidad y cookies', 'Utilizamos Google Analytics 4 y Google AdSense para análisis y anuncios.'],
      [Cpu, '4. Descargas y enlaces externos', 'Las descargas no requieren bloqueos publicitarios. Se aplican las políticas del sitio de destino.'],
    ],
  },
};

export function getPrivacyContent(locale: Locale) {
  return privacyPageContent[locale] || privacyPageContent.en;
}

export const termsPageContent = {
  ko: {
    title: '서비스 이용 약관',
    subtitle: 'LocalPatcher 서비스 이용 조건 및 책임 한계 안내',
    updated: '최종 수정일: 2026년 7월 25일',
    warning: 'LocalPatcher는 게임 트레이너 파일의 텍스트 오프셋을 조작하여 언어를 변환하는 유틸리티 도구입니다. 변환된 파일의 실행 및 사용으로 인해 발생하는 게임 계정 제재, 세이브 파일 손상, 보안 문제에 대한 모든 책임은 사용자 본인에게 있습니다.',
    privacy: '서비스 이용 시 처리되는 데이터 정책은 개인정보 처리방침을 참조해 주세요.',
    sections: [
      [AlertOctagon, '1. 안티치트 및 오프라인 이용', '안티치트(EAC, BattlEye 등)가 적용된 온라인/멀티플레이 환경에서는 절대로 트레이너를 사용하지 마십시오. 오프라인 싱글플레이 게임에서만 이용할 것을 강력히 권장합니다.'],
      [HelpCircle, '2. 오진 및 보안 검사', '트레이너 파일은 메모리 조작 특성으로 인해 백신에서 오진(False Positive)으로 탐지될 수 있습니다. 실행 전 복수의 보안 스캐너로 무결성을 검증하세요.'],
      [Ban, '3. 면책 조항', '본 사이트는 원본 트레이너 파일이나 저작권물을 직접 저장·배포하지 않으며, 사용자가 제공한 파일의 로컬 변환 기능만을 제공합니다.'],
      [Lock, '4. 약관의 변경', '본 약관은 서비스 개선 및 관련 법령 준수를 위해 사전 공지 후 변경될 수 있습니다.'],
    ],
  },
  en: {
    title: 'Terms of Service',
    subtitle: 'LocalPatcher service conditions and limitations of liability',
    updated: 'Last updated: July 25, 2026',
    warning: 'LocalPatcher is a client-side utility tool. Users assume all responsibility for any game account bans, save file corruption, or security issues resulting from executing patched files.',
    privacy: 'Please review our Privacy Policy regarding data handling during service use.',
    sections: [
      [AlertOctagon, '1. Anti-cheat & Offline Use', 'Never use trainers in online or multiplayer games protected by anti-cheat systems. Use strictly in offline single-player modes.'],
      [HelpCircle, '2. False Positives & Scanning', 'Trainer executables often trigger antivirus false positives. Verify file integrity using multiple scanners before execution.'],
      [Ban, '3. Limitation of Liability', 'This site does not store or distribute copyrighted game trainers; it only provides local client-side text translation.'],
      [Lock, '4. Terms Modifications', 'These terms may be updated to reflect service improvements or compliance updates.'],
    ],
  },
  ja: {
    title: '利用規約',
    subtitle: 'LocalPatcher サービス利用条件および免責事項',
    updated: '最終更新日：2026年7月25日',
    warning: 'LocalPatcherはクライアントサイドのテキスト変換ツールです。パッチ適用ファイルの executable 実行に伴うアカウント制裁やセーブデータ破損の責任は利用者に帰属します。',
    privacy: 'データ処理方針についてはプライバシーポリシーをご確認ください。',
    sections: [
      [AlertOctagon, '1. アンチチートとオフライン利用', 'アンチチート保護のあるオンライン・マルチプレイ環境では絶対に使用せず、オフラインのシングルプレイのみでご利用ください。'],
      [HelpCircle, '2. 誤検出とセキュリティ確認', 'メモリ操作の性質上、セキュリティソフトで誤検出される場合があります。実行前に複数のスキャナーで確認してください。'],
      [Ban, '3. 免責事項', '本サイトは著作権物を直接保存・配布せず、ローカルでのテキスト変換機能のみを提供します。'],
      [Lock, '4. 規約の変更', '本規約はサービス改善や法令 준수를 ため予告なく変更される場合があります。'],
    ],
  },
  de: {
    title: 'Nutzungsbedingungen',
    subtitle: 'Nutzungsbedingungen und Haftungsausschluss für LocalPatcher',
    updated: 'Zuletzt aktualisiert: 25. Juli 2026',
    warning: 'LocalPatcher ist ein lokales Dienstprogramm. Die Verantwortung für die Nutzung gepatchter Dateien liegt beim Benutzer.',
    privacy: 'Informationen zur Datenverarbeitung finden Sie in unseren Datenschutzbestimmungen.',
    sections: [
      [AlertOctagon, '1. Anti-Cheat & Offline-Nutzung', 'Niemals in Online- oder Multiplayer-Spielen verwenden. Nur im Offline-Einzelspieler nutzen.'],
      [HelpCircle, '2. Fehlalarme & Sicherheitsüberprüfung', 'Trainer-Dateien können Antiviren-Fehlalarme auslösen. Vor der Ausführung stets prüfen.'],
      [Ban, '3. Haftungsausschluss', 'Diese Website speichert oder verbreitet keine urheberrechtlich geschützten Dateien.'],
      [Lock, '4. Änderungen der Bedingungen', 'Diese Bedingungen können bei Bedarf aktualisiert werden.'],
    ],
  },
  es: {
    title: 'Términos de Servicio',
    subtitle: 'Condiciones de uso y limitación de responsabilidad de LocalPatcher',
    updated: 'Última actualización: 25 de julio de 2026',
    warning: 'LocalPatcher es una herramienta de utilidad local. El usuario asume toda la responsabilidad por el uso de archivos parcheados.',
    privacy: 'Consulte nuestra Política de Privacidad para obtener información sobre el tratamiento de datos.',
    sections: [
      [AlertOctagon, '1. Anti-Cheat y Uso Offline', 'No utilice trainers en juegos en línea o multijugador. Utilícelos únicamente en modo individual sin conexión.'],
      [HelpCircle, '2. Falsos Positivos y Verificación', 'Los ejecutables pueden activar falsos positivos de antivirus. Verifique siempre antes de ejecutar.'],
      [Ban, '3. Limitación de Responsabilidad', 'Este sitio no almacena ni distribuye archivos protegidos por derechos de autor.'],
      [Lock, '4. Modificación de Términos', 'Estos términos pueden ser actualizados para reflejar mejoras en el servicio.'],
    ],
  },
};

export function getTermsContent(locale: Locale) {
  return termsPageContent[locale] || termsPageContent.en;
}

