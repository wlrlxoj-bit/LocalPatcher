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

export const supportPageContent = {
  ko: {
    title: 'LocalPatcher 운영 후원 안내',
    subtitle: '서버 업로드 없는 로컬 패치 플랫폼의 지속 가능한 가동을 응원해 주세요.',
    cardTitle: 'Patreon 정기 후원 (준비 중)',
    cardIntro: 'LocalPatcher는 회원가입이나 유료 결제 없이 무료로 이용할 수 있는 유틸리티 서비스입니다. 안정적인 서버 운영과 지속적인 신규 트레이너 데이터 업데이트를 지원하고자 하신다면 후원에 참여하실 수 있습니다.',
    pledgeText: '매월 커피 한 잔 분량의 작은 후원이 서버 인프라 유지와 최신 게임 대응 데이터베이스의 신속한 업데이트를 지속하는 가장 큰 원동력이 됩니다.',
    cta: 'Patreon 정기 후원하기',
    footerNote: '모든 후원금은 서버 유지비, 데이터베이스 용량 증설 및 스크래핑 효율화 개발에 투명하게 사용됩니다.',
    comingSoonText: '후원 서비스 준비 중 (Coming Soon)',
    costs: [
      [Database, '실시간 데이터베이스 유지', '게임 트레이너의 고유 해시값(SHA-256) 및 번역용 텍스트의 오프셋 위치 정보의 관리와 쿼리 처리.'],
      [Cpu, '자동 스크래퍼 가동', '최신 게임 출시 및 트레이너 버전 업데이트 정보를 상시 감지하고 시스템에 등록하는 엔진의 가동 비용.'],
      [FileCheck2, '글로벌 CDN 호스팅', '전 세계 이용자가 업로드 대기시간 없이 브라우저에서 즉시 변환 처리를 마칠 수 있는 초고속 에지 네트워크 인프라 구축.'],
    ],
  },
  en: {
    title: 'Support LocalPatcher',
    subtitle: 'Help keep our client-side trainer patch utility free and continuously updated.',
    cardTitle: 'Patreon Monthly Sponsorship (Coming Soon)',
    cardIntro: 'LocalPatcher is a free tool available without accounts or paid paywalls. If you would like to support server operations and continuous database updates for new games, you can contribute on Patreon.',
    pledgeText: 'A monthly pledge equal to a cup of coffee helps cover server infrastructure costs and enables rapid updates for new game titles.',
    cta: 'Sponsor on Patreon',
    footerNote: 'All contributions directly fund server costs, database capacity expansion, and scraping efficiency improvements.',
    comingSoonText: 'Sponsorship Under Preparation (Coming Soon)',
    costs: [
      [Database, 'Database Infrastructure', 'Managing SHA-256 binary signatures and text translation offset mappings for fast client query processing.'],
      [Cpu, 'Automated Scraping Pipeline', 'Operational costs for automated background engines detecting new game trainer build releases daily.'],
      [FileCheck2, 'Global Edge CDN Hosting', 'Fast edge infrastructure ensuring instant browser-based processing without queues or uploads.'],
    ],
  },
  ja: {
    title: 'LocalPatcher 運営支援のご案内',
    subtitle: 'ファイルをアップロードしないローカルパッチツールの継続的な運営を応援してください。',
    cardTitle: 'Patreon 定期支援 (準備中)',
    cardIntro: 'LocalPatcherは会員登録や有料決済を必要とせず、無料で利用できるツールです。安定したサーバー運営と継続的な最新データ更新を支援していただける場合は、Patreonからご支援いただけます。',
    pledgeText: '毎月コーヒー1杯分の小さなご支援が、サーバーインフラの維持、最新ゲームの対応リストの高速なアップデート活動を支える大きな原動力になります。',
    cta: 'Patreonで定期支援する',
    footerNote: 'すべての支援金は、サーバーの維持費、データベース容量増設、およびスクレイピング効率化の開発に透明性を持って充てられます。',
    comingSoonText: '支援サービス準備中 (Coming Soon)',
    costs: [
      [Database, 'リアルタイムデータベースの維持', 'ゲームトレーナーの固有ハッシュ値(SHA-256)およびローカライズ用テキストのオフセット配置情報の管理とクエリ処理。'],
      [Cpu, '自動スクレイパーの稼働', '最新ゲームのリリースとトレーナーのバージョンアップデート情報を常時監視し、システムに登録するエンジンの稼働費。'],
      [FileCheck2, 'グローバルCDNホスティング', '世界中のユーザーがアップロード待ち時間なしで、ブラウザ上で一瞬で変換処理を終えられる高速なエッジネットワークインフラの構築。'],
    ],
  },
  de: {
    title: 'LocalPatcher unterstützen',
    subtitle: 'Helfen Sie mit, unser lokales Patcher-Tool kostenlos und dauerhaft auf dem neuesten Stand zu halten.',
    cardTitle: 'Patreon Sponsoring (Demnächst)',
    cardIntro: 'LocalPatcher ist ein kostenloses Tool ohne Registrierung. Unterstützen Sie den Betrieb und die Aktualisierung der Datenbank auf Patreon.',
    pledgeText: 'Ein kleiner monatlicher Beitrag hilft, die Serverkosten zu decken und schnelle Updates für neue Spiele zu ermöglichen.',
    cta: 'Auf Patreon unterstützen',
    footerNote: 'Alle Beiträge fließen direkt in Serverkosten und die Erweiterung der Datenbank.',
    comingSoonText: 'Unterstützungsdienst wird vorbereitet (Demnächst)',
    costs: [
      [Database, 'Datenbank-Infrastruktur', 'Verwaltung von SHA-256 Signaturen und Übersetzungs-Offsets für schnelle Abfragen.'],
      [Cpu, 'Automatische Scraper-Engine', 'Betriebskosten für Hintergrund-Engines zur täglichen Erkennung neuer Trainer-Updates.'],
      [FileCheck2, 'Globales Edge CDN Hosting', 'Schnelle Edge-Infrastruktur für sofortige Browser-Verarbeitung ohne Uploads.'],
    ],
  },
  es: {
    title: 'Apoyar a LocalPatcher',
    subtitle: 'Ayude a mantener nuestra herramienta de parcheo gratuita y continuamente actualizada.',
    cardTitle: 'Patrocinio Mensual en Patreon (Próximamente)',
    cardIntro: 'LocalPatcher es una herramienta gratuita sin registros. Si desea apoyar las operaciones del servidor, puede contribuir en Patreon.',
    pledgeText: 'Una pequeña contribución mensual ayuda a cubrir los costos de infraestructura y permite actualizaciones rápidas.',
    cta: 'Patrocinar en Patreon',
    footerNote: 'Todas las contribuciones financian directamente los costos de servidor y ampliación de base de datos.',
    comingSoonText: 'Servicio de patrocinio en preparación (Próximamente)',
    costs: [
      [Database, 'Infraestructura de Base de Datos', 'Gestión de firmas SHA-256 y mapeos de texto para un procesamiento rápido.'],
      [Cpu, 'Pipeline de Scraper Automatizado', 'Costos operativos de motores en segundo plano que detectan nuevos lanzamientos.'],
      [FileCheck2, 'Alojamiento CDN Global Edge', 'Infraestructura rápida en el borde que garantiza un procesamiento instantáneo en el navegador.'],
    ],
  },
};

export function getSupportContent(locale: Locale) {
  return supportPageContent[locale] || supportPageContent.en;
}

