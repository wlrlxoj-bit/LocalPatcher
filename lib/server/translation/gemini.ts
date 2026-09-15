import 'server-only';
import { createBatches, type TargetLanguage, type TranslationItem } from './types';
import { TranslationError } from './errors';

const MAX_ATTEMPTS = 3;

function readGeminiText(body: unknown) {
  if (!body || typeof body !== 'object') return null;
  const candidates = (body as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const content = candidates[0] && typeof candidates[0] === 'object'
    ? (candidates[0] as { content?: unknown }).content
    : null;
  const parts = content && typeof content === 'object'
    ? (content as { parts?: unknown }).parts
    : null;
  if (!Array.isArray(parts)) return null;
  const text = parts.map((part) => part && typeof part === 'object' ? (part as { text?: unknown }).text : null)
    .filter((value): value is string => typeof value === 'string')
    .join('');
  return text || null;
}

function parseTranslationObject(text: string) {
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function translateBatch(items: TranslationItem[], language: TargetLanguage) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new TranslationError('unavailable', 'Gemini 서버 환경 변수가 설정되지 않았습니다.');

  const model = process.env.GEMINI_TRANSLATION_MODEL?.trim() || 'gemini-2.5-flash';
  const url = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`);
  url.searchParams.set('key', key);
  const input = Object.fromEntries(items.map((item) => [item.key, item.text]));

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        signal: AbortSignal.timeout(30_000),
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: `Translate each value from English to BCP-47 target ${language}. Preserve every JSON key exactly. Return exactly one JSON object, with each key mapped to its translated string. Preserve hotkeys, line breaks, punctuation, numbers, placeholders, and game terminology where appropriate.` }],
          },
          contents: [{ role: 'user', parts: [{ text: JSON.stringify(input) }] }],
          generationConfig: { temperature: 0, responseMimeType: 'application/json' },
        }),
      });
    } catch (error) {
      if (attempt < MAX_ATTEMPTS - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
        continue;
      }
      throw new TranslationError('unavailable', `Gemini 네트워크 오류: ${error instanceof Error ? error.name : 'unknown'}`);
    }
    if (response.status === 403 || response.status === 429) {
      throw new TranslationError('quota', `Gemini 할당량 또는 권한 오류: HTTP ${response.status}`);
    }
    if (!response.ok) {
      if (response.status >= 500 && attempt < MAX_ATTEMPTS - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
        continue;
      }
      throw new TranslationError('unavailable', `Gemini 번역 오류: HTTP ${response.status}`);
    }
    const translatedByKey = parseTranslationObject(readGeminiText(await response.json()) || '');
    if (!translatedByKey) throw new TranslationError('unavailable', 'Gemini가 유효한 JSON 번역 결과를 반환하지 않았습니다.');
    return items.map((item) => {
      const translatedText = translatedByKey[item.key];
      if (typeof translatedText !== 'string' || (item.text.length > 0 && translatedText.trim().length === 0)) {
        throw new TranslationError('unavailable', `Gemini 응답 누락 또는 빈 번역: ${item.key}`);
      }
      return { ...item, translatedText };
    });
  }
  throw new TranslationError('unavailable', 'Gemini 요청에 실패했습니다.');
}

export async function translateWithGemini(items: TranslationItem[], language: TargetLanguage) {
  const output: Array<TranslationItem & { translatedText: string }> = [];
  for (const batch of createBatches(items)) output.push(...await translateBatch(batch, language));
  return output;
}
