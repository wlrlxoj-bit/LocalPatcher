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
    warning: 'LocalPatcher is a client-side utility tool that translates languages by manipulating text offsets in game trainer files. Users assume all responsibility for any game account bans, save file corruption, or security issues resulting from executing and using patched files.',
    privacy: 'Please review our Privacy Policy regarding data handling during service use.',
    sections: [
      [AlertOctagon, '1. Anti-cheat & Offline Use', 'Never use trainers in online or multiplayer games protected by anti-cheat systems (e.g., EAC, BattlEye). We strongly recommend using them strictly in offline single-player modes.'],
      [HelpCircle, '2. False Positives & Scanning', 'Trainer executables often trigger antivirus false positives due to their memory manipulation characteristics. Verify file integrity using multiple security scanners before execution.'],
      [Ban, '3. Limitation of Liability', 'This site does not directly store or distribute original trainer files or copyrighted material; it only provides a local client-side translation feature for files provided by the user.'],
      [Lock, '4. Terms Modifications', 'These terms may be updated after prior notice to reflect service improvements or compliance with relevant laws.'],
    ],
  },
  ja: {
    title: '利用規約',
    subtitle: 'LocalPatcher サービス利用条件および免責事項',
    updated: '最終更新日：2026年7月25日',
    warning: 'LocalPatcherはゲームトレーナーファイルのテキストオフセットを操作して言語を変換するユーティリティツールです。変換されたファイルの実行および使用により発生するゲームアカウントの制裁、セーブデータの破損、セキュリティ問題に対するすべての責任はユーザー自身にあります。',
    privacy: 'サービス利用時に処理されるデータポリシーについては、プライバシーポリシーをご参照ください。',
    sections: [
      [AlertOctagon, '1. アンチチートとオフライン利用', 'アンチチート（EAC、BattlEyeなど）が適用されたオンライン・マルチプレイ環境では絶対にトレーナーを使用しないでください。オフラインのシングルプレイゲームでのみ使用することを強くお勧めします。'],
      [HelpCircle, '2. 誤検出とセキュリティ検査', 'トレーナーファイルはメモリ操作の特性上、セキュリティソフトから誤検出（False Positive）される場合があります。実行前に複数のセキュリティスキャナーで整合性を検証してください。'],
      [Ban, '3. 免責事項', '本サイトは元のトレーナーファイルや著作物を直接保存・配布せず、ユーザーが提供したファイルのローカル変換機能のみを提供します。'],
      [Lock, '4. 規約の変更', '本規約は、サービスの改善や関連法令の遵守のため、事前の通知後に変更される場合があります。'],
    ],
  },
  de: {
    title: 'Nutzungsbedingungen',
    subtitle: 'Nutzungsbedingungen und Haftungsausschluss für den LocalPatcher-Dienst',
    updated: 'Zuletzt aktualisiert: 25. Juli 2026',
    warning: 'LocalPatcher ist ein lokales Dienstprogramm, das Texte in Spiel-Trainer-Dateien durch Manipulation von Text-Offsets übersetzt. Der Benutzer übernimmt die volle Verantwortung für Kontensperrungen, beschädigte Spielstände oder Sicherheitsprobleme, die durch die Ausführung gepatchter Dateien entstehen.',
    privacy: 'Bitte lesen Sie unsere Datenschutzbestimmungen bezüglich der Datenverarbeitung bei der Nutzung unseres Dienstes.',
    sections: [
      [AlertOctagon, '1. Anti-Cheat & Offline-Nutzung', 'Verwenden Sie niemals Trainer in Online- oder Multiplayer-Umgebungen, die durch Anti-Cheat-Systeme (wie EAC, BattlEye usw.) geschützt sind. Wir empfehlen dringend, diese nur in Offline-Einzelspieler-Spielen zu verwenden.'],
      [HelpCircle, '2. Fehlalarme & Sicherheitsüberprüfung', 'Trainer-Dateien können aufgrund ihrer Speicherzugriffsfunktionen von Antivirenprogrammen als Fehlalarm (False Positive) erkannt werden. Überprüfen Sie die Datei vor der Ausführung mit mehreren Sicherheitsscannern.'],
      [Ban, '3. Haftungsausschluss', 'Diese Website speichert oder verbreitet keine urheberrechtlich geschützten Trainer-Dateien direkt. Sie bietet lediglich eine lokale Übersetzungsfunktion für Dateien, die der Benutzer bereitstellt.'],
      [Lock, '4. Änderungen der Bedingungen', 'Diese Bedingungen können nach vorheriger Ankündigung aktualisiert werden, um Serviceverbesserungen oder die Einhaltung gesetzlicher Vorschriften zu berücksichtigen.'],
    ],
  },
  es: {
    title: 'Términos de Servicio',
    subtitle: 'Condiciones de uso y limitación de responsabilidad del servicio LocalPatcher',
    updated: 'Última actualización: 25 de julio de 2026',
    warning: 'LocalPatcher es una herramienta de utilidad local que traduce textos en archivos trainer de juegos mediante la manipulación de compensaciones de texto. El usuario asume toda la responsabilidad por las prohibiciones de cuentas, la corrupción de partidas guardadas o los problemas de seguridad resultantes de la ejecución de archivos parcheados.',
    privacy: 'Consulte nuestra Política de Privacidad para obtener información sobre el tratamiento de datos durante el uso del servicio.',
    sections: [
      [AlertOctagon, '1. Anti-Cheat y Uso Offline', 'Nunca utilice trainers en entornos en línea o multijugador protegidos por sistemas anti-trampas (como EAC, BattlEye, etc.). Recomendamos encarecidamente usarlos solo en juegos individuales sin conexión.'],
      [HelpCircle, '2. Falsos Positivos y Verificación', 'Los archivos trainer pueden ser detectados como Falsos Positivos por los antivirus debido a sus capacidades de modificación de memoria. Verifique la integridad del archivo con múltiples escáneres de seguridad antes de ejecutarlo.'],
      [Ban, '3. Limitación de Responsabilidad', 'Este sitio no almacena ni distribuye directamente archivos trainer ni material protegido por derechos de autor, solo proporciona una función de traducción local para los archivos proporcionados por el usuario.'],
      [Lock, '4. Modificación de Términos', 'Estos términos pueden actualizarse previo aviso para reflejar mejoras en el servicio o actualizaciones de cumplimiento normativo.'],
    ],
  },
};

export function getTermsContent(locale: Locale) {
  return termsPageContent[locale] || termsPageContent.en;
}
