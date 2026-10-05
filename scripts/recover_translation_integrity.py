"""승인 매핑을 보존한 채 동일 바이너리의 누락 언어 슬롯만 자동 복구한다."""

import argparse
import hashlib
import io
import os
import re
import sys
import zipfile

from dotenv import load_dotenv
from supabase import create_client

import scraper
from translation_validation import parse_options, validate_translation

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env.local"), override=True)

TARGET_LOCALES = ("ko", "ja", "de", "es")


def _slot_signature(slot):
    """스캐너·DB 슬롯을 같은 불변 튜플로 비교한다."""
    return (
        slot["offset_dec"], slot["encoding"], slot["max_char_len"],
        slot["original_text"],
    )


def _all_offsets(data, needle, step=1):
    """겹치는 바이트 후보도 빠뜨리지 않고 반환한다."""
    offset = 0
    while True:
        found = data.find(needle, offset)
        if found < 0:
            return
        yield found
        offset = found + step


def scan_option_blocks(binary, text_section):
    """PE의 비실행 영역에서 완결된 ASCII/UTF-16LE 옵션 버퍼만 읽어 반환한다.

    기존 승인 원문과의 정확 비교 전에만 사용하는 읽기 전용 스캐너다. 경계가
    불명확하거나 `.text`와 한 바이트라도 겹치는 후보는 결과에 넣지 않는다.
    """
    if not isinstance(binary, (bytes, bytearray)) or text_section is None:
        return ()
    try:
        text_start = int(text_section.PointerToRawData)
        text_end = text_start + int(text_section.SizeOfRawData)
    except (AttributeError, TypeError, ValueError):
        return ()
    if text_start < 0 or text_end < text_start:
        return ()

    # FLiNG의 기존 단일 스캐너와 같은 hotkey anchor를 쓰되, 모든 후보를 검사한다.
    formats = (
        ("ASCII", b"Num 1", b"\n\n", b"\x00\x00", 1, "ascii"),
        ("UTF-16LE", b"N\x00u\x00m\x00 \x001\x00", b"\n\x00\n\x00", b"\x00\x00\x00\x00", 2, "utf-16-le"),
    )
    candidates = {}
    for encoding, marker, separator, terminator, unit, codec in formats:
        for marker_offset in _all_offsets(binary, marker, unit):
            # UTF-16LE의 코드 유닛·구분자·슬롯은 파일 절대 오프셋 기준으로도 짝수여야 한다.
            # 우연히 홀수 위치에서 일치한 바이트열은 절대 슬롯으로 해석하지 않는다.
            if encoding == "UTF-16LE" and marker_offset % 2:
                continue
            lower_bound = max(0, marker_offset - 1000)
            separator_offset = binary.rfind(separator, lower_bound, marker_offset)
            if separator_offset < 0:
                continue
            start = separator_offset + len(separator)
            # separator 끝이 첫 hotkey의 시작점과 정확히 맞는 정상 block을 허용한다.
            if (encoding == "UTF-16LE" and (separator_offset % 2 or start % 2)) or start > marker_offset or (marker_offset - start) % unit:
                continue
            upper_bound = min(len(binary), marker_offset + 8000)
            # UTF-16LE의 마지막 문자 상위 바이트(\x00)와 뒤의 널 종료자는 연속된
            # 0 바이트가 된다. 단순 ``find``는 그 문자 내부에서 시작하는 4-byte
            # terminator를 먼저 찾을 수 있으므로, 슬롯 시작과 같은 code-unit 경계의
            # 종료자만 선택한다.
            end = binary.find(terminator, marker_offset, upper_bound)
            while end >= 0 and (end % unit or (end - start) % unit):
                end = binary.find(terminator, end + 1, upper_bound)
            if end < 0 or end <= start:
                continue
            capacity = end - start
            if capacity <= 0 or capacity > 8000 or start + capacity > len(binary):
                continue
            # 슬롯 전체가 실행 코드와 분리돼야 한다. 시작점만 보는 것은 안전하지 않다.
            if max(start, text_start) < min(start + capacity, text_end):
                continue
            raw = bytes(binary[start:end])
            if (encoding == "ASCII" and b"\x00" in raw) or len(raw) % unit:
                continue
            try:
                original_text = raw.decode(codec, errors="strict")
            except UnicodeDecodeError:
                continue
            parsed = parse_options(original_text)
            if not parsed or not any(prefix.strip().casefold().startswith("num 1") for prefix, _delimiter, _label in parsed):
                continue
            slot = {
                "offset_dec": start,
                "encoding": encoding,
                "max_char_len": capacity // unit,
                "original_text": original_text,
            }
            signature = _slot_signature(slot)
            range_key = (start, start + capacity)
            prior = candidates.get(range_key)
            # 같은 블록에서 Num 1이 여러 번 보여도 동일 signature 한 개만 남긴다.
            # 같은 범위에서 서로 다른 해석은 모호하므로 전체 scan을 실패 처리한다.
            if prior is not None and _slot_signature(prior) != signature:
                return ()
            candidates[range_key] = slot

    ordered_ranges = sorted(candidates)
    previous_end = -1
    for start, end in ordered_ranges:
        if start < previous_end:
            return ()
        previous_end = end
    return tuple(candidates[key] for key in ordered_ranges)


