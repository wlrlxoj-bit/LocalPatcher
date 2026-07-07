/**
 * repair-translations.ts
 *
 * 누락되었거나 비정상적인 게임 트레이너 번역(한국어/일본어) 자동 복구 및 AI 재번역 스크립트
 * ──────────────────────────────────────────────────────────────────────────
 * - Supabase 데이터베이스의 `trainers` 및 `translation_mappings` 조회
 * - 한국어(ko) 또는 일본어(ja) 번역이 없거나 영어로 유출된(bad translation) 항목 탐지
 * - OpenAI API (gpt-4.1-mini)를 사용하여 높은 품질의 일본어/한국어 번역 복구
 * - 과다 사용 방지를 위해 1회 실행당 최대 30개의 트레이너 버전만 복구 처리
 *
 * @requires NEXT_PUBLIC_SUPABASE_URL - Supabase URL
 * @requires SUPABASE_SERVICE_ROLE_KEY - Supabase Service Role Key (RLS 우회용)
 * @requires OPENAI_API_KEY - OpenAI API Key
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// ─────────────────────────────────────────────
// 환경 변수 로컬 주입 (.env.local 파일 파싱)
// ─────────────────────────────────────────────
function loadEnvLocal(): void {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)$/);
      if (match) {
        const key = match[1].trim();
        let val = match[2].trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.substring(1, val.length - 1);
        }
        process.env[key] = val;
      }
    }
  }
}

loadEnvLocal();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// ─────────────────────────────────────────────
// 헬퍼 및 인터페이스 정의
// ─────────────────────────────────────────────
interface TrainerRow {
  id: number;
  game_id: number;
  version_str: string;
}

interface MappingRow {
  id: number;
  trainer_id: number;
  language_code: string;
  original_text: string;
  translated_text: string;
  offset_dec: number;
  encoding: string;
  max_char_len: number;
}

async function delay(ms: number = 1000): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 번역 품질 검사 함수
 * - 텍스트가 비었거나 원본과 동일한 경우, 혹은 타겟 언어 문자(한글/일어)가 전혀 없다면 불량 번역으로 간주
 */
