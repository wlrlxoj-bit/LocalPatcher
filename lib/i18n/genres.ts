export const genreTranslations: Record<string, Record<string, string>> = {
  'Action': {
    ko: '액션',
    ja: 'アクション',
    de: 'Aktion',
    es: 'Acción'
  },
  'Adventure': {
    ko: '어드벤처',
    ja: 'アドベンチャー',
    de: 'Abenteuer',
    es: 'Aventura'
  },
  'RPG': {
    ko: 'RPG',
    ja: 'RPG',
    de: 'RPG',
    es: 'RPG'
  },
  'Casual': {
    ko: '캐주얼',
    ja: 'カジュアル',
    de: 'Gelegenheitsspiele',
    es: 'Casual'
  },
  'Simulation': {
    ko: '시뮬레이션',
    ja: 'シミュレーション',
    de: 'Simulation',
    es: 'Simulación'
  },
  'Strategy': {
    ko: '전략',
    ja: 'ストラテジー',
    de: 'Strategie',
    es: 'Estrategia'
  },
  'Sports': {
    ko: '스포츠',
    ja: 'スポーツ',
    de: 'Sport',
    es: 'Deportes'
  },
  'Racing': {
    ko: '레이싱',
    ja: 'レース',
    de: 'Rennspiele',
    es: 'Carreras'
  },
  'Massively Multiplayer': {
    ko: 'MMO',
    ja: 'MMO',
    de: 'MMO',
    es: 'MMO'
  },
  'Indie': {
    ko: '인디',
    ja: 'インディー',
    de: 'Indie',
    es: 'Indie'
  },
  'Free to Play': {
    ko: '무료 플레이',
    ja: '基本プレイ無料',
    de: 'Kostenlos',
    es: 'Free to Play'
  }
};

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