def safe_code(value, default="RECOVERY_FAILED"):
    """운영 로그와 DB에는 정해진 대문자 진단 코드만 남긴다."""
    text = str(value or "")
    return text if text.isupper() and text.replace("_", "").isalnum() and len(text) <= 80 else default


def finish(db, claim, state, code=None, delay_seconds=0):
    """큐 상태 변경 실패를 감추지 않고 집계 가능한 한 줄만 출력한다."""
    try:
        result = db.rpc("finish_translation_integrity_recovery_v2", {
            "p_trainer_id": claim["trainer_id"], "p_lease_token": claim["lease_token"], "p_state": state,
            "p_failure_code": safe_code(code) if code else None,
            "p_delay_seconds": delay_seconds,
        }).execute()
        return result.data is True
    except Exception:
        print("[INTEGRITY_QUEUE_FINISH_FAILED]")
        return False


def renew_lease(db, claim):
    """긴 외부 작업 전에 현재 worker의 lease만 30분 연장한다."""
    try:
        result = db.rpc("renew_translation_integrity_recovery_lease_v2", {
            "p_trainer_id": claim["trainer_id"],
            "p_lease_token": claim["lease_token"],
        }).execute()
        return result.data is True
    except Exception:
        return False


def lease_renewal_failed(db, claim):
    """lease가 유효하면 defer하고, 이미 만료됐으면 DB 변경 없이 즉시 종료한다."""
    finish(db, claim, "deferred", "LEASE_RENEWAL_FAILED", 1800)
    return False


def get_mappings(db, trainer_id):
    result = (db.table("translation_mappings")
              .select("id,language_code,offset_dec,encoding,max_char_len,original_text,translated_text,is_approved,translation_provider,translation_status")
              .eq("trainer_id", trainer_id).execute())
    return result.data or []


def preflight_slots(rows, option_count):
    """분할 offset을 보존하며, 승인 source slot에 없는 target slot만 계획한다."""
    if not rows:
        return None, (), "NO_APPROVED_SOURCE"
    approved = [row for row in rows if row.get("is_approved") is True]
    if not approved:
        return None, (), "NO_APPROVED_SOURCE"
    source_by_offset = {}
    for row in approved:
        signature = tuple(row.get(key) for key in ("offset_dec", "encoding", "max_char_len", "original_text"))
        if not isinstance(signature[0], int) or not isinstance(signature[2], int):
            return None, (), "APPROVED_SLOT_CONFLICT"
        prior = source_by_offset.get(signature[0])
        if prior is not None and prior != signature:
            return None, (), "APPROVED_SLOT_CONFLICT"
        source_by_offset[signature[0]] = signature
    # content-eligibility와 같은 실제 옵션 라벨 누적 기준이다. 분할된 offset은 합산한다.
    coverage = {locale: sum(len(parse_options(str(row.get("original_text") or ""))) for row in approved if row.get("language_code") == locale) for locale in TARGET_LOCALES}
    if all(count >= option_count for count in coverage.values()):
        return {}, (), None
    targets = {}
    for row in rows:
        key = (row.get("language_code"), row.get("offset_dec"))
        targets.setdefault(key, []).append(row)
    plan = []
    for offset, signature in source_by_offset.items():
        for locale in TARGET_LOCALES:
            candidates = targets.get((locale, offset), [])
            if not candidates:
                plan.append((locale, signature))
                continue
            # 중복 행은 dict overwrite로 숨기지 않는다. 승인/수동이라도 원문 슬롯이
            # 정확히 하나로 일치하지 않으면 자동 수정 범위를 벗어난다.
            if len(candidates) != 1:
                return None, (), "TARGET_SLOT_CONFLICT"
            target = candidates[0]
            target_signature = tuple(target.get(key) for key in ("offset_dec", "encoding", "max_char_len", "original_text"))
            immutable = target.get("is_approved") is True or target.get("translation_provider") == "manual"
            if not immutable or target_signature != signature:
                return None, (), "TARGET_SLOT_CONFLICT"
            # immutable target: preserved, never overwritten.
    return source_by_offset, tuple(plan), None


