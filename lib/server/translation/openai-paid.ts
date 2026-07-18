import 'server-only';
import { createBatches, type TargetLanguage, type TranslationItem } from './types';
import { TranslationError } from './errors';

export async function translateWithOpenAIPaid(items: TranslationItem[], language: TargetLanguage) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new TranslationError('unavailable', 'OpenAI 서버 환경 변수가 설정되지 않았습니다.');
  const output: Array<TranslationItem & { translatedText: string }> = [];
  for (const batch of createBatches(items)) {
    const input = Object.fromEntries(batch.map((item) => [item.key, item.text]));
    let response: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, cache: 'no-store',
          body: JSON.stringify({ model: process.env.OPENAI_TRANSLATION_MODEL || 'gpt-4.1-mini', temperature: 0, response_format: { type: 'json_object' }, messages: [
            { role: 'system', content: `Translate values from English to BCP-47 target ${language}. Preserve keys and return one JSON object only.` },
            { role: 'user', content: JSON.stringify(input) },
          ] }), signal: AbortSignal.timeout(30_000),
        });
      } catch (error) {
        if (attempt === 2) throw new TranslationError('unavailable', `OpenAI 네트워크 오류: ${error instanceof Error ? error.message : 'unknown'}`);
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
        continue;
      }
      if (response.status === 403 || response.status === 429) throw new TranslationError('quota', `OpenAI 유료 번역 할당량 오류: HTTP ${response.status}`);
      if (response.status >= 500 && attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
        continue;
      }
      break;
    }
    if (!response) throw new TranslationError('unavailable', 'OpenAI 응답이 없습니다.');
    if (!response.ok) throw new TranslationError('unavailable', `OpenAI 유료 번역 오류: HTTP ${response.status}`);
    const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const parsed = JSON.parse(body.choices?.[0]?.message?.content || '{}') as Record<string, unknown>;
    for (const item of batch) {
      const translatedText = parsed[item.key];
      if (typeof translatedText !== 'string' || (item.text.length > 0 && translatedText.trim().length === 0)) throw new TranslationError('unavailable', `OpenAI 응답 누락 또는 빈 번역: ${item.key}`);
      output.push({ ...item, translatedText });
    }
  }
  return output;
}
