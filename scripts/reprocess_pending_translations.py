"""대기 중인 번역 원본을 안전하게 다시 수집하고 검증한다."""

import argparse
import os
import subprocess
import sys
from urllib.parse import urlparse

from dotenv import load_dotenv
from supabase import create_client

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env.local"), override=True)

TARGET_LOCALES = ("ko", "ja", "de", "es")


def reprocess_exit_code(*, apply: bool, failures: int) -> int:
    """dry-run은 성공으로 끝내고 실제 적용은 부분 실패도 종료 코드로 전달한다."""
    return 0 if not apply else (1 if failures else 0)


def discover_pending_urls(db, statuses, limit=None, page_size=1000):
    """ID 커서로 대기열 전체를 조회하고 원본 URL을 최초 순서로 중복 제거한다."""
    discovered, seen = [], set()
    missing_sources = 0
    last_id = 0
    while limit is None or len(discovered) < limit:
        rows = (db.rpc("list_pending_translation_sources", {
            "p_after_id": last_id,
            "p_page_size": page_size,
            "p_retry_rejected": "rejected" in statuses,
        }).execute().data or [])
        if not rows:
            break
        for row in rows:
            last_id = max(last_id, int(row["mapping_id"]))
            target = row.get("fling_url")
            parsed = urlparse(target) if isinstance(target, str) else None
            valid_target = bool(
                parsed and parsed.scheme in {"http", "https"} and parsed.netloc
            )
            if valid_target and target not in seen:
                seen.add(target)
                discovered.append(target)
                if limit is not None and len(discovered) >= limit:
                    break
            elif not valid_target:
                missing_sources += 1
        if len(rows) < page_size:
            break
    return discovered, missing_sources


def discover_missing_mapping_urls(db, scan_limit=100):
    """최근 트레이너의 대상 언어 매핑 0행을 조회한다.

    이 함수는 향후 DB 재시도 큐가 준비된 뒤에만 자동 선택에 사용한다.
    현재 ``pending`` 상태만으로는 재시도 가능 시점과 실패 원인을 알 수 없어
    스케줄러가 이 결과를 자동 처리해서는 안 된다.
    """
    rows = (db.table("trainers")
            .select("id,games(slug,fling_url),translation_mappings(language_code)")
            .order("id", desc=True).limit(scan_limit).execute().data or [])
    targets, missing_sources, details = [], 0, []
    for row in rows:
        locales = {mapping.get("language_code") for mapping in row.get("translation_mappings", [])}
        missing = sorted(set(TARGET_LOCALES) - locales)
        if not missing:
            continue
        game = row.get("games") or {}
        target = game.get("fling_url")
        parsed = urlparse(target) if isinstance(target, str) else None
        details.append({"trainer_id": row["id"], "slug": game.get("slug"), "missing": missing})
        if parsed and parsed.scheme in {"http", "https"} and parsed.netloc:
            if target not in targets:
                targets.append(target)
        else:
            missing_sources += 1
    return targets, missing_sources, details


def select_target_batch(targets, limit, offset=None, now=None):
    """명시적으로 요청한 대상만 제한한다. 시간 기반 자동 순환은 하지 않는다."""
    if not targets:
        return [], 0
    if offset is not None:
        return targets[offset:offset + limit], offset
    return targets[:limit], 0


def classify_child_result(returncode, output):
    """하위 수집기의 비밀·응답 전문을 노출하지 않고 종료 원인만 분류한다."""
    if returncode == 0:
        return "success"
    if "error=TranslationQuotaError" in output:
        return "quota_deferred"
    return "failed"


def defer_unclassified_targets(db, retry_items):
    """하위 작업이 결과 코드를 남기지 못한 일시 장애도 제한된 backoff로 되돌린다."""
    try:
        for trainer_id, language_code in retry_items:
            db.rpc("schedule_translation_retry", {
                "p_trainer_id": trainer_id,
                "p_language_code": language_code,
                "p_state": "deferred",
                "p_failure_code": "REPROCESS_WORKER_FAILED",
                "p_delay_seconds": 1800,
            }).execute()
        return True
    except Exception:
        print("[REPROCESS_QUEUE_WRITE_FAILED]")
        return False


