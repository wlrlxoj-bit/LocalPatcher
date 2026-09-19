import os
import re
import sys
import json
import hashlib
import zipfile
import io
import argparse
import time
from urllib.parse import parse_qs, quote, urlparse
import requests
from bs4 import BeautifulSoup
import pefile
from supabase import create_client, Client
from fling_utils import (
    find_game_by_canonical_slug,
    normalize_fling_slug,
    parse_trainer_version,
)
from translation_validation import (
    is_option_candidate,
    parse_option_line,
    save_validated_draft,
    validate_translation,
)

sys.stdout.reconfigure(encoding='utf-8')

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env.local'), override=True)

# Environment variables setup
SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
# Use Service Role Key for writing to DB securely in backend workflows, fallback to Anon Key
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")

def environment_nonnegative_int(name, default):
    """잘못된 실행 환경 값이 전체 자동화를 중단시키지 않도록 안전한 상한을 반환한다."""
    try:
        return max(0, int(os.environ.get(name, str(default))))
    except ValueError:
        return default


GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
GEMINI_MONTHLY_MAX_CHARS = environment_nonnegative_int("GEMINI_MONTHLY_MAX_CHARS", 0)
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
AZURE_TRANSLATOR_KEY = os.environ.get("AZURE_TRANSLATOR_KEY")
AZURE_TRANSLATOR_REGION = os.environ.get("AZURE_TRANSLATOR_REGION")
AZURE_TRANSLATOR_ENDPOINT = (os.environ.get("AZURE_TRANSLATOR_ENDPOINT") or "https://api.cognitive.microsofttranslator.com").rstrip("/")
TRANSLATION_PROVIDER = "gemini"


# Gemini가 형식 검증 또는 API 호출에서 실패했을 때만 제한적으로 쓸 GPT 예산이다.
# 실행 환경의 Secrets나 워크플로 설정만으로 상한을 조절한다.
OPENAI_FALLBACK_MAX_REQUESTS = environment_nonnegative_int("OPENAI_FALLBACK_MAX_REQUESTS", 8)
OPENAI_FALLBACK_MAX_CHARS = environment_nonnegative_int("OPENAI_FALLBACK_MAX_CHARS", 12000)
OPENAI_FALLBACK_MONTHLY_MAX_CHARS = environment_nonnegative_int("OPENAI_FALLBACK_MONTHLY_MAX_CHARS", 0)
OPENAI_AUTOMATION_FALLBACK_ENABLED = os.environ.get(
    "OPENAI_AUTOMATION_FALLBACK_ENABLED", "true"
).strip().lower() == "true"
openai_fallback_requests = 0
openai_fallback_chars = 0
last_llm_provider = None
translation_usage_db = None

class TranslationQuotaError(RuntimeError):
    pass


def retry_failure_policy(exc):
    """재시도 가능한 공급자 장애와 영구 번역 실패를 안전한 코드로 분리한다."""
    if isinstance(exc, TranslationQuotaError):
        return "deferred", "TRANSLATION_QUOTA", 86400
    if isinstance(exc, (requests.Timeout, requests.ConnectionError)):
        return "deferred", "TRANSLATION_API_TEMPORARY", 1800
    message = str(exc)
    if isinstance(exc, RuntimeError) and any(token in message for token in ("HTTP 429", "HTTP 500", "HTTP 502", "HTTP 503", "HTTP 504")):
        return "deferred", "TRANSLATION_API_TEMPORARY", 1800
    return "blocked", "TRANSLATION_PERMANENT", 0


def schedule_translation_retry(db, trainer_id, language_code, state, failure_code, delay_seconds):
    """service_role RPC로 재시도 상태를 저장하고 비밀 없는 결과 코드만 남긴다."""
    try:
        result = db.rpc("schedule_translation_retry", {
            "p_trainer_id": trainer_id,
            "p_language_code": language_code,
            "p_state": state,
            "p_failure_code": failure_code,
            "p_delay_seconds": delay_seconds,
        }).execute()
        if result.data is True:
            print(f"[RETRY_QUEUED] trainer={trainer_id} locale={language_code} state={state} code={failure_code}")
            return True
    except Exception:
        pass
    print("[RETRY_QUEUE_WRITE_FAILED]")
    return False


def complete_translation_retry(db, trainer_id, language_code):
    """검증·저장이 완료된 언어의 재시도 큐 항목을 제거한다."""
    try:
        result = db.rpc("complete_translation_retry", {
            "p_trainer_id": trainer_id,
            "p_language_code": language_code,
        }).execute()
        if result.data is True:
            print(f"[RETRY_COMPLETED] trainer={trainer_id} locale={language_code}")
            return True
    except Exception:
        pass
    print("[RETRY_QUEUE_WRITE_FAILED]")
    return False

# Dictionary of common trainer translations for cost-free instant translation mapping
COMMON_TRANSLATIONS = {
    "infinite health": "무한 체력",
    "infinite hp": "무한 체력",
    "infinite stamina": "무한 스태미나",
    "infinite items/ammo": "무한 아이템/탄약",
    "items won't decrease": "아이템 감소 방지",
    "healing items no cooldown": "회복 아이템 쿨타임 제거",
    "grenades no cooldown": "수류탄 쿨타임 제거",
    "no reload": "재장전 없음",
    "super accuracy": "초정밀 사격",
    "no recoil": "반동 없음",
    "one hit kill": "원샷원킬",
    "damage multiplier": "데미지 배율 설정",
    "defense multiplier": "방어력 배율 설정",
    "stealth mode": "은신 모드",
    "edit money": "보유 돈 편집",
    "infinite xp": "무한 경험치",
    "xp multiplier": "경험치 획득 배율",
    "infinite street cred": "무한 길거리 평판",
    "street cred multiplier": "길거리 평판 배율",
    "max skill xp/progression": "스킬 레벨 최대화 (진행도)",
    "skill xp multiplier": "스킬 경험치 배율",
    "edit attribute points": "특성 포인트 편집",
    "edit perk points": "특전 포인트 편집",
    "edit relic points": "릴릭 포인트 편집",
    "ignore cyberware capacity": "사이버웨어 용량 제한 무시",
    "set game speed": "게임 속도 조절",
    "infinite ram": "무한 RAM",
    "freeze breach protocol timer": "침투 프로토콜 타이머 고정",
    "infinite components": "무한 제작 부품",
    "infinite quickhack components": "무한 퀵핵 부품",
    "edit max carrying weight": "최대 휴대 용량 편집",
    "set movement speed": "이동 속도 설정",
    "super jump": "슈퍼 점프",
    "infinite double jumps": "무한 이단 점프",
    "edit player level": "플레이어 레벨 편집",
    "edit street cred level": "길거리 평판 레벨 편집",
    "freeze daytime": "시간 흐름 고정",
    "daytime +1 hour": "시간 1시간 전진",
    "god mode/ignore hits": "갓 모드/피격 무시",
    "infinite fp": "무한 FP",
    "zero weight": "무게 제로",
    "infinite item usage": "무한 아이템 사용",
    "100% drop rate": "드롭율 100%",
    "immune to all negative status": "모든 디버프 면역",
    "super damage/one hit kill": "슈퍼 데미지/원샷원킬",
    "infinite horse hp": "무한 탈것 HP",
    "edit runes": "룬 편집",
    "runes multiplier": "룬 획득 배율",
    "won't lose runes when player dies": "사망 시 룬 분실 방지",
    "enable fly mode": "비행 모드 활성화",
    "fly up": "비행 상승",
    "fly down": "비행 하강",
    "freeze enemies position": "적 위치 고정",
    "edit level": "레벨 에디트",
    "edit vigor": "생명력 에디트",
    "edit mind": "정신력 에디트",
    "edit endurance": "지구력 에디트",
    "edit strength": "근력 에디트",
    "edit dexterity": "기량 에디트",
    "edit intelligence": "지력 에디트",
    "edit faith": "신앙 에디트",
    "edit arcane": "신비 에디트",
    "edit max hp": "최대 HP 에디트",
    "edit max fp": "최대 FP 에디트",
    "edit max stamina": "최대 스태미나 에디트",
    "edit player stats": "스탯 에디터",
    "check for updates": "업데이트 확인"
}

