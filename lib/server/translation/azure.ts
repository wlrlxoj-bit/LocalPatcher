import 'server-only';
import { createBatches, type TargetLanguage, type TranslationItem } from './types';
import { TranslationError } from './errors';

const MAX_ATTEMPTS = 3;

async function translateBatch(items: TranslationItem[], language: TargetLanguage) {
  const key = process.env.AZURE_TRANSLATOR_KEY;
  const region = process.env.AZURE_TRANSLATOR_REGION;
  const endpoint = (process.env.AZURE_TRANSLATOR_ENDPOINT?.trim() || 'https://api.cognitive.microsofttranslator.com').replace(/\/$/, '');
  if (!key || !region) throw new TranslationError('unavailable', 'Azure Translator 서버 환경 변수가 설정되지 않았습니다.');

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(`${endpoint}/translate?api-version=3.0&from=en&to=${language}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Ocp-Apim-Subscription-Key': key, 'Ocp-Apim-Subscription-Region': region },
        body: JSON.stringify(items.map((item) => ({ Text: item.text }))), cache: 'no-store', signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      if (attempt < MAX_ATTEMPTS - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
        continue;
      }
      throw new TranslationError('unavailable', `Azure Translator 네트워크 오류: ${error instanceof Error ? error.message : 'unknown'}`);
    }
    if (response.status === 403 || response.status === 429) throw new TranslationError('quota', `Azure Translator 할당량 또는 권한이 차단되었습니다: HTTP ${response.status}`);
    if (!response.ok) {
      if (response.status >= 500 && attempt < MAX_ATTEMPTS - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
        continue;
      }
      throw new TranslationError('unavailable', `Azure Translator 오류: HTTP ${response.status}`);
    }
    const body = await response.json() as Array<{ translations?: Array<{ text?: string }> }>;
    if (body.length !== items.length) throw new Error('Azure Translator 응답 항목 수가 일치하지 않습니다.');
    return items.map((item, index) => {
      const translatedText = body[index]?.translations?.[0]?.text;
      if (item.text.length > 0 && (!translatedText || translatedText.trim().length === 0)) throw new TranslationError('unavailable', `Azure Translator 빈 응답: ${item.key}`);
      return { ...item, translatedText: translatedText || '' };
    });
  }
  throw new TranslationError('unavailable', 'Azure Translator 요청에 실패했습니다.');
}

export async function translateWithAzure(items: TranslationItem[], language: TargetLanguage) {
  const output = [];
  for (const batch of createBatches(items)) output.push(...await translateBatch(batch, language));
  return output;
}