function isBadTranslation(translated: string, lang: string, original: string): boolean {
  if (!translated || translated.trim() === '') return true;
  if (translated.trim() === original.trim()) return true;

  if (lang === 'ko') {
    // 한글 유니코드 범위 포함 검사
    return !/[\uac00-\ud7a3]/.test(translated);
  }
  if (lang === 'ja') {
    // 히라가나, 가타카나, CJK 통합 한자 포함 검사
    return !/[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/.test(translated);
  }
  return false;
}

/**
 * 라인 길이 싱크 조정 함수 (Space Padding / Truncation)
 * - 번역 데이터 주입 시 버퍼 오버플로우 방지 및 바이너리 크기 매칭 목적
 */
function adjustLineLength(translated: string, original: string): string {
  const origLen = original.length;
  if (translated.length < origLen) {
    return translated + ' '.repeat(origLen - translated.length);
  } else if (translated.length > origLen) {
    return translated.substring(0, origLen);
  }
  return translated;
}

// ─────────────────────────────────────────────
// 실패 사례 CSV 로깅 헬퍼 함수
// ─────────────────────────────────────────────
function logFailureToCSV(trainerId: number, gameId: number, versionStr: string, errMsg: string): void {
  const csvPath = path.resolve(process.cwd(), 'failed_repaired_trainers.csv');
  const safeVersion = versionStr.replace(/"/g, '""');
  const safeMsg = errMsg.replace(/"/g, '""').replace(/\r?\n/g, ' ');
  const timestamp = new Date().toISOString();
  const row = `${trainerId},${gameId},"${safeVersion}","${safeMsg}",${timestamp}\n`;
  fs.appendFileSync(csvPath, row, 'utf-8');
}

// ─────────────────────────────────────────────
// OpenAI API 호출 번역 로직
// ─────────────────────────────────────────────
async function translateViaOpenAI(
  linesToTranslate: string[], 
  lang: string, 
  temperature: number = 0.7, 
  extraPrompt: string = ''
): Promise<string[]> {
  if (!OPENAI_API_KEY) {
    throw new Error('❌ OpenAI API Key가 설정되지 않았습니다.');
  }

  const targetLangName = lang === 'ko' ? 'Korean' : 'Japanese';
  const exampleTranslation = lang === 'ko' ? '무한 체력' : '体力無限';
  
  const prompt = `
You are a professional game localization expert.
Translate the following list of game trainer cheat options into natural, standard ${targetLangName} used by gamers.

CRITICAL RULES:
1. KEEP the exact hotkey prefix (e.g. "Num 1 -", "Ctrl+Num 1 -", "Alt+Num 1 -") unchanged.
2. Translate only the description label and any note texts (e.g. Translate "Infinite HP" to "${exampleTranslation}").
3. Return your output strictly as a JSON object with a single key "translations" containing an array of translated strings in the EXACT same order.

List to translate:
${JSON.stringify(linesToTranslate)}
${extraPrompt}`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4.1-mini',
      messages: [
        { role: 'system', content: 'You are a helpful game localization assistant.' },
        { role: 'user', content: prompt },
      ],
      temperature: temperature,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(60000), // 60초 타임아웃
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API 응답 에러 (HTTP ${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const translations: string[] = JSON.parse(data.choices[0].message.content).translations;
  return translations;
}

// ─────────────────────────────────────────────
// 메인 실행 함수
// ─────────────────────────────────────────────
async function main(): Promise<void> {
  console.log('🚀 번역 데이터 복구 스크립트 실행 시작');
  console.log(`📅 실행 시각: ${new Date().toISOString()}`);

  // CSV 파일 초기화
  const csvPath = path.resolve(process.cwd(), 'failed_repaired_trainers.csv');
  fs.writeFileSync(csvPath, 'Trainer ID,Game ID,Version String,Error Message,Timestamp\n', 'utf-8');

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ 에러: Supabase 환경 변수가 설정되지 않았습니다.');
    process.exit(1);
  }

  const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  // 1. 전체 trainers 조회 (1000개 PostgREST limit 우회용 청크 루프)
  console.log('[*] trainers 테이블 조회 중...');
  let trainers: TrainerRow[] = [];
  let offset = 0;
  const limit = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data: chunk, error: trainersError } = await supabase
      .from('trainers')
      .select('id, game_id, version_str')
      .order('id', { ascending: true })
      .range(offset, offset + limit - 1);

    if (trainersError || !chunk) {
      console.error(`❌ trainers 조회 실패: ${trainersError?.message}`);
      process.exit(1);
    }

    trainers = trainers.concat(chunk);
    if (chunk.length < limit) {
      hasMore = false;
    } else {
      offset += limit;
    }
  }
  console.log(`[+] 총 ${trainers.length}개의 트레이너 버전 발견`);

  let repairedCount = 0;

  for (const trainer of trainers) {

    // 2. 해당 trainer의 모든 mapping 조회
    const { data: mappings, error: mappingsError } = await supabase
      .from('translation_mappings')
      .select('*')
      .eq('trainer_id', trainer.id);

    if (mappingsError || !mappings) {
      console.error(`[-] Mappings 조회 실패 (Trainer ID: ${trainer.id}): ${mappingsError?.message}`);
      continue;
    }

    const koMappings = mappings.filter((m) => m.language_code === 'ko');
    const jaMappings = mappings.filter((m) => m.language_code === 'ja');

    // 대표 원본 텍스트 및 오프셋 정보 확보
    const templateMapping = mappings[0] as MappingRow | undefined;
    if (!templateMapping) {
      // 아예 맵핑 데이터가 전무한 특이 케이스는 자동 복구 불가
      continue;
    }

    const originalText = templateMapping.original_text;
    const offsetDec = templateMapping.offset_dec;
    const encoding = templateMapping.encoding;
    const maxCharLen = templateMapping.max_char_len;

    // 복구 여부 판정
    const koNeedRepair = koMappings.length === 0 || koMappings.some((m) => isBadTranslation(m.translated_text, 'ko', originalText));
    const jaNeedRepair = jaMappings.length === 0 || jaMappings.some((m) => isBadTranslation(m.translated_text, 'ja', originalText));

    if (!koNeedRepair && !jaNeedRepair) {
      continue;
    }

    console.log(`\n🔍 복구 대상 발견: Trainer ID ${trainer.id} (${trainer.version_str})`);
    if (koNeedRepair) console.log('   - 한국어(ko) 번역 유실/불량 감지');
    if (jaNeedRepair) console.log('   - 일본어(ja) 번역 유실/불량 감지');

    try {
      const originalLines = originalText.split('\n');

      // 복구할 언어들에 대해 개별 번역 실행
      const languagesToRepair = [];
      if (koNeedRepair) languagesToRepair.push('ko');
      if (jaNeedRepair) languagesToRepair.push('ja');

      for (const lang of languagesToRepair) {
        let translatedArray: string[] = [];
        let success = false;
        let attempts = 4; // 총 4번 시도 (최초 시도 1회 + 재시도 최대 3회)
        let lastErrorMsg = '';

        for (let attempt = 1; attempt <= attempts; attempt++) {
          try {
            if (attempt === 1) {
              console.log(`   [*] OpenAI를 통한 ${lang} 번역 수행 중... (시도 ${attempt}/${attempts})`);
              translatedArray = await translateViaOpenAI(originalLines, lang, 0.7, '');
            } else {
              console.log(`   [⚠️] ${lang} 번역 재시도 중... (시도 ${attempt}/${attempts})`);
              const extraPrompt = `\n\nIMPORTANT: Your previous output had a mismatch in lines. The input has exactly ${originalLines.length} elements. You MUST return exactly ${originalLines.length} translation strings.`;
              translatedArray = await translateViaOpenAI(originalLines, lang, 0.1, extraPrompt);
            }

            if (translatedArray.length !== originalLines.length) {
              throw new Error(`번역 라인 개수 불일치 (원문: ${originalLines.length}, 번역본: ${translatedArray.length})`);
            }

            success = true;
            break;
          } catch (err) {
            lastErrorMsg = (err as Error).message;
            console.log(`   [-] ${lang} 번역 시도 ${attempt} 실패: ${lastErrorMsg}`);
            if (attempt < attempts) {
              await delay(1000); // 시도 사이 1초 딜레이
            }
          }
        }

        if (!success) {
          console.error(`   ❌ ${lang} 모든 번역 시도 실패. 이 트레이너를 건너뜁니다. 최종 오류: ${lastErrorMsg}`);
          logFailureToCSV(trainer.id, trainer.game_id, trainer.version_str, `${lang} translation failed: ${lastErrorMsg}`);
          continue;
        }

        // 라인 길이 동기화 처리
        const adjustedLines = originalLines.map((origLine, idx) => {
          return adjustLineLength(translatedArray[idx], origLine);
        });
        const finalTranslatedText = adjustedLines.join('\n');

        // 기존 불량 맵핑 삭제
        await supabase
          .from('translation_mappings')
          .delete()
          .eq('trainer_id', trainer.id)
          .eq('language_code', lang);

        // 신규 매핑 삽입
        const { error: insertError } = await supabase
          .from('translation_mappings')
          .insert({
            trainer_id: trainer.id,
            language_code: lang,
            original_text: originalText,
            translated_text: finalTranslatedText,
            offset_dec: offsetDec,
            encoding: encoding,
            max_char_len: maxCharLen,
            is_approved: true,
          });

        if (insertError) {
          console.error(`   ❌ ${lang} DB 삽입 실패: ${insertError.message}`);
        } else {
          console.log(`   ✅ ${lang} 번역 복구 및 승인 완료`);
        }
      }

      repairedCount++;
      // API 호출 간격 1초 딜레이
      await delay(1000);

    } catch (err) {
      const errMsg = (err as Error).message;
      console.error(`   ❌ 복구 도중 에러 발생: ${errMsg}`);
      logFailureToCSV(trainer.id, trainer.game_id, trainer.version_str, `Exception: ${errMsg}`);
    }
  }

  console.log(`\n🏁 복구 완료 (복구한 트레이너 버전 수: ${repairedCount}개)`);
  console.log(`[+] 실패 보고서가 저장되었습니다: C:/Users/wlrlx/OneDrive/Documents/.My Project/trainer-translation-site/failed_repaired_trainers.csv`);
}

main().catch((err) => {
  console.error('💥 치명적 오류 발생:', err);
  process.exit(1);
});