# List of allowed abbreviations/words that do NOT indicate a translation leak in explanations
ALLOWED_WORDS = {
    'num', 'ctrl', 'alt', 'shift', 'pageup', 'pagedown', 'insert', 'delete', 'home', 'end',
    'hp', 'mp', 'sp', 'bp', 'xp', 'ap', 'jp', 'eac', 'id', 'ad', 'spa', 'fling', 'edit',
    'gta', 'cpu', 'gpu', 'ram', 'hud', 'fps', 'ok', 'vs', 'ii', 'iii', 'iv', 'v', 'vi'
}

def has_english_leak(text: str) -> bool:
    if not text:
        return False
    # Extract all English alphabetical words of length 3 or more
    words = re.findall(r'[a-zA-Z]{3,}', text.lower())
    for word in words:
        if word not in ALLOWED_WORDS:
            return True # English leak detected!
    return False

# Dynamic in-memory dictionary loaded from database
db_dictionary_ko = {}
db_dictionary_ja = {}

def save_new_translations_to_dictionary(original_line: str, translated_line: str, language_code: str, db: Client):
    """Extracts clean option labels and inserts/updates them into Supabase 'common_dictionary' table to dynamically train the database dictionary."""
    try:
        parts_orig = parse_option_line(original_line.strip())
        parts_trans = parse_option_line(translated_line.strip())
        if parts_orig and parts_trans:
            eng_label = parts_orig[2].strip()
            trans_label = parts_trans[2].strip()
            if not eng_label or not trans_label:
                return
                
            column_name = {
                'ko': 'korean_translation',
                'ja': 'translated_ja',
                'de': 'translated_de',
                'es': 'translated_es'
            }.get(language_code)
            
            if not column_name:
                return
                
            db.table('common_dictionary').upsert({
                'english_term': eng_label,
                column_name: trans_label
            }, on_conflict='english_term').execute()
            print(f"[+] Dynamic Dictionary Learned ({language_code}): '{eng_label}' -> '{trans_label}'")
    except Exception as e:
        # Silently fail if table doesn't exist or duplicate key error occurs
        pass

def _build_llm_prompt(lines_to_translate, language, example_translation, extra_prompt=""):
    """중복 원문 줄이 합쳐지지 않도록 인덱스 키 기반 프롬프트를 만든다."""
    lines_object = {f"line_{idx}": line for idx, line in enumerate(lines_to_translate)}
    return f"""
You are a professional game localization expert.
Translate the following game trainer cheat options into natural, standard {language} used by gamers.

CRITICAL RULES:
1. KEEP the exact hotkey prefix (e.g. "Num 1 -", "Ctrl+Num 1 -", "Alt+Num 1 -") unchanged.
2. Translate only the description label and any note texts (e.g. Translate "Infinite HP" to "{example_translation}").
3. Return strictly one JSON object. Every input key ("line_0", "line_1", etc.) must occur exactly once in the output and map to its translated string. Do not add, omit, rename, or reorder keys.

Input to translate:
{json.dumps(lines_object, ensure_ascii=False, indent=2)}
{extra_prompt}
"""


def _parse_indexed_translations(text_response, expected_count):
    """줄 위치를 보존하는 LLM 응답을 파싱하고 엄격히 검증한다."""
    def reject_duplicate_keys(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError(f"LLM 응답에 중복 키가 있습니다: {key}")
            result[key] = value
        return result

    parsed = json.loads(text_response, object_pairs_hook=reject_duplicate_keys)
    if not isinstance(parsed, dict):
        raise ValueError("LLM 응답은 JSON 객체여야 합니다")

    expected_keys = {f"line_{idx}" for idx in range(expected_count)}
    actual_keys = set(parsed.keys())
    if actual_keys != expected_keys:
        missing = sorted(expected_keys - actual_keys)
        unexpected = sorted(actual_keys - expected_keys)
        raise ValueError(f"LLM 응답 키가 일치하지 않습니다 (누락={missing}, 추가={unexpected})")

    translations = []
    for idx in range(expected_count):
        value = parsed[f"line_{idx}"]
        if not isinstance(value, str) or not value:
            raise ValueError(f"LLM 응답의 line_{idx} 번역값이 올바르지 않습니다")
        translations.append(value)
    return translations


def _call_gemini(lines_to_translate, prompt, _temperature):
    if not GEMINI_API_KEY:
        raise RuntimeError("Gemini API 환경 변수가 설정되지 않았습니다")
    reservation_id = _reserve_automation_usage(
        "gemini", sum(len(line) for line in lines_to_translate), GEMINI_MONTHLY_MAX_CHARS,
    )
    request_started = False
    print("[*] Gemini API에 일괄 번역을 요청합니다...")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}"
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"responseMimeType": "application/json"}
    }
    try:
        request_started = True
        res = requests.post(url, json=payload, timeout=15)
        if res.status_code != 200:
            raise RuntimeError(f"Gemini API가 HTTP {res.status_code}을 반환했습니다")
        try:
            text_response = res.json()["candidates"][0]["content"]["parts"][0]["text"]
        except (KeyError, IndexError, TypeError, ValueError) as exc:
            raise RuntimeError("Gemini API 응답 형식이 올바르지 않습니다") from exc
        return _parse_indexed_translations(text_response, len(lines_to_translate))
    finally:
        _finalize_automation_usage(reservation_id, consumed=request_started)


def _call_openai(lines_to_translate, prompt, temperature):
    if not OPENAI_API_KEY:
        raise RuntimeError("OpenAI API 환경 변수가 설정되지 않았습니다")
    print("[*] OpenAI API(gpt-4.1-mini)에 일괄 번역을 요청합니다...")
    headers = {"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"}
    payload = {
        "model": "gpt-4.1-mini",
        "messages": [
            {"role": "system", "content": "You are a helpful game localization assistant."},
            {"role": "user", "content": prompt}
        ],
        "temperature": temperature,
        "response_format": {"type": "json_object"}
    }
    res = requests.post("https://api.openai.com/v1/chat/completions", headers=headers, json=payload, timeout=30)
    if res.status_code in (403, 429):
        raise TranslationQuotaError(f"OpenAI 유료 번역 할당량 중단: HTTP {res.status_code}")
    if res.status_code != 200:
        raise RuntimeError(f"OpenAI API가 HTTP {res.status_code}을 반환했습니다")
    text_response = res.json()["choices"][0]["message"]["content"]
    return _parse_indexed_translations(text_response, len(lines_to_translate))


def openai_automation_fallback_available():
    """Gemini 실패 시 사용할 GPT 보조 경로의 공유 월 예산 준비 상태를 확인한다."""
    return bool(
        OPENAI_AUTOMATION_FALLBACK_ENABLED
        and OPENAI_FALLBACK_MONTHLY_MAX_CHARS > 0
        and OPENAI_API_KEY
        and translation_usage_db is not None
    )