def claim_due_retry_targets(db, limit):
    """DB가 실제로 준비된 재시도 항목만 원자적으로 claim하고 URL별로 묶는다."""
    rows = (db.rpc("claim_due_translation_retries", {"p_limit": limit}).execute().data or [])
    targets, missing_sources = [], []
    for row in rows:
        target = row.get("fling_url")
        parsed = urlparse(target) if isinstance(target, str) else None
        if not (parsed and parsed.scheme in {"http", "https"} and parsed.netloc):
            missing_sources.append((row.get("trainer_id"), row.get("language_code")))
            continue
        locale = row.get("language_code")
        if locale not in TARGET_LOCALES:
            continue
        # 하나의 FLiNG 게시물에 여러 trainer가 있을 수 있으므로 URL로 합치지 않는다.
        # claim한 (trainer, locale) 한 건만 하위 수집기로 전달한다.
        targets.append((target, row.get("trainer_id"), locale))
    return targets, missing_sources


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--url", action="append", default=[])
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--offset", type=int, default=None,
                        help="명시 URL을 나눠 실행할 때만 쓰는 시작 위치")
    parser.add_argument("--provider", choices=["gemini", "azure", "openai_paid"],
                        default=os.getenv("TRANSLATION_PROVIDER", "gemini"))
    args = parser.parse_args()
    if not 1 <= args.limit <= 20 or (args.offset is not None and args.offset < 0):
        parser.error("limit은 1~20, offset은 0 이상이어야 합니다")

    if args.url:
        target_locales, missing_sources = [
            (target, None, locale)
            for target in dict.fromkeys(args.url)
            for locale in TARGET_LOCALES
        ], 0
    else:
        if not args.apply:
            print("[REPROCESS_APPLY_REQUIRED]")
            return 0
        endpoint = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
        key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        if not endpoint or not key:
            print("[REPROCESS_QUEUE_UNAVAILABLE]")
            return 1
        db = create_client(endpoint, key)
        target_locales, missing_sources = claim_due_retry_targets(db, args.limit)
        try:
            for trainer_id, language_code in missing_sources:
                if trainer_id is None or language_code not in TARGET_LOCALES:
                    continue
                db.rpc("schedule_translation_retry", {
                    "p_trainer_id": trainer_id,
                    "p_language_code": language_code,
                    "p_state": "blocked",
                    "p_failure_code": "SOURCE_URL_MISSING",
                    "p_delay_seconds": 0,
                }).execute()
        except Exception:
            print("[REPROCESS_QUEUE_WRITE_FAILED]")
            return 1
        if missing_sources:
            print("[REPROCESS_SOURCE_BLOCKED]")
    all_targets = list(target_locales)
    targets, selected_offset = select_target_batch(all_targets, args.limit, args.offset)
    print(f"[REPROCESS_READY_TARGETS] count={len(all_targets)} offset={selected_offset}")

    print(f"[대기열] mode={'apply' if args.apply else 'dry-run'} targets={len(targets)}")
    failures = 0

    for target, trainer_id, locale in targets:
        if not args.apply:
            continue
        command = [
            sys.executable,
            os.path.join(os.path.dirname(__file__), "scraper.py"),
            "--provider",
            args.provider,
            "--url",
            target,
            "--languages",
            locale,
        ]
        if trainer_id is not None:
            command.extend(["--trainer-id", str(trainer_id)])
        try:
            result = subprocess.run(command, check=False, capture_output=True, text=True)
        except Exception:
            failures += 1
            print("[REPROCESS_CHILD_START_FAILED]")
            continue
        outcome = classify_child_result(result.returncode, result.stdout or "")
        if outcome == "quota_deferred":
            # 공유 월 예산이 막혔으면 같은 실행의 후속 대상도 호출하지 않는다.
            # 실패가 아니라 다음 운영자가 큐를 다시 열 때까지의 정상 대기다.
            print("[REPROCESS_DEFERRED_QUOTA]")
            break
        if outcome == "failed":
            if "[RETRY_QUEUED]" not in (result.stdout or ""):
                retry_items = [(trainer_id, locale)] if trainer_id is not None else []
                if retry_items and not defer_unclassified_targets(db, retry_items):
                    failures += 1
            failures += 1
            print("[REPROCESS_CHILD_FAILED]")

    print(f"[대기열 결과] targets={len(targets)} failures={failures}")
    return reprocess_exit_code(apply=args.apply, failures=failures)


if __name__ == "__main__":
    raise SystemExit(main())