def conservative_recovery_batch_upper_bound(rows):
    """원본 다운로드 전, immutable·동일 원문 슬롯만 제외한 안전 상한을 계산한다.

    pending·거절·중복·원문 불일치 target은 누락을 덮어쓰는 근거가 될 수 없으므로
    ``None``을 반환해 caller가 외부 호출 전에 fail-closed 한다.
    """
    source_by_offset = {}
    targets = {}
    for row in rows:
        offset = row.get("offset_dec")
        if row.get("language_code") in TARGET_LOCALES and isinstance(offset, int):
            targets.setdefault((row.get("language_code"), offset), []).append(row)
        if row.get("is_approved") is not True:
            continue
        signature = tuple(row.get(key) for key in ("offset_dec", "encoding", "max_char_len", "original_text"))
        if not isinstance(signature[0], int) or not isinstance(signature[2], int):
            return None
        prior = source_by_offset.get(offset)
        if prior is not None and prior != signature:
            return None
        source_by_offset[offset] = signature

    missing = 0
    for offset, source_signature in source_by_offset.items():
        for locale in TARGET_LOCALES:
            candidates = targets.get((locale, offset), [])
            if not candidates:
                missing += 1
                continue
            if len(candidates) != 1:
                return None
            target = candidates[0]
            target_signature = tuple(target.get(key) for key in ("offset_dec", "encoding", "max_char_len", "original_text"))
            immutable = target.get("is_approved") is True or target.get("translation_provider") == "manual"
            if not immutable or target_signature != source_signature:
                return None
    return missing


def scanner_slots_are_exact_superset(existing_slots, scanner_slots):
    """모든 승인 source tuple은 스캐너 결과에 정확히 한 번 있어야 한다."""
    if len(set(scanner_slots)) != len(scanner_slots):
        return False
    return all(sum(slot == existing for slot in scanner_slots) == 1 for existing in existing_slots)


def extract_current_executable(source_url):
    """FLiNG의 최신 지원 ZIP/EXE에서 실행 파일 하나만 메모리로 읽는다."""
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
    response = scraper.paced_fling_get(source_url, headers=headers, timeout=15)
    if response.status_code in {403, 429}:
        return None, "UPSTREAM_TEMPORARY"
    if response.status_code != 200:
        return None, "SOURCE_PAGE_UNAVAILABLE"
    anchors = scraper.BeautifulSoup(response.text, "html.parser").select('a[href*="/downloads/"]')
    selected, _ = scraper.latest_supported_download(anchors)
    if selected is None:
        return None, "NO_SUPPORTED_DOWNLOAD"
    download = scraper.paced_fling_get(selected["href"], headers=headers, timeout=30)
    download = scraper.recover_official_archive(download, headers)
    if download.status_code in {403, 429}:
        return None, "UPSTREAM_TEMPORARY"
    if download.status_code != 200 or not download.content:
        return None, "DOWNLOAD_UNAVAILABLE"
    if scraper.is_rar_archive(selected["href"], download.content):
        return None, "ARCHIVE_RAR_ONLY"
    if selected["href"].endswith(".zip") or download.content[:2] == b"PK":
        try:
            with zipfile.ZipFile(io.BytesIO(download.content)) as archive:
                name = next((item for item in archive.namelist() if item.lower().endswith(".exe")), None)
                return (archive.read(name), None) if name else (None, "EXECUTABLE_NOT_FOUND")
        except (OSError, zipfile.BadZipFile):
            return None, "ARCHIVE_INVALID"
    return (download.content, None) if download.content[:2] == b"MZ" else (None, "EXECUTABLE_NOT_FOUND")


def identity_matches(binary, claim):
    """해시·크기·PE 형식이 현재 등록된 원본과 같을 때만 복구를 허용한다."""
    expected_hash, expected_size = claim.get("original_file_hash"), claim.get("original_file_size")
    if not isinstance(expected_hash, str) or len(expected_hash) != 64 or not isinstance(expected_size, int):
        return "TRAINER_IDENTITY_INVALID"
    if len(binary) != expected_size or hashlib.sha256(binary).hexdigest().casefold() != expected_hash.casefold():
        return "SOURCE_IDENTITY_MISMATCH"
    section = scraper.parse_pe_binary(binary)
    if not section:
        return "SOURCE_SLOT_UNREADABLE"
    return None


