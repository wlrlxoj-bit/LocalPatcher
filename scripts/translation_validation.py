"""트레이너 번역을 자동 승인하기 전에 바이너리 안전성과 번역 완전성을 검증한다."""

from dataclasses import dataclass, field
from enum import Enum
import hashlib
import json
import re
from typing import Optional, Tuple

FAILURE_TOKENS = (
    "translation_error", "translation failed", "todo", "undefined", "번역 실패",
)
AI_META_PATTERNS = (
    r"\bas an ai\b",
    r"\bhere(?:'s| is) (?:the )?translation\b",
    r"^(?:sure|certainly)[,!:\s]",
    r"번역(?:문| 결과)?는",
)
PLACEHOLDER_RE = re.compile(r"\{\{?[^{}\n]+\}?\}|<[^<>\n]+>|_{3,}")
KEY = (
    r"(?:Num(?:Pad)?\s*(?:[0-9]|Plus|Minus|Decimal|Divide|Multiply|[+\-./*])"
    r"|F(?:[1-9]|1[0-9]|2[0-4])|Ctrl|Alt|Shift|Home|End|Insert|Delete"
    r"|PageUp|PageDown|Up|Down|Left|Right|Arrow(?:Up|Down|Left|Right)"
    r"|Bracket(?:Left|Right)|[\[\]]|[A-Z0-9])"
)
# 긴 토큰을 먼저 배치해 `->`가 `-`로 부분 매칭되지 않게 한다.
OPTION_RE = re.compile(
    rf"^(\s*{KEY}(?:\s*\+\s*{KEY})*)(\s*(?:->|—|–|→|-|:)\s*)(.+?)\s*$",
    re.I,
)
OPTION_CANDIDATE_RE = re.compile(
    rf"^\s*{KEY}(?=\s*(?:\+|->|—|–|→|-|:|=))",
    re.I,
)
ENGLISH_WORD_RE = re.compile(r"[A-Za-z]{3,}")
ALLOWED_ENGLISH = {
    "hp", "mp", "xp", "fps", "npc", "ai", "cpu", "gpu", "dlc", "steam",
    "ctrl", "alt", "shift", "home", "end", "insert", "delete", "numpad", "num",
}


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
    counts: dict[str, int] = field(default_factory=dict)

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


def parse_option_line(line):
    """단일 옵션 줄을 `(prefix, delimiter, label)`로 파싱한다."""
    match = OPTION_RE.match(line)
    return match.groups() if match else None


def is_option_candidate(line):
    """지원 키로 시작하고 뒤에 modifier 또는 구분자 형태가 오는 옵션 후보인지 판정한다."""
    return bool(OPTION_CANDIDATE_RE.match(line))


def parse_options(text):
    """옵션 줄만 `(prefix, delimiter, label)`로 파싱하고 입력 순서를 보존한다."""
    parsed = []
    for line in text.replace("\r\n", "\n").split("\n"):
        option = parse_option_line(line)
        if option:
            parsed.append(option)
    return parsed


def _same_source(source, translated):
    src, dst = parse_options(source), parse_options(translated)
    if not src or len(src) != len(dst):
        return source.strip() == translated.strip()
    comparable = [
        source_label.strip().casefold() == translated_label.strip().casefold()
        for (_, _, source_label), (_, _, translated_label) in zip(src, dst)
        if len(source_label.strip()) >= 3
    ]
    return bool(comparable) and sum(comparable) / len(comparable) > 0.5


def _safe_api_error_fields(exc):
    """Supabase APIError에서 안전 문자로 된 짧은 code만 추출한다."""
    if type(exc).__name__ != "APIError":
        return {}
    source = {}
    for item in getattr(exc, "args", ()):
        if isinstance(item, dict):
            source.update(item)
    value = getattr(exc, "code", None)
    if value is None:
        value = source.get("code")
    if not isinstance(value, (str, int, float, bool)) or value == "":
        return {}
    code = str(value).replace("\r", "").replace("\n", "")[:100]
    if not re.fullmatch(r"[A-Za-z0-9_-]+", code):
        return {}
    return {"code": code}


def _log_save_error(mapping, exc):
    """비밀·요청 payload 없이 저장 자연키와 허용된 API 진단만 한 줄로 기록한다."""
    event = {
        "event": "translation-save-error",
        "trainer_id": mapping.get("trainer_id"),
        "locale": mapping.get("language_code"),
        "offset": mapping.get("offset_dec"),
        "exception_type": type(exc).__name__,
    }
    event.update(_safe_api_error_fields(exc))
    print(json.dumps(event, ensure_ascii=False, separators=(",", ":")))


