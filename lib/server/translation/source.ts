import 'server-only';
import { getTranslationAdminClient } from './db';
import { TranslationError } from './errors';
import { createMappingVersion, createSourceVersion } from './hash';
import type { TargetLanguage, TranslationItem, TranslationSourceSlot } from './types';

type MappingRow = {
  id: number; trainer_id: number; language_code: string; original_text: string; translated_text: string;
  offset_dec: number; encoding: string; max_char_len: number; is_approved: boolean; translation_status: string | null;
};

export async function loadTranslationSource(trainerId: number, targetLanguage: TargetLanguage) {
  if (!Number.isInteger(trainerId) || trainerId <= 0) throw new TranslationError('bad_input', 'trainerId가 올바르지 않습니다.');
  const client = getTranslationAdminClient();
  if (!client) throw new TranslationError('unavailable', '번역 DB가 설정되지 않았습니다.');
  const { data: mappings, error } = await client.from('translation_mappings').select('id,trainer_id,language_code,original_text,translated_text,offset_dec,encoding,max_char_len,is_approved,translation_status').eq('trainer_id', trainerId).order('id');
  if (error) throw new TranslationError('unavailable', '번역 원문을 조회하지 못했습니다.');
  const approved = (mappings || []).filter((row): row is MappingRow => row.is_approved && typeof row.original_text === 'string' && row.original_text.length > 0);
  if (!approved.length) throw new TranslationError('not_found', '승인된 원문 mapping이 없습니다.');
  const byOffset = new Map<number, MappingRow[]>();
  for (const row of approved) byOffset.set(row.offset_dec, [...(byOffset.get(row.offset_dec) || []), row]);
  const slots: TranslationSourceSlot[] = [];
  const targets: MappingRow[] = [];
  for (const [offsetDec, rows] of [...byOffset].sort(([left], [right]) => left - right)) {
    const signatures = new Set(rows.map((row) => JSON.stringify([row.original_text, row.encoding, row.max_char_len])));
    if (signatures.size !== 1) throw new TranslationError('conflict', `원문 슬롯 정보가 충돌합니다: ${offsetDec}`);
    const source = [...rows].sort((left, right) => left.id - right.id)[0];
    const targetRows = (mappings || []).filter((row) => row.language_code === targetLanguage && row.offset_dec === offsetDec);
    if (targetRows.length > 1) throw new TranslationError('conflict', `대상 언어 슬롯이 중복됩니다: ${offsetDec}`);
    const target = targetRows[0] as MappingRow | undefined;
    if (target) targets.push(target);
    slots.push({
      sourceMappingId: source.id,
      targetMappingId: target?.id ?? null,
      offsetDec,
      encoding: source.encoding,
      maxCharLen: source.max_char_len,
      originalText: source.original_text,
      sourceRowVersion: createMappingVersion(source),
      targetRowVersion: target ? createMappingVersion(target) : null,
      targetOriginalText: target?.original_text ?? null,
      targetTranslatedText: target?.translated_text ?? null,
      targetEncoding: target?.encoding ?? null,
      targetMaxCharLen: target?.max_char_len ?? null,
      targetApproved: target?.is_approved ?? null,
    });
  }
  const sourceVersion = createSourceVersion(slots);
  const items: TranslationItem[] = slots.flatMap((slot) => slot.originalText.split('\n').map((text, lineIndex) => ({
    key: `slot-${slot.offsetDec}-line-${lineIndex}`,
    text,
    sourceMappingId: slot.sourceMappingId,
    offsetDec: slot.offsetDec,
    lineIndex,
  })));
  return { client, trainerId, targetLanguage, sourceMappingId: slots[0].sourceMappingId, sourceMappingIds: slots.map((slot) => slot.sourceMappingId), sourceVersion, slots, targets, items };
}