def apply_prepared_batch(db, claim, prepared):
    """검증 완료한 전 슬롯을 DB 단일 트랜잭션으로만 승인한다."""
    batch = []
    for mapping, _validation in prepared:
        batch.append({
            "source": {
                "offset_dec": mapping["offset_dec"],
                "encoding": mapping["encoding"],
                "max_char_len": mapping["max_char_len"],
                "original_text": mapping["original_text"],
            },
            "mapping": mapping,
        })
    try:
        result = db.rpc("apply_translation_integrity_recovery_v2", {
            "p_trainer_id": claim["trainer_id"],
            "p_lease_token": claim["lease_token"],
            "p_batch": batch,
        }).execute()
        return isinstance(result.data, dict) and result.data.get("applied") == len(batch)
    except Exception:
        return False


def prepare_missing_slot(db, *, claim, binary, text_section, locale, source):
    """누락 슬롯의 번역과 모의 패치를 준비만 한다. 이 단계는 DB를 변경하지 않는다."""
    translator = {'ko': scraper.process_translation_block, 'ja': scraper.process_translation_block_ja,
                  'de': scraper.process_translation_block_de, 'es': scraper.process_translation_block_es}[locale]
    scraper.last_llm_provider = None
    translated = translator(source[3], db, prefer_openai_fallback=False)
    mapping = {'trainer_id': claim['trainer_id'], 'language_code': locale, 'offset_dec': source[0],
               'encoding': source[1], 'max_char_len': source[2], 'original_text': source[3],
               'translated_text': translated.replace('\x00', '').replace('\u0000', ''),
               'translation_provider': 'openai_paid' if scraper.last_llm_provider == 'OpenAI Paid Fallback' else scraper.TRANSLATION_PROVIDER}
    validation = validate_translation(binary=binary, expected_sha256=claim['original_file_hash'],
        expected_size=claim['original_file_size'], text_section=text_section, offset=source[0],
        max_char_len=source[2], encoding=source[1], original_text=source[3],
        translated_text=mapping['translated_text'], option_count=claim['option_count'], language_code=locale)
    if not validation.ok:
        return None
    return mapping, validation


def process_claim(db, claim, provider):
    """한 claim을 처리한다. 승인·수동 행은 어떤 경로에서도 update/delete하지 않는다."""
    trainer_id = claim.get("trainer_id")
    if not isinstance(trainer_id, int) or not claim.get("lease_token") or not scraper.is_official_fling_trainer_url(claim.get("fling_url")):
        return finish(db, claim, "blocked", "SOURCE_URL_INVALID") if isinstance(trainer_id, int) and claim.get("lease_token") else False
    try:
        rows = get_mappings(db, trainer_id)
    except Exception:
        return finish(db, claim, "deferred", "MAPPING_READ_FAILED", 1800)
    # 원본 다운로드·LLM 호출 전에 DB snapshot만으로도 최대 batch를 보수적으로
    # 계산할 수 있다. 한도를 넘는 대상은 이후 단계로 진행하지 않는다.
    batch_upper_bound = conservative_recovery_batch_upper_bound(rows)
    if batch_upper_bound is None:
        return finish(db, claim, "blocked", "TARGET_SLOT_CONFLICT")
    if batch_upper_bound > 64:
        return finish(db, claim, "blocked", "RECOVERY_BATCH_TOO_LARGE")
    source_slots, plan, problem = preflight_slots(rows, claim.get('option_count'))
    if problem:
        return finish(db, claim, "blocked", problem)
    if not plan:
        return finish(db, claim, "blocked", "OPTION_COVERAGE_INCOMPLETE")
    # 위의 보수적 상한 이후에도 실제 plan을 다시 확인한다. 이중 검사는
    # DB snapshot 해석 변경으로 RPC 한도를 넘겨 번역 비용을 낭비하지 않게 한다.
    if len(plan) > 64:
        return finish(db, claim, "blocked", "RECOVERY_BATCH_TOO_LARGE")
    # 다운로드는 FLiNG의 지연·재시도로 오래 걸릴 수 있다. lease 확인에 실패하면
    # 이 worker는 원본 요청과 이후 apply를 모두 포기한다.
    if not renew_lease(db, claim):
        return lease_renewal_failed(db, claim)
    binary, download_problem = extract_current_executable(claim["fling_url"])
    if download_problem:
        state = "deferred" if download_problem in {"UPSTREAM_TEMPORARY", "DOWNLOAD_UNAVAILABLE"} else "blocked"
        return finish(db, claim, state, download_problem, 10800 if state == "deferred" else 0)
    identity_problem = identity_matches(binary, claim)
    if identity_problem:
        return finish(db, claim, "blocked", identity_problem)
    section = scraper.parse_pe_binary(binary)
    scanner_slots = tuple(_slot_signature(slot) for slot in scan_option_blocks(binary, section))
    # 이번에 쓰지 않는 기존 분할 슬롯까지 모두 현재 원본에서 유일하게 일치해야 한다.
    # 하나라도 빠지거나 다르면 부분 생성 없이 종료한다.
    if not scanner_slots_are_exact_superset(tuple(source_slots.values()), scanner_slots):
        return finish(db, claim, "blocked", "APPROVED_SLOT_CONFLICT")
    if not all(sum(source == candidate for candidate in scanner_slots) == 1 for _locale, source in plan):
        return finish(db, claim, "blocked", "SOURCE_SLOT_NOT_FOUND")
    text_section = (section.PointerToRawData, section.PointerToRawData + section.SizeOfRawData)
    # 모든 번역을 먼저 메모리에서 검증한다. 한 슬롯이라도 실패하면 해당 claim은
    # mapping을 하나도 만들지 않는다. 승인·수동 매핑도 이 경로에서는 건드리지 않는다.
    try:
        prepared = []
        for locale, source in plan:
            # 각 LLM 요청 바로 전에 연장해, 앞선 요청이 오래 걸려도 stale worker가
            # 다음 번역이나 apply를 진행하지 못하게 한다.
            if not renew_lease(db, claim):
                return lease_renewal_failed(db, claim)
            prepared.append(prepare_missing_slot(
                db, claim=claim, binary=binary, text_section=text_section,
                locale=locale, source=source,
            ))
    except Exception:
        return finish(db, claim, "deferred", "RECOVERY_WORKER_FAILED", 1800)
    if any(item is None for item in prepared):
        return finish(db, claim, "blocked", "RECOVERY_VALIDATION_FAILED")
    # apply RPC는 lease, 최신 trainer, source/target snapshot을 모두 다시 잠근 뒤
    # pending 생성과 approved 전환을 한 DB 트랜잭션으로 처리한다. 실패하면 0건이다.
    if not renew_lease(db, claim):
        return lease_renewal_failed(db, claim)
    if not apply_prepared_batch(db, claim, prepared):
        return finish(db, claim, "deferred", "RECOVERY_BATCH_APPLY_FAILED", 1800)
    scraper.revalidate_patcher_after_automation(trainer_id)
    return True