def _reserve_automation_usage(provider, characters, monthly_max_chars):
    """공유 월 사용량을 원자적으로 예약한다. RPC를 사용할 수 없으면 비용 호출을 막는다."""
    if monthly_max_chars <= 0 or translation_usage_db is None:
        raise TranslationQuotaError(f"{provider} 자동 번역 월 예산이 설정되지 않았습니다")
    try:
        configured = translation_usage_db.rpc("configure_translation_usage_limit", {
            "p_provider": provider,
            "p_hard_limit_characters": monthly_max_chars,
        }).execute().data
        if configured is not True:
            raise TranslationQuotaError(f"{provider} 월 예산을 설정할 수 없습니다")
        reservation = translation_usage_db.rpc("reserve_translation_usage", {
            "p_provider": provider,
            "p_characters": characters,
        }).execute().data
    except TranslationQuotaError:
        raise
    except Exception as exc:
        raise TranslationQuotaError(f"{provider} 공유 월 예산을 확인할 수 없습니다") from exc
    if not isinstance(reservation, str) or not reservation:
        raise TranslationQuotaError(f"{provider} 월 예산을 초과했습니다")
    return reservation


def _finalize_automation_usage(reservation_id, consumed):
    try:
        completed = translation_usage_db.rpc("finalize_translation_usage", {
            "p_reservation_id": reservation_id,
            "p_consumed": consumed,
        }).execute().data
        if completed is not True:
            raise RuntimeError("reservation finalize rejected")
    except Exception as exc:
        raise TranslationQuotaError("자동 번역 공유 월 예산 확정에 실패했습니다") from exc


def _call_openai_fallback(lines_to_translate, prompt, temperature):
    """자동 보조 GPT 호출은 실행 상한과 Supabase 월 예산 예약을 모두 통과해야 한다."""
    global openai_fallback_requests, openai_fallback_chars
    request_chars = sum(len(line) for line in lines_to_translate)
    if openai_fallback_requests >= OPENAI_FALLBACK_MAX_REQUESTS:
        raise TranslationQuotaError("OpenAI 보조 번역 요청 상한에 도달했습니다")
    if openai_fallback_chars + request_chars > OPENAI_FALLBACK_MAX_CHARS:
        raise TranslationQuotaError("OpenAI 보조 번역 문자 상한에 도달했습니다")
    if not openai_automation_fallback_available():
        raise TranslationQuotaError("OpenAI 자동 보조 번역 월 예산이 설정되지 않았습니다")
    reservation_id = _reserve_automation_usage(
        "openai_paid", request_chars, OPENAI_FALLBACK_MONTHLY_MAX_CHARS,
    )
    openai_fallback_requests += 1
    openai_fallback_chars += request_chars
    request_started = False
    try:
        request_started = True
        return _call_openai(lines_to_translate, prompt, temperature)
    finally:
        _finalize_automation_usage(reservation_id, consumed=request_started)

def _call_azure(lines_to_translate, _prompt, _temperature):
    """Azure Translator F0 기본 경로. 항목 25개·유니코드 5000자 이내 배치만 호출한다."""
    if not AZURE_TRANSLATOR_KEY or not AZURE_TRANSLATOR_REGION:
        raise RuntimeError("Azure Translator 환경 변수가 설정되지 않았습니다")
    if len(lines_to_translate) > 25 or sum(len(line) for line in lines_to_translate) > 5000:
        raise RuntimeError("Azure Translator 배치 제한을 초과했습니다")
    headers = {"Content-Type": "application/json", "Ocp-Apim-Subscription-Key": AZURE_TRANSLATOR_KEY, "Ocp-Apim-Subscription-Region": AZURE_TRANSLATOR_REGION}
    for attempt in range(3):
        if "German" in _prompt:
            target_language = "de"
        elif "Spanish" in _prompt:
            target_language = "es"
        elif "Japanese" in _prompt:
            target_language = "ja"
        else:
            target_language = "ko"
        res = requests.post(f"{AZURE_TRANSLATOR_ENDPOINT}/translate?api-version=3.0&from=en&to={target_language}", headers=headers, json=[{"Text": line} for line in lines_to_translate], timeout=30)
        if res.status_code in (403, 429):
            raise TranslationQuotaError(f"Azure Translator 할당량 중단: HTTP {res.status_code}")
        if res.status_code >= 500 and attempt < 2:
            time.sleep(attempt + 1)
            continue
        if res.status_code != 200:
            raise RuntimeError(f"Azure Translator HTTP {res.status_code}")
        rows = res.json()
        if not isinstance(rows, list) or len(rows) != len(lines_to_translate):
            actual = len(rows) if isinstance(rows, list) else "invalid"
            raise RuntimeError(
                f"Azure Translator 응답 수 불일치: expected={len(lines_to_translate)} actual={actual}"
            )
        return [row["translations"][0]["text"] for row in rows]
    raise RuntimeError("Azure Translator 요청 실패")


def _chunk_translation_items(items, max_items=25, max_chars=5000):
    """항목 수와 총 문자 수 제한을 모두 지키는 번역 청크를 만든다."""
    chunks, current, current_chars = [], [], 0
    for item in items:
        if len(item) > max_chars:
            raise RuntimeError(f"번역 항목 문자 제한 초과: chars={len(item)}")
        if current and (len(current) >= max_items or current_chars + len(item) > max_chars):
            chunks.append(current)
            current, current_chars = [], 0
        current.append(item)
        current_chars += len(item)
    if current:
        chunks.append(current)
    return chunks


def _translate_via_llm_with_fallback(lines_to_translate, language, example_translation, providers):
    """기본 번역기 1회 후 실패할 때만 보조 번역기 1회를 실행한다."""
    global last_llm_provider
    if not lines_to_translate:
        return []
    if not providers:
        raise RuntimeError("사용 가능한 자동 번역 제공자가 없습니다")
    chunks = _chunk_translation_items(lines_to_translate)
    if len(chunks) > 1:
        translated = []
        for chunk in chunks:
            translated.extend(
                _translate_via_llm_with_fallback(
                    chunk, language, example_translation, providers
                )
            )
        return translated

    language_label = "한국어" if language == "Korean" else "일본어"
    last_error = "번역 제공자가 성공적으로 응답하지 않았습니다"
    prompt = _build_llm_prompt(lines_to_translate, language, example_translation)
    for provider_name, provider in providers:
        try:
            result = provider(lines_to_translate, prompt, 0.7)
            last_llm_provider = provider_name
            return result
        except Exception as exc:
            if isinstance(exc, TranslationQuotaError):
                # Gemini의 월 예산/예약 실패도 GPT 보조 번역을 시도해야 한다.
                # 반면 GPT 보조 경로의 예산 실패는 더 비싼 재시도를 만들 수 있으므로
                # 이 실행을 실패로 끝낸다. 제공자 표시는 translation_providers()의
                # 고정 계약이며, 외부 응답 내용은 로그에 기록하지 않는다.
                if provider_name != "Gemini":
                    raise
            last_error = str(exc)
            print(f"[-] {provider_name} {language_label} 일괄 번역 실패: {type(exc).__name__}")

    raise RuntimeError(f"{language_label} 일괄 번역 실패: {last_error}")


def _split_option_for_translation(line):
    """옵션 줄을 원본 단축키·구분자와 번역 대상 label로 분리한다."""
    parts = parse_option_line(line)
    if not parts:
        return None
    prefix, delimiter, label = parts
    return prefix + delimiter, label


def translation_providers(prefer_openai_fallback=False):
    """선택된 기본 번역기와 Gemini 실패 시 1회만 쓸 GPT 보조 번역기를 결정한다."""
    if TRANSLATION_PROVIDER == "gemini":
        if prefer_openai_fallback:
            return [("OpenAI Paid Fallback", _call_openai_fallback)] if openai_automation_fallback_available() else []
        providers = [("Gemini", _call_gemini)]
        if openai_automation_fallback_available():
            providers.append(("OpenAI Paid Fallback", _call_openai_fallback))
        return providers
    if TRANSLATION_PROVIDER == "azure":
        return [("Azure", _call_azure)]
    return [("OpenAI Paid", _call_openai)]


def translate_via_llm(lines_to_translate, prefer_openai_fallback=False):
    providers = translation_providers(prefer_openai_fallback)
    return _translate_via_llm_with_fallback(lines_to_translate, "Korean", "무한 체력", providers)

