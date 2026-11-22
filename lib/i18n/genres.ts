import type { Locale } from './types';

export const genreTranslations: Record<string, Record<string, string>> = {
  'Action': {
    ko: '액션',
    ja: 'アクション',
    de: 'Action',
    es: 'Acción',
  },
  'Adventure': {
    ko: '어드벤처',
    ja: 'アドベンチャー',
    de: 'Abenteuer',
    es: 'Aventura',
  },
  'RPG': {
    ko: 'RPG',
    ja: 'RPG',
    de: 'RPG',
    es: 'RPG',
  },
  'Casual': {
    ko: '캐주얼',
    ja: 'カジュアル',
    de: 'Casual',
    es: 'Casual',
  },
  'Simulation': {
    ko: '시뮬레이션',
    ja: 'シミュレーション',
    de: 'Simulation',
    es: 'Simulación',
  },
  'Strategy': {
    ko: '전략',
    ja: 'ストラテジー',
    de: 'Strategie',
    es: 'Estrategia',
  },
  'Sports': {
    ko: '스포츠',
    ja: 'スポーツ',
    de: 'Sport',
    es: 'Deportes',
  },
  'Racing': {
    ko: '레이싱',
    ja: 'レース',
    de: 'Rennspiele',
    es: 'Carreras',
  },
  'Massively Multiplayer': {
    ko: 'MMO',
    ja: 'MMO',
    de: 'MMO',
    es: 'MMO',
  },
  'Indie': {
    ko: '인디',
    ja: 'インディー',
    de: 'Indie',
    es: 'Indie',
  },
  'Early Access': {
    ko: '앞서 해보기',
    ja: '早期アクセス',
    de: 'Early Access',
    es: 'Acceso anticipado',
  },
  'Free to Play': {
    ko: '무료 플레이',
    ja: '基本プレイ無料',
    de: 'Kostenlos',
    es: 'Free to Play',
  },
};

export type GenreSlug =
  | 'action'
  | 'adventure'
  | 'rpg'
  | 'indie'
  | 'strategy'
  | 'simulation'
  | 'casual'
  | 'early-access'
  | 'racing'
  | 'sports';

export interface GenreHub {
  slug: GenreSlug;
  dbName: string;
  labels: Record<Locale, string>;
}

/** DB에서 활성 상태로 운영 중인 10개 표준 장르 허브 레지스트리입니다. */
export const GENRE_HUBS: readonly GenreHub[] = [
  {
    slug: 'action',
    dbName: 'Action',
    labels: { ko: '액션', ja: 'アクション', de: 'Action', es: 'Acción', en: 'Action' },
  },
  {
    slug: 'adventure',
    dbName: 'Adventure',
    labels: { ko: '어드벤처', ja: 'アドベンチャー', de: 'Abenteuer', es: 'Aventura', en: 'Adventure' },
  },
  {
    slug: 'rpg',
    dbName: 'RPG',
    labels: { ko: 'RPG', ja: 'RPG', de: 'RPG', es: 'RPG', en: 'RPG' },
  },
  {
    slug: 'indie',
    dbName: 'Indie',
    labels: { ko: '인디', ja: 'インディー', de: 'Indie', es: 'Indie', en: 'Indie' },
  },
  {
    slug: 'strategy',
    dbName: 'Strategy',
    labels: { ko: '전략', ja: 'ストラテジー', de: 'Strategie', es: 'Estrategia', en: 'Strategy' },
  },
  {
    slug: 'simulation',
    dbName: 'Simulation',
    labels: { ko: '시뮬레이션', ja: 'シミュレーション', de: 'Simulation', es: 'Simulación', en: 'Simulation' },
  },
  {
    slug: 'casual',
    dbName: 'Casual',
    labels: { ko: '캐주얼', ja: 'カジュアル', de: 'Casual', es: 'Casual', en: 'Casual' },
  },
  {
    slug: 'early-access',
    dbName: 'Early Access',
    labels: { ko: '앞서 해보기', ja: '早期アクセス', de: 'Early Access', es: 'Acceso anticipado', en: 'Early Access' },
  },
  {
    slug: 'racing',
    dbName: 'Racing',
    labels: { ko: '레이싱', ja: 'レース', de: 'Rennspiele', es: 'Carreras', en: 'Racing' },
  },
  {
    slug: 'sports',
    dbName: 'Sports',
    labels: { ko: '스포츠', ja: 'スポーツ', de: 'Sport', es: 'Deportes', en: 'Sports' },
  },
] as const;

const GENRE_HUB_BY_SLUG = new Map<string, GenreHub>(
  GENRE_HUBS.map((hub) => [hub.slug, hub]),
);

const GENRE_SLUG_BY_DB_NAME = new Map<string, GenreSlug>(
  GENRE_HUBS.map((hub) => [hub.dbName.toLowerCase(), hub.slug]),
);

/** URL 슬러그로 표준 장르 허브 정보를 조회합니다. */
export function getGenreHubBySlug(slug: string): GenreHub | undefined {
  if (!slug) return undefined;
  return GENRE_HUB_BY_SLUG.get(slug.trim().toLowerCase());
}

/** DB 장르명(예: 'Early Access')을 표준 장르 허브 슬러그('early-access')로 변환합니다. */
export function getGenreSlugByDbName(dbGenre: string): GenreSlug | undefined {
  if (!dbGenre) return undefined;
  return GENRE_SLUG_BY_DB_NAME.get(dbGenre.trim().toLowerCase());
}