def validate_translation(*, binary: bytes, expected_sha256: str, expected_size: int,
                         text_section: Tuple[int, int], offset: int, max_char_len: int,
                         encoding: str, original_text: str, translated_text: str,
                         option_count: int, language_code: str) -> ValidationResult:
    """원본 복사본에만 패치를 모의 적용하고 검증 결과를 반환한다."""
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
        issues.append(ValidationIssue("UNSUPPORTED_ENCODING", "지원하지 않는 인코딩", True))
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

    src_parts = parse_options(original_text)
    dst_parts = parse_options(translated_text)
    src_unparsed = [
        line for line in original_text.replace("\r\n", "\n").split("\n")
        if is_option_candidate(line) and parse_option_line(line) is None
    ]
    dst_unparsed = [
        line for line in translated_text.replace("\r\n", "\n").split("\n")
        if is_option_candidate(line) and parse_option_line(line) is None
    ]
    counts = {
        "display_option_count": max(option_count, 0),
        "source_patchable_count": len(src_parts),
        "translated_patchable_count": len(dst_parts),
    }
    if src_unparsed:
        issues.append(ValidationIssue(
            "SOURCE_OPTION_PARSE_FAILED",
            f"원문 옵션 후보 {len(src_unparsed)}개를 파싱하지 못함",
        ))
    if dst_unparsed:
        issues.append(ValidationIssue(
            "TRANSLATED_OPTION_PARSE_FAILED",
            f"번역 옵션 후보 {len(dst_unparsed)}개를 파싱하지 못함",
        ))
    if len(src_parts) != len(dst_parts):
        issues.append(ValidationIssue(
            "TRANSLATED_OPTION_COUNT_MISMATCH", "원문과 번역문의 실제 옵션 수 불일치"
        ))
    elif not src_parts:
        issues.append(ValidationIssue("OPTION_PARSE_EMPTY", "패치 가능한 옵션을 파싱하지 못함"))
    else:
        for index, (source, translated) in enumerate(zip(src_parts, dst_parts)):
            if source[:2] != translated[:2]:
                issues.append(ValidationIssue(
                    "HOTKEY_FORMAT_MISMATCH",
                    f"옵션 {index + 1}의 단축키 접두부 또는 구분자가 원문과 다름",
                ))
                break

    if _same_source(original_text, translated_text):
        issues.append(ValidationIssue("SAME_AS_SOURCE", "번역 대상이 원문과 동일"))
    words = [
        word.casefold() for word in ENGLISH_WORD_RE.findall(translated_text)
        if word.casefold() not in ALLOWED_ENGLISH
    ]
    local_chars = (
        re.search(r"[가-힣]", translated_text)
        if language_code == "ko"
        else re.search(r"[\u3040-\u30ff\u3400-\u9fff]", translated_text)
    )
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
        return ValidationResult(False, issues, counts=counts)

    patched = bytearray(binary)
    before = bytes(patched)
    patched[offset:offset + capacity] = encoded + b"\x00" * (capacity - len(encoded))
    changed = [index for index, (old, new) in enumerate(zip(before, patched)) if old != new]
    if len(patched) != len(binary) or any(
        index < offset or index >= offset + capacity for index in changed
    ):
        return ValidationResult(
            False,
            [ValidationIssue("PATCH_SIMULATION_FAILED", "허용 슬롯 밖 변경", True)],
            counts=counts,
        )
    reread = bytes(patched[offset:offset + len(encoded)]).decode(codec, errors="strict")
    if reread != translated_text:
        return ValidationResult(
            False,
            [ValidationIssue("PATCH_REREAD_FAILED", "패치 재읽기 실패", True)],
            counts=counts,
        )
    return ValidationResult(True, patched_bytes=bytes(patched), counts=counts)


def save_validated_draft(db, *, mapping: dict, validation: ValidationResult) -> SaveOutcome:
    """승인본을 보존하고 자연키로 정확히 저장된 미승인 초안만 상태 전환한다."""
    try:
        result = db.rpc("upsert_translation_drafts", {"p_mappings": [mapping]}).execute()
        saved = bool((result.data or {}).get("results", [{}])[0].get("saved", False))
        if not saved:
            return SaveOutcome.PRESERVED
        next_status = "approved" if validation.ok else "rejected"
        (db.table("translation_mappings")
         .update({"is_approved": validation.ok, "translation_status": next_status})
         .eq("trainer_id", mapping["trainer_id"])
         .eq("language_code", mapping["language_code"])
         .eq("offset_dec", mapping["offset_dec"])
         .eq("is_approved", False)
         .execute())
        response = (db.table("translation_mappings")
                    .select("id,is_approved,translation_status")
                    .eq("trainer_id", mapping["trainer_id"])
                    .eq("language_code", mapping["language_code"])
                    .eq("offset_dec", mapping["offset_dec"])
                    .execute())
    except Exception as exc:
        _log_save_error(mapping, exc)
        return SaveOutcome.DB_ERROR

    if len(response.data or []) != 1:
        return SaveOutcome.DB_ERROR
    saved_row = response.data[0]
    if (saved_row.get("is_approved") is not validation.ok
            or saved_row.get("translation_status") != next_status):
        return SaveOutcome.DB_ERROR
    return SaveOutcome.APPROVED if validation.ok else SaveOutcome.REJECTED