def claim_failure_marker(error):
    """예외 본문 대신 PostgreSQL·PostgREST의 제한된 오류 코드만 반환한다.

    URL·SQL·키가 섞인 임의 문자열은 정제해서 출력하지 않고 전부 거절한다.
    알려진 SQLSTATE 5자리 또는 PGRST 3자리 코드가 없으면 기존 표식을 유지한다.
    """
    marker = "[INTEGRITY_QUEUE_CLAIM_FAILED]"
    try:
        code = getattr(error, "code", None)
    except Exception:
        return marker
    if not isinstance(code, str) or len(code) not in (5, 8) or not code.isascii():
        return marker
    code = code.upper()
    if re.fullmatch(r"(?:[A-Z0-9]{5}|PGRST[0-9]{3})", code, flags=re.ASCII) is None:
        return marker
    return f"[INTEGRITY_QUEUE_CLAIM_FAILED code={code}]"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--limit", type=int, default=1)
    parser.add_argument("--provider", choices=("gemini", "azure", "openai_paid"), default="gemini")
    args = parser.parse_args()
    if not args.apply or not 1 <= args.limit <= 1:
        parser.error("무결성 복구는 --apply --limit 1로만 실행합니다")
    endpoint, key = os.getenv("NEXT_PUBLIC_SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not endpoint or not key:
        print("[INTEGRITY_QUEUE_UNAVAILABLE]")
        return 1
    db = create_client(endpoint, key)
    scraper.TRANSLATION_PROVIDER = args.provider
    scraper.translation_usage_db = db
    try:
        queued = db.rpc("enqueue_translation_integrity_recovery_candidates", {"p_limit": 20}).execute().data
    except Exception:
        print("[INTEGRITY_QUEUE_ENQUEUE_FAILED]")
        return 1
    try:
        claims = db.rpc("claim_translation_integrity_recovery_v2", {"p_limit": args.limit}).execute().data or []
    except Exception as error:
        print(claim_failure_marker(error))
        return 1
    failures = sum(not process_claim(db, claim, args.provider) for claim in claims)
    print(f"[INTEGRITY_RECOVERY_RUN] queued={int(queued or 0)} claimed={len(claims)} failures={failures}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
