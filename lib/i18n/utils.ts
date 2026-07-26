import type { Locale } from './types';

export function getGameTitle(
  game: { title_en: string; title_ko?: string; title_ja?: string; title_de?: string; title_es?: string }, 
  locale: Locale
): string {
  if (locale === 'ko' && game.title_ko) return game.title_ko;
  if (locale === 'ja' && game.title_ja) return game.title_ja;
  if (locale === 'de' && game.title_de) return game.title_de;
  if (locale === 'es' && game.title_es) return game.title_es;
  return game.title_en;
}

export function getLocaleSuffix(locale: Locale): string {
  switch (locale) {
    case 'ko': return '_KOR';
    case 'ja': return '_JPN';
    case 'de': return '_DEU';
    case 'es': return '_ESP';
    default: return '_patched';
  }
}