def translate_via_llm_de(lines_to_translate, prefer_openai_fallback=False):
    providers = translation_providers(prefer_openai_fallback)
    return _translate_via_llm_with_fallback(lines_to_translate, "German", "Unendliche Gesundheit", providers)

def translate_via_llm_es(lines_to_translate, prefer_openai_fallback=False):
    providers = translation_providers(prefer_openai_fallback)
    return _translate_via_llm_with_fallback(lines_to_translate, "Spanish", "Salud Infinita", providers)

def process_translation_block_de(text: str, db: Client, prefer_openai_fallback=False) -> str:
    lines = text.split("\n")
    dict_results = []
    lines_needing_llm = []
    for line in lines:
        if not line or line.strip() == "":
            dict_results.append(line)
            continue
        parts = _split_option_for_translation(line)
        if parts is None:
            dict_results.append(line)
        else:
            dict_results.append(None)
            lines_needing_llm.append(parts[1])
            
    llm_results = translate_via_llm_de(lines_needing_llm, prefer_openai_fallback) if lines_needing_llm else []
    translated_lines = []
    llm_index = 0
    for idx, line in enumerate(lines):
        if not line or line.strip() == "":
            translated_lines.append(line)
            continue
        orig_len = len(line)
        trans_line = dict_results[idx]
        if trans_line is None:
            parts = _split_option_for_translation(line)
            trans_line = parts[0] + llm_results[llm_index]
            llm_index += 1
            if trans_line != line:
                save_new_translations_to_dictionary(line, trans_line, 'de', db)
            
        if len(trans_line) < orig_len:
            trans_line += " " * (orig_len - len(trans_line))
        elif len(trans_line) > orig_len:
            trans_line = trans_line[:orig_len]
        translated_lines.append(trans_line)
    return "\n".join(translated_lines)

def process_translation_block_es(text: str, db: Client, prefer_openai_fallback=False) -> str:
    lines = text.split("\n")
    dict_results = []
    lines_needing_llm = []
    for line in lines:
        if not line or line.strip() == "":
            dict_results.append(line)
            continue
        parts = _split_option_for_translation(line)
        if parts is None:
            dict_results.append(line)
        else:
            dict_results.append(None)
            lines_needing_llm.append(parts[1])
            
    llm_results = translate_via_llm_es(lines_needing_llm, prefer_openai_fallback) if lines_needing_llm else []
    translated_lines = []
    llm_index = 0
    for idx, line in enumerate(lines):
        if not line or line.strip() == "":
            translated_lines.append(line)
            continue
        orig_len = len(line)
        trans_line = dict_results[idx]
        if trans_line is None:
            parts = _split_option_for_translation(line)
            trans_line = parts[0] + llm_results[llm_index]
            llm_index += 1
            if trans_line != line:
                save_new_translations_to_dictionary(line, trans_line, 'es', db)
            
        if len(trans_line) < orig_len:
            trans_line += " " * (orig_len - len(trans_line))
        elif len(trans_line) > orig_len:
            trans_line = trans_line[:orig_len]
        translated_lines.append(trans_line)
    return "\n".join(translated_lines)

def translate_line(line: str):
    """Attempts dictionary translation for a single line. Returns None if it needs LLM translation."""
    parts = parse_option_line(line)
    if not parts:
        return line
    hotkey, delimiter, label = parts
    notes = ""
    
    label_lower = label.lower().replace("'", "").strip()
    
    # Check dynamic database dictionary first, then fallback to local static dict
    translated_label = None
    if label_lower in COMMON_TRANSLATIONS:
        translated_label = COMMON_TRANSLATIONS[label_lower]
        
    if translated_label is not None:
        # Force LLM translation if there is an english leak in the details/notes
        if notes and has_english_leak(notes):
            return None
            
        # Simple notes translation lookup
        translated_notes = ""
        if notes:
            notes_lower = notes.lower()
            if "takes effect" in notes_lower:
                translated_notes = " **효과 적용 시 수치가 갱신됩니다."
            elif "activate before" in notes_lower:
                translated_notes = " **사용하기 전에 활성화하십시오."
            else:
                translated_notes = notes
                
        return f"{hotkey}{delimiter}{translated_label}{translated_notes}"
    
    # Return None to indicate it requires LLM translation
    return None

def process_translation_block(text: str, db: Client, prefer_openai_fallback=False) -> str:
    """Splits a multi-line options string, translates each line (Dictionary + LLM Fallback), and pads with spaces."""
    lines = text.split("\n")
    dict_results = []
    lines_needing_llm = []

    # First Pass: Translate using dictionary. Track unmapped lines.
    for line in lines:
        if not line or line.strip() == "":
            dict_results.append(line)
            continue
            
        trans_line = translate_line(line)
        if trans_line is not None:
            dict_results.append(trans_line)
        else:
            parts = _split_option_for_translation(line)
            if parts is None:
                dict_results.append(line)
            else:
                dict_results.append(None) # Marker for LLM translate
                lines_needing_llm.append(parts[1])

    # Second Pass: Perform batch LLM translation if keys are set
    llm_results = []
    if lines_needing_llm:
        llm_results = translate_via_llm(lines_needing_llm, prefer_openai_fallback)

    # Third Pass: Assemble and apply Space Padding to synchronize lengths
    translated_lines = []
    llm_index = 0
    for idx, line in enumerate(lines):
        if not line or line.strip() == "":
            translated_lines.append(line)
            continue
            
        orig_len = len(line)
        
        # Get translation from first pass or fallback to LLM / original
        trans_line = dict_results[idx]
        if trans_line is None:
            # 인덱스 기반 결과이므로 같은 영문 줄도 서로 다른 위치로 보존한다.
            parts = _split_option_for_translation(line)
            if parts is None or llm_index >= len(llm_results):
                raise RuntimeError("번역 결과와 옵션 줄의 대응 관계가 손상됨")
            trans_line = parts[0] + llm_results[llm_index]
            llm_index += 1
            # Save newly translated term to dynamic dictionary table for self-learning caching
            if trans_line != line:
                save_new_translations_to_dictionary(line, trans_line, 'ko', db)

        # Apply Space Padding to synchronize string length in bytes/chars
        if len(trans_line) < orig_len:
            trans_line += " " * (orig_len - len(trans_line))
        elif len(trans_line) > orig_len:
            # Safely truncate to prevent adjacent memory override (Buffer Overflow protection)
            trans_line = trans_line[:orig_len]
            
        translated_lines.append(trans_line)
        
    return "\n".join(translated_lines)

def translate_line_ja(line: str):
    """Attempts Japanese dictionary translation for a single line. Returns None if it needs LLM translation."""
    parts = parse_option_line(line)
    if not parts:
        return line
    hotkey, delimiter, label = parts
    notes = ""
    
    label_lower = label.lower().replace("'", "").strip()
    
    translated_label = None
    if label_lower in db_dictionary_ja:
        translated_label = db_dictionary_ja[label_lower]
        
    if translated_label is not None:
        # Force LLM translation if there is an english leak in the details/notes for Japanese
        if notes and has_english_leak(notes):
            return None
            
        translated_notes = ""
        if notes:
            notes_lower = notes.lower()
            if "takes effect" in notes_lower:
                translated_notes = " **効果適用時に反映"
            elif "activate before" in notes_lower:
                translated_notes = " **使用前有効化"
            else:
                translated_notes = notes
                
        return f"{hotkey}{delimiter}{translated_label}{translated_notes}"
    
    return None

