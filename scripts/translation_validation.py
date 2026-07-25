"""트레이너 번역을 자동 승인하기 전에 바이너리 안전성과 번역 품질을 검사한다."""

from dataclasses import dataclass, field
from enum import Enum
import hashlib
import re
from typing import Optional, Tuple

FAILURE_TOKENS = ("translation_error", "translation failed", "todo", "undefined", "번역 실패", "翻訳失敗")
AI_META_PATTERNS = (r"\bas an ai\b", r"\bhere(?:'s| is) (?:the )?translation\b", r"^(?:sure|certainly)[,!:\s]", r"번역(?:문|결과)은", r"以下(?:が|は).{0,10}翻訳")
PLACEHOLDER_RE = re.compile(r"\{\{?[^{}\n]+\}?\}|<[^<>\n]+>|_{3,}")
KEY = r"(?:Num(?:Pad)?\s*(?:[0-9]|Plus|Minus|Decimal|Divide|Multiply|[+\-./*])|F(?:[1-9]|1[0-9]|2[0-4])|Ctrl|Alt|Shift|Home|End|Insert|Delete|PageUp|PageDown|Up|Down|Left|Right|Arrow(?:Up|Down|Left|Right)|Bracket(?:Left|Right)|[\[\]]|[A-Z0-9])"
HOTKEY_RE = re.compile(rf"^\s*{KEY}(?:\s*\+\s*{KEY})*\s*(?:-|–|—|:|：)\s*(.+?)\s*$", re.I)
ENGLISH_WORD_RE = re.compile(r"[A-Za-z]{3,}")
ALLOWED_ENGLISH = {"hp", "mp", "xp", "fps", "npc", "ai", "cpu", "gpu", "dlc", "steam", "ctrl", "alt", "shift", "home", "end", "insert", "delete", "numpad", "num"}


@dataclass(frozen=True)
class ValidationIssue:
    code: str
    message: str
    structural: bool = False


@dataclass
class ValidationResult:
    ok: bool
    issues: list[ValidationIssue] = field(default_factory=list)
    patched_bytes: Optional[bytes] = None

    @property
    def codes(self):
        return [issue.code for issue in self.issues]


class SaveOutcome(Enum):
    APPROVED = "approved"
    PRESERVED = "preserved"
    REJECTED = "rejected"
    DB_ERROR = "db_error"


def _codec(encoding):
    normalized = encoding.upper().replace("_", "-")
    if normalized == "UTF-16LE":
        return "utf-16-le"
    if normalized == "ASCII":
        return "ascii"
    if normalized == "UTF-8":
        return "utf-8"
    raise ValueError(encoding)


def _options(text):
    return [line.strip() for line in text.replace("\r\n", "\n").split("\n") if HOTKEY_RE.match(line)]


def _same_source(source, translated):
    src, dst = _options(source), _options(translated)
    if not src or len(src) != len(dst):
        return source.strip() == translated.strip()
    pairs = [(HOTKEY_RE.match(a).group(1).strip().casefold(), HOTKEY_RE.match(b).group(1).strip().casefold()) for a, b in zip(src, dst)]
    comparable = [a == b for a, b in pairs if len(a) >= 3]
    return bool(comparable) and sum(comparable) / len(comparable) > 0.5


