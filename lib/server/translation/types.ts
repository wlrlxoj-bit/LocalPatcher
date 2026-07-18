import 'server-only';

export type TranslationProvider = 'azure' | 'openai_paid';
export const SUPPORTED_TARGET_LANGUAGES = ['ko', 'ja', 'de', 'fr', 'es', 'pt', 'zh-Hans', 'zh-Hant'] as const;
export type TargetLanguage = typeof SUPPORTED_TARGET_LANGUAGES[number];
export type TranslationItem = {
  key: string;
  text: string;
  sourceMappingId: number;
  offsetDec: number;
  lineIndex: number;
};
export type TranslationResult = TranslationItem & { translatedText: string; memoryHit: boolean };

export type TranslationSourceSlot = {
  sourceMappingId: number;
  targetMappingId: number | null;
  offsetDec: number;
  encoding: string;
  maxCharLen: number;
  originalText: string;
  sourceRowVersion: string;
  targetRowVersion: string | null;
  targetOriginalText: string | null;
  targetTranslatedText: string | null;
  targetEncoding: string | null;
  targetMaxCharLen: number | null;
  targetApproved: boolean | null;
};

export const MAX_BATCH_ITEMS = 25;
export const MAX_BATCH_CHARACTERS = 5000;
export const MAX_JOB_ITEMS = 500;
export const MAX_JOB_CHARACTERS = 50_000;

export function isTargetLanguage(value: unknown): value is TargetLanguage {
  return typeof value === 'string' && SUPPORTED_TARGET_LANGUAGES.includes(value as TargetLanguage);
}

export function countUnicodeCharacters(value: string) {
  return Array.from(value).length;
}

export function validateItems(items: TranslationItem[]) {
  if (!items.length || items.length > MAX_JOB_ITEMS) throw new Error('번역 항목 수 제한을 초과했습니다.');
  const keys = new Set<string>();
  let characters = 0;
  for (const item of items) {
    if (!item.key || typeof item.text !== 'string' || keys.has(item.key)) throw new Error('번역 항목 키 또는 원문이 올바르지 않습니다.');
    keys.add(item.key);
    characters += countUnicodeCharacters(item.text);
  }
  if (characters > MAX_JOB_CHARACTERS) throw new Error('번역 글자 수 제한을 초과했습니다.');
  return characters;
}

export function createBatches(items: TranslationItem[]) {
  const batches: TranslationItem[][] = [];
  let batch: TranslationItem[] = [];
  let characters = 0;
  for (const item of items) {
    const itemCharacters = countUnicodeCharacters(item.text);
    if (itemCharacters > MAX_BATCH_CHARACTERS) throw new Error(`단일 항목이 ${MAX_BATCH_CHARACTERS}자를 초과했습니다.`);
    if (batch.length >= MAX_BATCH_ITEMS || characters + itemCharacters > MAX_BATCH_CHARACTERS) {
      batches.push(batch);
      batch = [];
      characters = 0;
    }
    batch.push(item);
    characters += itemCharacters;
  }
  if (batch.length) batches.push(batch);
  return batches;
}
