import { createHash } from 'node:crypto';
import type { TargetLanguage, TranslationItem, TranslationProvider, TranslationSourceSlot } from './types';

export function createMappingVersion(mapping: { id: number; original_text: string; translated_text?: string | null; offset_dec: number; encoding: string; max_char_len: number; is_approved: boolean }) {
  return createHash('sha256').update(JSON.stringify({
    id: mapping.id,
    originalText: mapping.original_text,
    translatedText: mapping.translated_text ?? null,
    offsetDec: mapping.offset_dec,
    encoding: mapping.encoding,
    maxCharLen: mapping.max_char_len,
    approved: mapping.is_approved,
  })).digest('hex');
}

export function createSourceVersion(slots: TranslationSourceSlot[]) {
  const snapshot = slots.map((slot) => ({
    sourceMappingId: slot.sourceMappingId,
    targetMappingId: slot.targetMappingId,
    offsetDec: slot.offsetDec,
    encoding: slot.encoding,
    maxCharLen: slot.maxCharLen,
    sourceRowVersion: slot.sourceRowVersion,
    targetRowVersion: slot.targetRowVersion,
    targetOriginalText: slot.targetOriginalText,
    targetTranslatedText: slot.targetTranslatedText,
    targetEncoding: slot.targetEncoding,
    targetMaxCharLen: slot.targetMaxCharLen,
    targetApproved: slot.targetApproved,
  }));
  return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
}

export function createPreviewHash(provider: TranslationProvider, language: TargetLanguage, items: TranslationItem[]) {
  return createHash('sha256').update(JSON.stringify({ provider, language, items })).digest('hex');
}
