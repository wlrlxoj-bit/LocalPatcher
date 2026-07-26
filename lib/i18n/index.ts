export * from './types';
export * from './utils';

// Dictionaries
export * from './dictionaries/common';
export * from './dictionaries/games';
export * from './dictionaries/patcher';

import { commonDict } from './dictionaries/common';
import { gamesDict } from './dictionaries/games';
import { patcherDict } from './dictionaries/patcher';
import type { Locale } from './types';

export function getCommonDict(locale: Locale) {
  return commonDict[locale] || commonDict.en;
}

export function getGamesDict(locale: Locale) {
  return gamesDict[locale] || gamesDict.en;
}

export function getPatcherDict(locale: Locale) {
  return patcherDict[locale] || patcherDict.en;
}

// Pages
export * from './pages/faq';
export * from './pages/guides';
export * from './pages/about';
export * from './pages/editorial';
export * from './pages/contact';
export * from './pages/terms';
export * from './pages/privacy';
export * from './pages/support';
export * from './pages/layout';

