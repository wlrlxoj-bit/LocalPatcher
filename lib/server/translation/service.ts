import 'server-only';
import { createPreviewHash } from './hash';
import { TranslationError } from './errors';
import { loadTranslationSource } from './source';
import { translateWithAzure } from './azure';
import { translateWithOpenAIPaid } from './openai-paid';
import { countUnicodeCharacters, createBatches, validateItems, type TargetLanguage, type TranslationProvider, type TranslationResult } from './types';
import { createHash } from 'node:crypto';

export async function createTranslationPreview(provider: TranslationProvider, trainerId: number, targetLanguage: TargetLanguage) {
  const source = await loadTranslationSource(trainerId, targetLanguage);
  const characters = validateItems(source.items);
  const previewHash = createPreviewHash(provider, targetLanguage, source.items);
  const { data: usage } = await source.client.from('translation_usage_monthly').select('used_characters,reserved_characters,hard_limit_characters').eq('provider', provider).eq('month_start', new Date().toISOString().slice(0, 7) + '-01').maybeSingle();
  const used = Number(usage?.used_characters || 0);
  const reserved = Number(usage?.reserved_characters || 0);
  const limit = Number(usage?.hard_limit_characters || (provider === 'azure' ? 2_000_000 : 0));
  const pendingSlots = source.targets.map((target) => ({ mappingId: target.id, offsetDec: target.offset_dec, translatedText: target.translated_text, status: target.translation_status, approved: target.is_approved }));
  return { previewHash, provider, trainerId, targetLanguage, sourceMappingId: source.sourceMappingId, sourceMappingIds: source.sourceMappingIds, sourceVersion: source.sourceVersion, sourceSlots: source.slots, itemCount: source.items.length, characters, batchCount: createBatches(source.items).length, quota: { used, reserved, limit, remaining: Math.max(0, limit - used - reserved), status: limit > used + reserved ? 'available' : 'exhausted' }, items: source.items, pending: pendingSlots[0] ?? null, pendingSlots };
}