def _translate_via_llm_ja_legacy(lines_to_translate):
    """기존 일본어 일괄 번역 방식이다. 호환성 보존용이며 현재 호출하지 않는다."""
    if not lines_to_translate:
        return {}

    prompt = f"""
    You are a professional game localization expert.
    Translate the following list of game trainer cheat options into natural, standard Japanese used by Japanese gamers.
    
    CRITICAL RULES:
    1. KEEP the exact hotkey prefix (e.g. "Num 1 -", "Ctrl+Num 1 -", "Alt+Num 1 -") unchanged.
    2. Translate only the description label and any note texts (e.g. Translate "Infinite HP" to "体力無限" or "無限体力").
    3. Return your output strictly as a JSON object with a single key "translations" containing an array of translated strings in the EXACT same order.
    
    List to translate:
    {json.dumps(lines_to_translate, ensure_ascii=False)}
    """

    if OPENAI_API_KEY:
        try:
            print("[*] OpenAI API(gpt-4.1-mini)에 일본어 일괄 번역을 요청합니다...")
            url = "https://api.openai.com/v1/chat/completions"
            headers = {
                "Authorization": f"Bearer {OPENAI_API_KEY}",
                "Content-Type": "application/json"
            }
            payload = {
                "model": "gpt-4.1-mini",
                "messages": [
                    {"role": "system", "content": "You are a helpful localization assistant."},
                    {"role": "user", "content": prompt}
                ],
                "response_format": {"type": "json_object"}
            }
            res = requests.post(url, headers=headers, json=payload, timeout=60)
            if res.status_code == 200:
                res_data = res.json()
                text_response = res_data["choices"][0]["message"]["content"]
                translated_array = json.loads(text_response).get("translations", [])
                if len(translated_array) == len(lines_to_translate):
                    return dict(zip(lines_to_translate, translated_array))
        except Exception as e:
            print(f"[-] OpenAI API translation failed: {e}")

    return {}

def translate_via_llm_ja(lines_to_translate, prefer_openai_fallback=False):
    """모든 원문 줄의 위치를 보존하면서 일본어로 번역한다."""
    providers = translation_providers(prefer_openai_fallback)
    return _translate_via_llm_with_fallback(lines_to_translate, "Japanese", "無限体力", providers)

def process_translation_block_ja(text: str, db: Client, prefer_openai_fallback=False) -> str:
    """Splits a multi-line options string, translates each line to Japanese (Dictionary + LLM Fallback), and pads with spaces."""
    lines = text.split("\n")
    dict_results = []
    lines_needing_llm = []

    for line in lines:
        if not line or line.strip() == "":
            dict_results.append(line)
            continue
            
        trans_line = translate_line_ja(line)
        if trans_line is not None:
            dict_results.append(trans_line)
        else:
            parts = _split_option_for_translation(line)
            if parts is None:
                dict_results.append(line)
            else:
                dict_results.append(None)
                lines_needing_llm.append(parts[1])

    llm_results = []
    if lines_needing_llm:
        llm_results = translate_via_llm_ja(lines_needing_llm, prefer_openai_fallback)

    translated_lines = []
    llm_index = 0
    for idx, line in enumerate(lines):
        if not line or line.strip() == "":
            translated_lines.append(line)
            continue
            
        orig_len = len(line)
        
        trans_line = dict_results[idx]
        if trans_line is None:
            parts = _split_option_for_translation(line)
            if parts is None or llm_index >= len(llm_results):
                raise RuntimeError("번역 결과와 옵션 줄의 대응 관계가 손상됨")
            trans_line = parts[0] + llm_results[llm_index]
            llm_index += 1
            if trans_line != line:
                save_new_translations_to_dictionary(line, trans_line, 'ja', db)

        if len(trans_line) < orig_len:
            trans_line += " " * (orig_len - len(trans_line))
        elif len(trans_line) > orig_len:
            trans_line = trans_line[:orig_len]
            
        translated_lines.append(trans_line)
        
    return "\n".join(translated_lines)

def parse_pe_binary(exe_bytes: bytes):
    """Parses PE header to verify safety and extract .text section boundaries."""
    try:
        pe = pefile.PE(data=exe_bytes)
        text_section = None
        for section in pe.sections:
            if b'.text' in section.Name:
                text_section = section
                break
        return text_section
    except Exception as e:
        print(f"[-] PE Header parsing failed: {e}")
        return None

def scan_cheat_string_offset(exe_bytes: bytes):
    """Scans binary to detect the offset, encoding, and capacity of the hotkey options block."""
    # Look for hotkey signatures in both UTF-16LE and ASCII formats
    patterns = {
        'UTF-16LE': b'N\x00u\x00m\x00 \x001\x00',
        'ASCII': b'Num 1'
    }
    
    for encoding, pattern in patterns.items():
        offset = exe_bytes.find(pattern)
        if offset != -1:
            print(f"[+] Found hotkey signature pattern in {encoding} at offset {offset}")
            
            # Trace backwards to locate start of string (usually preceded by double newlines or nulls)
            start_offset = offset
            limit = max(0, offset - 1000)
            
            if encoding == 'UTF-16LE':
                # Trace back UTF-16LE newlines \n\n (\n is \n\x00)
                while start_offset > limit:
                    if exe_bytes[start_offset:start_offset+4] == b'\n\x00\n\x00':
                        start_offset += 4
                        break
                    start_offset -= 2
            else:
                while start_offset > limit:
                    if exe_bytes[start_offset:start_offset+2] == b'\n\n':
                        start_offset += 2
                        break
                    start_offset -= 1
            
            # Trace forwards to calculate total string capacity/buffer limit
            end_offset = offset
            max_limit = min(len(exe_bytes), offset + 8000)
            
            if encoding == 'UTF-16LE':
                while end_offset < max_limit:
                    # Check for double null terminal block
                    if exe_bytes[end_offset:end_offset+4] == b'\x00\x00\x00\x00':
                        break
                    end_offset += 2
            else:
                while end_offset < max_limit:
                    if exe_bytes[end_offset:end_offset+2] == b'\x00\x00':
                        break
                    end_offset += 1
                    
            max_char_len = (end_offset - start_offset) // (2 if encoding == 'UTF-16LE' else 1)
            raw_bytes = exe_bytes[start_offset:end_offset]
            original_text = raw_bytes.decode(encoding, errors='ignore').replace('\x00', '').replace('\u0000', '')
            
            return {
                'offset_dec': start_offset,
                'encoding': encoding,
                'max_char_len': max_char_len,
                'original_text': original_text
            }
            
    return None

def fetch_recent_trainers():
    """Scrapes FLiNG home page to detect recently posted/updated trainers."""
    url = "https://flingtrainer.com/"
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
    
    try:
        response = requests.get(url, headers=headers, timeout=10)
        if response.status_code != 200:
            print(f"[-] Failed to scrape FLiNG index page: {response.status_code}")
            return []
            
        soup = BeautifulSoup(response.text, 'html.parser')
        trainer_posts = []
        
        # Scrape post title links
        for a in soup.select('h2 a'):
            title = a.text.strip()
            link = a['href']
            # Match games like "Cyberpunk 2077 v2.0 Trainer"
            if "trainer" in link:
                slug = normalize_fling_slug(link)
                trainer_posts.append({
                    'title': title,
                    'link': link,
                    'slug': slug
                })
        return trainer_posts
    except Exception as e:
        print(f"[-] Error scraping FLiNG feed: {e}")
        return []