/** 홈·장르 허브 내비게이션에 사용하는 로케일별 레이블입니다. */
export function getGenreNavLabel(locale: Locale): string {
  switch (locale) {
    case 'ko':
      return '장르별 트레이너 모음';
    case 'ja':
      return 'ジャンル別トレーナー一覧';
    case 'de':
      return 'Trainer nach Genre';
    case 'es':
      return 'Trainers por género';
    default:
      return 'Browse Trainers by Genre';
  }
}

export interface GenreHubSeoCopy {
  label: string;
  title: string;
  description: string;
  h1: string;
  intro: string;
  breadcrumbHome: string;
  navLabel: string;
  countBadge: (count: number) => string;
  emptyMessage: string;
  backToHome: string;
}

/** 장르 허브 페이지의 SEO 메타데이터·H1·소개 문구를 로케일에 맞게 생성합니다. */
export function getGenreHubSeoCopy(hub: GenreHub, locale: Locale): GenreHubSeoCopy {
  const label = hub.labels[locale] || hub.labels.en;

  switch (locale) {
    case 'ko':
      return {
        label,
        title: `${label} 게임 트레이너 한글 패치 모음 — LocalPatcher`,
        description: `인기 ${label} PC 게임 FLiNG 트레이너 한글화 패치 목록입니다. 브라우저 로컬 패치로 파일 업로드 없이 안전하게 한글 버전을 적용하세요.`,
        h1: `${label} 게임 트레이너 한글 패치`,
        intro: `승인된 ${label} 장르 FLiNG 트레이너의 한글화 패치를 한곳에서 확인하세요. 모든 패치는 브라우저 로컬 메모리에서 안전하게 처리됩니다.`,
        breadcrumbHome: '홈',
        navLabel: getGenreNavLabel(locale),
        countBadge: (count) => `총 ${count.toLocaleString('ko')}개 게임`,
        emptyMessage: `현재 승인된 ${label} 장르 트레이너가 없습니다.`,
        backToHome: '전체 게임 목록 보기',
      };
    case 'ja':
      return {
        label,
        title: `${label}ゲーム トレーナー日本語化パッチ一覧 — LocalPatcher`,
        description: `人気の${label} PCゲーム向けFLiNGトレーナー日本語化パッチ一覧。ブラウザ上のローカル処理で安全に日本語版へ変換できます。`,
        h1: `${label}ゲーム トレーナー日本語化パッチ`,
        intro: `承認済みの${label}ジャンルFLiNGトレーナー日本語化パッチをまとめて掲載しています。ファイルはサーバーに送信されずローカルで安全に処理されます。`,
        breadcrumbHome: 'ホーム',
        navLabel: getGenreNavLabel(locale),
        countBadge: (count) => `全${count.toLocaleString('ja')}タイトル`,
        emptyMessage: `現在、承認済みの${label}ジャンルトレーナーはありません。`,
        backToHome: 'すべてのゲームを見る',
      };
    case 'de':
      return {
        label,
        title: `${label} Spiele Trainer Deutsch Patch Sammlung — LocalPatcher`,
        description: `Geprüfte FLiNG Trainer Deutsch-Patches für ${label}-PC-Spiele. Sicher lokal im Browser ohne Datei-Upload patchen.`,
        h1: `${label} Spiele Trainer Deutsch Patch`,
        intro: `Entdecken Sie geprüfte deutsche Übersetzungen für FLiNG Trainer im Genre ${label}. Das Patchen erfolgt vollständig lokal und sicher in Ihrem Browser.`,
        breadcrumbHome: 'Startseite',
        navLabel: getGenreNavLabel(locale),
        countBadge: (count) => `${count.toLocaleString('de')} Spiele`,
        emptyMessage: `Derzeit sind keine freigegebenen Trainer im Genre ${label} verfügbar.`,
        backToHome: 'Alle Spiele anzeigen',
      };
    case 'es':
      return {
        label,
        title: `Trainers de Juegos de ${label} en Español — LocalPatcher`,
        description: `Colección de parches en español para trainers FLiNG de juegos de ${label} en PC. Aplica el parche localmente en tu navegador sin subir archivos.`,
        h1: `Trainers de Juegos de ${label} en Español`,
        intro: `Explora los trainers FLiNG verificados con traducción al español del género ${label}. Todo el proceso de parcheo se ejecuta de forma segura en tu navegador.`,
        breadcrumbHome: 'Inicio',
        navLabel: getGenreNavLabel(locale),
        countBadge: (count) => `${count.toLocaleString('es')} juegos`,
        emptyMessage: `Actualmente no hay trainers aprobados para el género ${label}.`,
        backToHome: 'Ver todos los juegos',
      };
    default:
      return {
        label,
        title: `${label} Game Trainers — LocalPatcher`,
        description: `Browse FLiNG game trainers in the ${label} genre with safe local browser localization patches.`,
        h1: `${label} Game Trainers`,
        intro: `Browse supported FLiNG trainers in the ${label} genre. All localization patches run safely inside your browser.`,
        breadcrumbHome: 'Home',
        navLabel: getGenreNavLabel('en'),
        countBadge: (count) => `${count.toLocaleString('en')} games`,
        emptyMessage: `No trainers are currently listed in the ${label} genre.`,
        backToHome: 'View all games',
      };
  }
}

/**
 * Translates a given genre or tag into the requested locale if a translation exists.
 * If no translation exists, returns the original English text.
 */
export function translateGenre(text: string, locale: string): string {
  if (!text) return '';
  const translations = genreTranslations[text];
  if (translations && translations[locale]) {
    return translations[locale];
  }
  return text;
}