def validate_translation(*, binary: bytes, expected_sha256: str, expected_size: int,
                         text_section: Tuple[int, int], offset: int, max_char_len: int,
                         encoding: str, original_text: str, translated_text: str,
                         option_count: int, language_code: str) -> ValidationResult:
    """통과 시 원본이 아닌 메모리 복사본에만 패치한 결과를 반환한다."""
    issues = []
    if not binary.startswith(b"MZ"):
        issues.append(ValidationIssue("INVALID_PE_HEADER", "MZ 헤더 없음", True))
    if len(binary) != expected_size:
        issues.append(ValidationIssue("FILE_SIZE_MISMATCH", "파일 크기 불일치", True))
    if not re.fullmatch(r"[0-9a-fA-F]{64}", expected_sha256 or ""):
        issues.append(ValidationIssue("INVALID_HASH_FORMAT", "SHA-256 형식 오류", True))
    elif hashlib.sha256(binary).hexdigest().casefold() != expected_sha256.casefold():
        issues.append(ValidationIssue("HASH_MISMATCH", "파일 해시 불일치", True))
    try:
        codec = _codec(encoding)
    except ValueError:
        codec = "utf-8"
        issues.append(ValidationIssue("UNSUPPORTED_ENCODING", "미지원 인코딩", True))
    capacity = max_char_len * 2 if codec == "utf-16-le" else max_char_len
    if offset < 0 or max_char_len <= 0 or offset + capacity > len(binary):
        issues.append(ValidationIssue("OFFSET_OUT_OF_RANGE", "슬롯이 파일 범위를 벗어남", True))
    text_start, text_end = text_section
    if max(offset, text_start) < min(offset + max(capacity, 0), text_end):
        issues.append(ValidationIssue("TEXT_SECTION_OVERLAP", "실행 코드 영역과 겹침", True))
    if not original_text.strip() or not translated_text.strip():
        issues.append(ValidationIssue("EMPTY_TRANSLATION", "원문 또는 번역문이 비어 있음"))
    lowered = translated_text.casefold()
    if any(token in lowered for token in FAILURE_TOKENS) or PLACEHOLDER_RE.search(translated_text):
        issues.append(ValidationIssue("FAILURE_TOKEN", "실패 문구 또는 자리표시자 포함"))
    if any(re.search(pattern, translated_text, re.I) for pattern in AI_META_PATTERNS):
        issues.append(ValidationIssue("AI_META_TEXT", "AI 설명 문구 포함"))
    src_options, dst_options = _options(original_text), _options(translated_text)
    if option_count > 0 and len(src_options) != option_count:
        issues.append(ValidationIssue("SOURCE_OPTION_COUNT_MISMATCH", "원문 옵션 수 불일치"))
    if len(src_options) != len(dst_options):
        issues.append(ValidationIssue("TRANSLATED_OPTION_COUNT_MISMATCH", "번역 옵션 수 불일치"))
    if _same_source(original_text, translated_text):
        issues.append(ValidationIssue("SAME_AS_SOURCE", "번역 대상이 원문과 동일"))
    words = [w.casefold() for w in ENGLISH_WORD_RE.findall(translated_text) if w.casefold() not in ALLOWED_ENGLISH]
    local_chars = re.search(r"[가-힣]", translated_text) if language_code == "ko" else re.search(r"[\u3040-\u30ff\u3400-\u9fff]", translated_text)
    if language_code in {"ko", "ja"} and len(words) >= 4 and not local_chars:
        issues.append(ValidationIssue("ENGLISH_LEAK", "영어 설명이 과도하게 남음"))
    try:
        encoded = translated_text.encode(codec, errors="strict")
        if encoded.decode(codec, errors="strict") != translated_text:
            issues.append(ValidationIssue("ENCODING_ROUNDTRIP_FAILED", "인코딩 왕복 실패"))
        if len(encoded) > capacity:
            issues.append(ValidationIssue("BYTE_LIMIT_EXCEEDED", "슬롯 바이트 용량 초과"))
    except UnicodeError:
        encoded = b""
        issues.append(ValidationIssue("ENCODING_ERROR", "인코딩 변환 실패"))
    if issues:
        return ValidationResult(False, issues)
    patched = bytearray(binary)
    before = bytes(patched)
    patched[offset:offset + capacity] = encoded + b"\x00" * (capacity - len(encoded))
    changed = [i for i, (old, new) in enumerate(zip(before, patched)) if old != new]
    if len(patched) != len(binary) or any(i < offset or i >= offset + capacity for i in changed):
        return ValidationResult(False, [ValidationIssue("PATCH_SIMULATION_FAILED", "허용 슬롯 밖 변경", True)])
    if bytes(patched[offset:offset + len(encoded)]).decode(codec, errors="strict") != translated_text:
        return ValidationResult(False, [ValidationIssue("PATCH_REREAD_FAILED", "패치 재읽기 실패", True)])
    return ValidationResult(True, patched_bytes=bytes(patched))


def save_validated_draft(db, *, mapping: dict, validation: ValidationResult) -> SaveOutcome:
    """기존 승인본은 보존하고 정확한 미승인 슬롯만 승인 또는 거절한다."""
    try:
        result = db.rpc("upsert_translation_drafts", {"p_mappings": [mapping]}).execute()
        saved = bool((result.data or {}).get("results", [{}])[0].get("saved", False))
        if not saved:
            return SaveOutcome.PRESERVED
        next_status = "approved" if validation.ok else "rejected"
        response = (db.table("translation_mappings")
           .update({"is_approved": validation.ok, "translation_status": next_status})
           .eq("trainer_id", mapping["trainer_id"])
           .eq("language_code", mapping["language_code"])
           .eq("offset_dec", mapping["offset_dec"])
           .eq("is_approved", False).select("id")
           .execute())
    except Exception:
        return SaveOutcome.DB_ERROR
    # 저장 대상이 정확히 한 행이 아니면 성공으로 기록하지 않는다.
    if len(response.data or []) != 1:
        return SaveOutcome.DB_ERROR
    return SaveOutcome.APPROVED if validation.ok else SaveOutcome.REJECTED