def fetch_steam_meta(game_title: str):
    """Queries Steam Store Search and App Details APIs to fetch appid, cover art, and official titles and descriptions."""
    default_meta = {
        'appid': '1091500',
        'title_ko': game_title,
        'title_ja': game_title,
        'cover_url': '/images/default_cover.jpg',
        'description_en': '',
        'description_ko': '',
        'description_ja': '',
        'description_de': '',
        'description_es': ''
    }
    try:
        print(f"[*] Searching Steam store details for: {game_title}...")
        search_url = f"https://store.steampowered.com/api/storesearch/?term={requests.utils.quote(game_title)}&l=english&cc=US"
        res = requests.get(search_url, timeout=5)
        if res.status_code == 200:
            search_data = res.json()
            items = search_data.get("items", [])
            if items:
                appid = str(items[0]["id"])
                title_en = items[0]["name"]
                
                languages = {
                    'en': 'english',
                    'ko': 'koreana',
                    'ja': 'japanese',
                    'de': 'german',
                    'es': 'spanish'
                }
                meta = {
                    'appid': appid,
                    'title_ko': title_en,
                    'title_ja': title_en,
                    'cover_url': f"https://cdn.cloudflare.steamstatic.com/steam/apps/{appid}/header.jpg",
                    'description_en': '',
                    'description_ko': '',
                    'description_ja': '',
                    'description_de': '',
                    'description_es': ''
                }
                
                import time
                for lang_code, steam_lang in languages.items():
                    try:
                        details_url = f"https://store.steampowered.com/api/appdetails?appids={appid}&l={steam_lang}"
                        d_res = requests.get(details_url, timeout=5)
                        if d_res.status_code == 200:
                            d_data = d_res.json()
                            if d_data.get(appid, {}).get("success"):
                                data = d_data[appid]["data"]
                                title = data.get("name", title_en).replace("®", "").replace("™", "").strip()
                                desc = data.get("short_description", "")
                                if lang_code == 'ko': meta['title_ko'] = title
                                if lang_code == 'ja': meta['title_ja'] = title
                                meta[f'description_{lang_code}'] = desc
                        time.sleep(0.1)
                    except:
                        pass
                
                try:
                    c_res = requests.head(meta['cover_url'], timeout=3)
                    if c_res.status_code != 200:
                        meta['cover_url'] = '/images/default_cover.jpg'
                except:
                    meta['cover_url'] = '/images/default_cover.jpg'
                    
                print(f"[+] Found Steam AppID: {appid}, Cover: {meta['cover_url']}")
                return meta
    except Exception as e:
        print(f"[-] Steam search failed: {e}")
    return default_meta

def official_archive_from_redirect(response):
    """공식 전달 서버가 명시한 공개 ZIP 경로만 반환한다. 임의 경로 추측은 하지 않는다."""
    history = list(getattr(response, 'history', []))
    if not history:
        return None
    for step in history:
        parsed = urlparse(step.url)
        if parsed.scheme != 'https' or parsed.netloc != 'flingtrainer.com':
            return None
    for step in history:
        parsed = urlparse(step.url)
        if parsed.path != '/download-trainer.php':
            continue
        values = parse_qs(parsed.query).get('path', [])
        if len(values) != 1:
            continue
        path = values[0]
        if not re.fullmatch(r'/wp-content/uploads/\d{4}/\d{2}/[^/\\%?#\x00-\x1f]+\.zip', path):
            continue
        if '..' in path:
            continue
        return 'https://flingtrainer.com' + quote(path, safe='/.-_')
    return None


def recover_official_archive(response, headers):
    """전달된 EXE가 거부되면 서버가 제공한 ZIP을 확인한다. 재리디렉션과 비ZIP은 거부한다."""
    if response.status_code != 403:
        return response
    archive_url = official_archive_from_redirect(response)
    if not archive_url:
        return response
    archive = requests.get(archive_url, headers=headers, timeout=30, allow_redirects=False)
    if (archive.status_code == 200 and archive.content.startswith(b'PK\x03\x04')
            and zipfile.is_zipfile(io.BytesIO(archive.content))):
        print('[*] Official archive recovered from download redirect.')
        return archive
    return response


def is_rar_archive(download_url, file_bytes=None):
    """지원하지 않는 RAR 보관본을 URL 또는 응답 매직 바이트로 판별한다."""
    clean_url = (download_url or "").split("?", 1)[0].lower()
    return clean_url.endswith(".rar") or bool(file_bytes and file_bytes.startswith(b"Rar!"))