export async function runTranslation(input: { provider: TranslationProvider; trainerId: number; targetLanguage: TargetLanguage; previewHash: string; paidConsent?: boolean; idempotencyKey: string }) {
  const preview = await createTranslationPreview(input.provider, input.trainerId, input.targetLanguage);
  if (preview.previewHash !== input.previewHash) throw new TranslationError('bad_input', '미리보기 해시가 일치하지 않습니다.');
  if (!input.idempotencyKey || input.idempotencyKey.length > 128) throw new TranslationError('bad_input', '멱등성 키가 올바르지 않습니다.');
  if (input.provider === 'openai_paid' && input.paidConsent !== true) throw new TranslationError('bad_input', 'OpenAI 유료 사용 동의가 필요합니다.');
  const source = await loadTranslationSource(input.trainerId, input.targetLanguage);
  if (createPreviewHash(input.provider, input.targetLanguage, source.items) !== input.previewHash) throw new TranslationError('conflict', '원문 슬롯이 미리보기 이후 변경되었습니다.');
  const { data: existing } = await source.client.from('translation_jobs').select('id,status,result,provider,target_language,preview_hash,trainer_id').eq('idempotency_key', input.idempotencyKey).maybeSingle();
  if (existing) {
    if (existing.provider !== input.provider || existing.target_language !== input.targetLanguage || existing.preview_hash !== input.previewHash || existing.trainer_id !== input.trainerId) throw new TranslationError('conflict', '멱등성 키의 작업 범위가 다릅니다.');
    if (existing.status === 'completed' || existing.status === 'approved') {
      if (!Array.isArray(existing.result)) throw new TranslationError('conflict', '완료 작업 결과가 손상되었습니다.');
      return { id: existing.id, status: existing.status, result: existing.result, idempotent: true };
    }
    if (existing.status === 'running') throw new TranslationError('conflict', '동일 작업이 진행 중입니다. 잠시 후 같은 키로 조회하세요.');
    throw new TranslationError('conflict', '실패한 작업은 새 idempotencyKey로 명시적으로 재시도해야 합니다.');
  }

  const texts = [...new Set(source.items.map((item) => item.text))];
  const hashes = texts.map((text) => createHash('sha256').update(text).digest('hex'));
  const memoryRows: Array<{ source_hash: string; source_text: string; translated_text: string }> = [];
  for (let offset = 0; offset < hashes.length; offset += 100) {
    const { data, error } = await source.client.from('translation_memory').select('source_hash,source_text,translated_text').eq('source_language', 'en').eq('target_language', input.targetLanguage).in('source_hash', hashes.slice(offset, offset + 100));
    if (error) throw new TranslationError('unavailable', '번역 메모리를 조회하지 못했습니다.');
    memoryRows.push(...(data || []));
  }
  const memory = new Map(memoryRows.filter((row) => createHash('sha256').update(row.source_text).digest('hex') === row.source_hash).map((row) => [row.source_text, row.translated_text]));
  const results: TranslationResult[] = [];
  const missing = source.items.filter((item) => {
    if (item.text.length === 0) {
      results.push({ ...item, translatedText: '', memoryHit: true });
      return false;
    }
    const translatedText = memory.get(item.text);
    if (translatedText) results.push({ ...item, translatedText, memoryHit: true });
    return !translatedText;
  });
  const billableCharacters = missing.reduce((sum, item) => sum + countUnicodeCharacters(item.text), 0);
  const { data: job, error: jobError } = await source.client.from('translation_jobs').insert({ provider: input.provider, target_language: input.targetLanguage, trainer_id: input.trainerId, source_mapping_id: source.sourceMappingId, source_snapshot: source.slots, source_version: source.sourceVersion, preview_hash: input.previewHash, idempotency_key: input.idempotencyKey, status: 'running', item_count: source.items.length, character_count: preview.characters, billable_character_count: billableCharacters }).select('id').single();
  if (jobError) throw new TranslationError('conflict', '동일 멱등성 작업이 이미 생성되었습니다.');
  let reservationId: string | null = null;
  let usageConsumed = false;
  try {
    if (billableCharacters > 0) {
      const { data: reservation, error } = await source.client.rpc('reserve_translation_usage', { p_provider: input.provider, p_characters: billableCharacters });
      if (error || typeof reservation !== 'string') throw new TranslationError('quota', '월간 번역 사용 한도를 초과했습니다.');
      reservationId = reservation;
    }
    const translated = missing.length ? (input.provider === 'azure' ? await translateWithAzure(missing, input.targetLanguage) : await translateWithOpenAIPaid(missing, input.targetLanguage)) : [];
    if (reservationId) {
      const { data: consumed, error: consumeError } = await source.client.rpc('finalize_translation_usage', { p_reservation_id: reservationId, p_consumed: true });
      if (consumeError || consumed !== true) throw new TranslationError('unavailable', '번역 사용량 확정에 실패했습니다.');
      usageConsumed = true;
    }
    results.push(...translated.map((item) => ({ ...item, memoryHit: false })));
    const resultByKey = new Map(results.map((result) => [result.key, result]));
    const ordered = source.items.map((item) => {
      const result = resultByKey.get(item.key);
      if (!result) throw new TranslationError('unavailable', `번역 결과 누락: ${item.key}`);
      return result;
    });
    const { error: completionError } = await source.client.from('translation_jobs').update({ status: 'completed', result: ordered, completed_at: new Date().toISOString() }).eq('id', job.id);
    if (completionError) throw new TranslationError('unavailable', '완료 작업을 저장하지 못했습니다.');
    return { id: job.id, status: 'completed', result: ordered, idempotent: false };
  } catch (error) {
    if (reservationId && !usageConsumed) {
      await source.client.rpc('finalize_translation_usage', { p_reservation_id: reservationId, p_consumed: false });
    }
    await source.client.from('translation_jobs').update({ status: 'failed', error_message: error instanceof Error ? error.message.slice(0, 1000) : 'unknown error' }).eq('id', job.id);
    throw error;
  }
}