def scrape_and_patch_trainer(
    post,
    db: Client,
    force=False,
    strict_download_failures=True,
    languages=None,
    reprocess_existing_unapproved=True,
    target_trainer_id=None,
):
    """FLiNG 원본을 수집한다.

    예약 실행은 이미 존재하는 미승인 번역을 다시 LLM에 보내지 않는다. 수동 URL
    실행만 기존 동작대로 이를 재처리해, 신규 바이너리/업데이트와 재시도 비용을 분리한다.
    """
    global last_llm_provider, translation_usage_db
    translation_usage_db = db
    print(f"[*] Processing: {post['title']} ({post['link']})")
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
    requested_locales = set(languages or ('ko', 'ja', 'de', 'es'))
    
    try:
        response = requests.get(post['link'], headers=headers, timeout=10)
        if response.status_code != 200:
            return False
            
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Locate all download links (starts with /downloads/)
        download_anchors = soup.select('a[href*="/downloads/"]')
        if not download_anchors:
            print("[-] No download links found on page.")
            return False
            
        # Deduplicate URLs preserving order
        seen_urls = set()
        unique_downloads = []
        for a in download_anchors:
            url = a['href']
            if url not in seen_urls:
                seen_urls.add(url)
                unique_downloads.append(a)
                
        # Check if game already exists in DB by slug first, or by title_en
        game_title_en = post['title'].split('Trainer')[0].strip()
        post['slug'] = normalize_fling_slug(post['slug'])
        game_row = find_game_by_canonical_slug(db, post['slug'], game_title_en)
                
        if game_row:
            game_id = game_row['id']
            db.table('games').update({'fling_url': post['link']}).eq('id', game_id).execute()
        else:
            # Create new game meta row
            steam_meta = fetch_steam_meta(game_title_en)
            
            insert_game = db.table('games').insert({
                'title_en': game_title_en,
                'title_ko': steam_meta['title_ko'],
                'title_ja': steam_meta['title_ja'],
                'slug': post['slug'],
                'cover_image_url': steam_meta['cover_url'],
                'description_en': steam_meta['description_en'],
                'description_ko': steam_meta['description_ko'],
                'description_ja': steam_meta['description_ja'],
                'description_de': steam_meta['description_de'],
                'description_es': steam_meta['description_es'],
                'anti_cheat': 'none',
                'fling_url': post['link']
            }).execute()
            if not insert_game.data:
                print("[-] Failed to create game meta.")
                return False
            game_id = insert_game.data[0]['id']
            
        any_registered = False
        approved_skips = 0
        had_eligible_failure = False
        rar_skips = 0
        actionable_downloads = 0
        # Now process each version download link
        for download_a in unique_downloads:
            download_url = download_a['href']
            download_text = download_a.text.strip()
            print(f"[*] Version download link found: {download_url} ({download_text})")
            target_eligible = False
            approved_locales = set()

            # RAR은 GitHub 실행 환경에서 안전하게 열 수 있는 형식이 아니다. 구형
            # 보관본은 다운로드/번역 후보에서 제외하며, RAR만 있는 페이지는 아래에서
            # 명시적인 중립 건너뜀으로만 처리한다.
            if is_rar_archive(download_url):
                print(f"[ARCHIVE_RAR_SKIPPED] url={download_url} source=url")
                rar_skips += 1
                continue
            
            try:
                # Download binary bytes with retries
                file_bytes = None
                download_failure = "empty_response"
                for dl_attempt in range(1, 4):
                    try:
                        dl_response = requests.get(download_url, headers=headers, timeout=30)
                        dl_response = recover_official_archive(dl_response, headers)
                        if dl_response.status_code == 200:
                            file_bytes = dl_response.content
                            break
                        download_failure = f"http_{dl_response.status_code}"
                        # 접근 거부/삭제 응답은 같은 실행에서 반복 요청하지 않는다.
                        if dl_response.status_code in {400, 401, 403, 404, 410}:
                            break
                    except Exception as download_error:
                        download_failure = type(download_error).__name__
                    time.sleep(1)
                if not file_bytes:
                    print(f"[-] Failed to download binary from {download_url} reason={download_failure}")
                    if strict_download_failures:
                        had_eligible_failure = True
                    continue
                    
                file_bytes = dl_response.content
                exe_bytes = None

                if is_rar_archive(download_url, file_bytes):
                    print(f"[ARCHIVE_RAR_SKIPPED] url={download_url} source=magic_bytes")
                    rar_skips += 1
                    continue

                actionable_downloads += 1
                
                # ZIP만 열어 실행 파일을 추출한다. RAR은 위에서 안전하게 제외했다.
                if download_url.endswith('.zip') or file_bytes[:2] == b'PK':
                    print("[*] Unzipping package to extract executable...")
                    with zipfile.ZipFile(io.BytesIO(file_bytes)) as z:
                        for name in z.namelist():
                            if name.endswith('.exe'):
                                exe_bytes = z.read(name)
                                break
                else:
                    exe_bytes = file_bytes
                    
                if not exe_bytes or exe_bytes[:2] != b'MZ':
                    print("[-] Valid executable binary not found.")
                    if strict_download_failures:
                        had_eligible_failure = True
                    continue
                    
                # Calculate file specs
                original_file_size = len(exe_bytes)
                original_file_hash = hashlib.sha256(exe_bytes).hexdigest()
                print(f"[+] Size: {original_file_size} bytes, Hash: {original_file_hash}")
                
                # Check if trainer version already exists in DB
                trainer_res = db.table('trainers').select('id').eq('original_file_hash', original_file_hash).execute()
                if trainer_res.data:
                    trainer_id = trainer_res.data[0]['id']
                    # 재시도 큐는 (trainer, 언어) 단위다. 같은 FLiNG 게시물의 다른
                    # 다운로드까지 다시 번역하면 큐 한 건이 비용 폭주로 번질 수 있다.
                    if target_trainer_id is not None and trainer_id != target_trainer_id:
                        print(f"[RETRY_TRAINER_MISMATCH_SKIPPED] trainer={trainer_id}")
                        continue
                    # Check if it has any translation mappings
                    mappings_res = db.table('translation_mappings').select('id,is_approved,language_code').eq('trainer_id', trainer_id).execute()
                    approved_locales = {
                        mapping.get('language_code') for mapping in (mappings_res.data or [])
                        if mapping.get('is_approved')
                    }
                    if requested_locales.issubset(approved_locales) and not force:
                        print(f"    [*] Skip/Protect: Trainer ID {trainer_id} has approved translation mappings. Skipping overwrite.")
                        approved_skips += 1
                        continue
                    if not reprocess_existing_unapproved and not force:
                        # 같은 바이너리의 pending/rejected 매핑은 전용 ready 큐를 통해서만
                        # 재시도한다. 예약 수집이 매 3시간마다 비용을 태우면 안 된다.
                        print(f"[SCHEDULED_EXISTING_PENDING_SKIPPED] trainer={trainer_id}")
                        approved_skips += 1
                        continue
                    target_eligible = True
                    if force:
                        print(f"    [*] Force mode: deleting existing mappings and trainer ID {trainer_id} to overwrite...")
                        db.table('translation_mappings').delete().eq('trainer_id', trainer_id).execute()
                        db.table('trainers').delete().eq('id', trainer_id).execute()
                        trainer_id = None
                    else:
                        print(f"[*] Trainer {trainer_id}의 pending/rejected 번역을 동일 바이너리로 재검증합니다.")
                else:
                    trainer_id = None
                    target_eligible = True
                    
                # Parse PE header for security boundaries
                text_section = parse_pe_binary(exe_bytes)
                if not text_section:
                    print("[-] Executable parsing failed. Section boundaries mismatch.")
                    if strict_download_failures:
                        had_eligible_failure = True
                    continue
                    
                # Scan cheat options string offset
                mapping_details = scan_cheat_string_offset(exe_bytes)
                if not mapping_details:
                    print("[-] Option labels buffer not found inside binary.")
                    if strict_download_failures:
                        had_eligible_failure = True
                    continue
                    
                # Prevent Shellcode write block: verify mapping falls outside .text segment
                text_start = text_section.PointerToRawData
                text_end = text_start + text_section.SizeOfRawData
                if text_start <= mapping_details['offset_dec'] < text_end:
                    print("[-] Security Warning: Mapping offset falls inside .text section. Operation blocked.")
                    if strict_download_failures:
                        had_eligible_failure = True
                    continue
                    
                # Parse version and option count from download link text for accuracy
                final_version_str, option_count = parse_trainer_version(download_text)
                
                if trainer_id is None:
                    insert_trainer = db.table('trainers').insert({
                        'game_id': game_id, 'version_str': final_version_str,
                        'option_count': option_count, 'original_file_hash': original_file_hash,
                        'original_file_size': original_file_size, 'is_packed': False
                    }).execute()
                    if not insert_trainer.data:
                        print("[-] Failed to insert trainer metadata.")
                        had_eligible_failure = True
                        continue
                    trainer_id = insert_trainer.data[0]['id']
                
                # Run translation engine
                # 자동 초안은 승인된 기존 매핑을 절대 덮어쓰지 않는 DB RPC로 저장한다.
                clean_orig_text = mapping_details['original_text'].replace('\x00', '').replace('\u0000', '')
                trainer_ok = True
                for language_code, translator in {
                    'ko': process_translation_block, 'ja': process_translation_block_ja,
                    'de': process_translation_block_de, 'es': process_translation_block_es
                }.items():
                    if language_code not in requested_locales or (language_code in approved_locales and not force):
                        continue
                    validation = None
                    retry_recorded = False
                    last_llm_provider = None
                    for attempt in range(1, 3):
                        prefer_openai_fallback = (
                            TRANSLATION_PROVIDER == "gemini"
                            and attempt == 2
                            and last_llm_provider == "Gemini"
                        )
                        try:
                            translated_text = translator(
                                mapping_details['original_text'], db,
                                prefer_openai_fallback=prefer_openai_fallback,
                            )
                        except Exception as locale_error:
                            retry_state, failure_code, delay_seconds = retry_failure_policy(locale_error)
                            schedule_translation_retry(
                                db, trainer_id, language_code, retry_state,
                                failure_code, delay_seconds,
                            )
                            retry_recorded = True
                            print(f"[locale-failed] trainer={trainer_id} locale={language_code} error={type(locale_error).__name__}")
                            validation = None
                            break
                        mapping = {
                            'trainer_id': trainer_id, 'offset_dec': mapping_details['offset_dec'],
                            'encoding': mapping_details['encoding'], 'original_text': clean_orig_text,
                            'translated_text': translated_text.replace('\x00', '').replace('\u0000', ''),
                            'max_char_len': mapping_details['max_char_len'], 'language_code': language_code,
                            'translation_provider': (
                                'openai_paid' if last_llm_provider == 'OpenAI Paid Fallback'
                                else TRANSLATION_PROVIDER
                            )
                        }
                        validation = validate_translation(
                            binary=exe_bytes, expected_sha256=original_file_hash,
                            expected_size=original_file_size, text_section=(text_start, text_end),
                            offset=mapping_details['offset_dec'], max_char_len=mapping_details['max_char_len'],
                            encoding=mapping_details['encoding'], original_text=clean_orig_text,
                            translated_text=mapping['translated_text'], option_count=option_count,
                            language_code=language_code,
                        )
                        if validation.ok or any(issue.structural for issue in validation.issues):
                            break
                        print(f"[validation-retry] trainer={trainer_id} locale={language_code} attempt={attempt} codes={','.join(validation.codes)}")
                        # Gemini 결과가 전체 검증에서만 실패했을 때에만 GPT를 한 번 보조 호출한다.
                        if not (
                            TRANSLATION_PROVIDER == "gemini"
                            and attempt == 1
                            and last_llm_provider == "Gemini"
                        ):
                            validation = None
                            break
                    if validation is None:
                        if not retry_recorded:
                            schedule_translation_retry(
                                db, trainer_id, language_code, "blocked", "VALIDATION_FAILED", 0,
                            )
                        trainer_ok = False
                        continue
                    outcome = save_validated_draft(db, mapping=mapping, validation=validation)
                    print(f"[save-outcome] trainer={trainer_id} locale={language_code} status={outcome.value}")
                    if outcome.value in {"approved", "preserved"}:
                        complete_translation_retry(db, trainer_id, language_code)
                    elif outcome.value == "rejected":
                        schedule_translation_retry(
                            db, trainer_id, language_code, "blocked", "VALIDATION_REJECTED", 0,
                        )
                        trainer_ok = False
                    elif outcome.value == "db_error":
                        schedule_translation_retry(
                            db, trainer_id, language_code, "deferred", "TRANSLATION_DB_TEMPORARY", 1800,
                        )
                        trainer_ok = False
                
                print(f"[번역 결과] trainer={trainer_id} game={game_id} success={trainer_ok}")
                any_registered = any_registered or trainer_ok
                if not trainer_ok:
                    had_eligible_failure = True
                
            except Exception as e:
                print(f"[-] Error processing download {download_url}: {e}")
                if target_eligible or strict_download_failures:
                    had_eligible_failure = True
                
        archive_only_skip = rar_skips > 0 and actionable_downloads == 0
        if archive_only_skip:
            print("[ARCHIVE_ONLY_PAGE_SKIPPED] no supported executable archive was available")
        return page_result(
            any_registered, approved_skips, had_eligible_failure,
            archive_only_skip=archive_only_skip,
        )
    except Exception as e:
        print(f"[-] Error processing page: {e}")
        return False

def page_result(
    any_registered: bool,
    approved_skips: int,
    had_eligible_failure: bool,
    archive_only_skip: bool = False,
) -> bool:
    """RAR만 있던 페이지는 중립 건너뜀으로, 지원 형식 실패는 실패로 반환한다."""
    if archive_only_skip:
        return not had_eligible_failure
    return (any_registered or approved_skips > 0) and not had_eligible_failure

def main():
    global TRANSLATION_PROVIDER
    parser = argparse.ArgumentParser(description="FLiNG Trainer Scraper Pipeline")
    parser.add_argument("--force", action="store_true", help="Force re-processing and overwriting of existing trainers")
    parser.add_argument("--url", type=str, help="Pinpoint scrape a single target FLiNG trainer URL")
    parser.add_argument("--trainer-id", type=int,
                        help="재시도 큐가 claim한 단일 trainer만 처리한다")
    parser.add_argument(
        "--provider", choices=["gemini", "azure", "openai_paid"], default="gemini",
        help="기본 번역기. gemini는 API/JSON 실패와 검증 실패 때만 GPT 보조 번역을 1회 사용합니다.",
    )
    parser.add_argument("--languages", nargs="+", choices=["ko", "ja", "de", "es"],
                        default=["ko", "ja", "de", "es"])
    parser.add_argument("--confirm-paid", action="store_true", help="OpenAI 유료 호출을 명시적으로 승인")
    args = parser.parse_args()
    if args.provider == "openai_paid" and not args.confirm_paid:
        parser.error("openai_paid 사용에는 --confirm-paid가 필요합니다")
    TRANSLATION_PROVIDER = args.provider
    
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("[-] Supabase environment credentials not configured.")
        sys.exit(1)
        
    db: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    print(f"[*] Scraper pipeline initialized (Force: {args.force}). Monitoring FLiNG feed...")
    
    # Load dynamic dictionary from Supabase
    try:
        dictionary_offset = 0
        dictionary_page_size = 1000
        while True:
            res = (db.table('common_dictionary')
                   .select('english_term, korean_translation, translated_ja')
                   .range(dictionary_offset, dictionary_offset + dictionary_page_size - 1)
                   .execute())
            if not res.data:
                break
            for row in res.data:
                eng_key = row['english_term'].lower().strip()
                db_dictionary_ko[eng_key] = row['korean_translation']
                if row.get('translated_ja'):
                    db_dictionary_ja[eng_key] = row['translated_ja']
            if len(res.data) < dictionary_page_size:
                break
            dictionary_offset += dictionary_page_size
        print(f"[+] DB 사전에서 한국어 {len(db_dictionary_ko)}개, 일본어 {len(db_dictionary_ja)}개를 불러왔습니다.")
    except Exception as e:
        print(f"[*] 동적 사전 테이블을 찾지 못해 로컬 사전을 사용합니다. 오류: {e}")
        
    if args.url:
        print(f"[*] Pinpoint scrape target URL: {args.url}")
        clean_url = args.url.strip().rstrip('/')
        game_slug = normalize_fling_slug(clean_url)
        game_title = game_slug.replace('-', ' ').title() + " Trainer"
        
        post = {
            'title': game_title,
            'link': args.url,
            'slug': game_slug
        }
        succeeded = scrape_and_patch_trainer(
            post,
            db,
            force=args.force,
            strict_download_failures=True,
            languages=args.languages,
            target_trainer_id=args.trainer_id,
        )
        return 0 if succeeded else 1


    posts = fetch_recent_trainers()
    if not posts:
        print("[-] No new updates found.")
        return 1
        
    # 예약 실행은 신규 바이너리/업데이트만 번역한다. 기존 pending/rejected는
    # 위의 reprocess_existing_unapproved=False 경로에서 LLM 호출 없이 건너뛴다.
    failed_pages = 0
    for post in posts[:20]:
        if not scrape_and_patch_trainer(
            post,
            db,
            force=args.force,
            languages=args.languages,
            reprocess_existing_unapproved=False,
        ):
            failed_pages += 1
    if failed_pages:
        print(f"[*] Batch completed with partial warnings: {failed_pages}/{min(len(posts), 20)} pages")
        
    sync_popular_fling_trainers(db)
    return 1 if failed_pages else 0



def sync_popular_fling_trainers(db: Client):
    """Scrapes the 'Popular Trainers' widget on FLiNG's home page and syncs is_popular and popularity_index."""
    url = 'https://flingtrainer.com/'
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
    try:
        response = requests.get(url, headers=headers, timeout=10)
        if response.status_code != 200:
            print(f'[-] Failed to scrape FLiNG index page for popular posts: {response.status_code}')
            return
            
        soup = BeautifulSoup(response.text, 'html.parser')
        popular_slugs = []
        for widget in soup.select('.widget'):
            title_elem = widget.select_one('.widget-title')
            if not title_elem:
                # fallback for some themes
                title_elem = widget.select_one('h3')
            if title_elem and ('popular' in title_elem.text.lower() or 'top' in title_elem.text.lower()):
                for a in widget.select('a'):
                    href = a.get('href', '')
                    if 'trainer' in href:
                        slug = normalize_fling_slug(href)
                        if slug not in popular_slugs:
                            popular_slugs.append(slug)
                break

        if not popular_slugs:
            print('[-] No popular trainers found on FLiNG homepage.')
            return

        print(f'[*] Found {len(popular_slugs)} popular trainers on FLiNG. Syncing...')
        
        # Reset all current popular games
        db.table('games').update({'is_popular': False, 'popularity_index': None}).neq('slug', 'dummy').execute()
        
        # Update new popular games
        for idx, slug in enumerate(popular_slugs):
            db.table('games').update({'is_popular': True, 'popularity_index': idx}).eq('slug', slug).execute()
            
        print('[+] Successfully synced popular trainers.')
        
    except Exception as e:
        print(f'[-] Error syncing popular trainers: {e}')

if __name__ == "__main__":
    raise SystemExit(main())

