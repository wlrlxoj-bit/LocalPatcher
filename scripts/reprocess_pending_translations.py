"""대기 중인 번역 원본을 안전하게 다시 수집하고 검증한다."""

import argparse
import os
import subprocess
import sys
import time
from urllib.parse import urlparse

from dotenv import load_dotenv
from supabase import create_client

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env.local"), override=True)


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
    """최근 트레이너의 ko/ja 매핑 0행을 조회한다. 기존 de/es 누락은 확장하지 않는다."""
    rows = (db.table("trainers")
            .select("id,games(slug,fling_url),translation_mappings(language_code)")
            .order("id", desc=True).limit(scan_limit).execute().data or [])
    targets, missing_sources, details = [], 0, []
    for row in rows:
        locales = {mapping.get("language_code") for mapping in row.get("translation_mappings", [])}
        missing = sorted({"ko", "ja"} - locales)
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
    """3시간 실행 슬롯마다 대상을 순환해 앞쪽 실패가 후속 작업을 막지 않게 한다."""
    if not targets:
        return [], 0
    if offset is not None:
        return targets[offset:offset + limit], offset
    slots = (len(targets) + limit - 1) // limit
    slot = int((time.time() if now is None else now) // (3 * 60 * 60))
    start = (slot % slots) * limit
    return targets[start:start + limit], start


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--retry-rejected", action="store_true")
    parser.add_argument("--url", action="append", default=[])
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--scan-limit", type=int, default=100,
                        help="ko/ja 매핑 누락을 검사할 최근 트레이너 수 (최대 1000)")
    parser.add_argument("--offset", type=int, default=None,
                        help="실패 대상에 막힌 후속 대상을 명시적으로 선택할 시작 위치")
    args = parser.parse_args()
    if not 1 <= args.limit <= 100 or not 1 <= args.scan_limit <= 1000 or (args.offset is not None and args.offset < 0):
        parser.error("limit은 1~100, scan-limit은 1~1000, offset은 0 이상이어야 합니다")

    endpoint = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not endpoint or not key:
        print("[대기열] Supabase 서비스 환경변수가 없습니다.")
        return 1

    db = create_client(endpoint, key)
    statuses = ["pending", "rejected"] if args.retry_rejected else ["pending"]
    if args.url:
        discovered, missing_sources, missing_targets, details = [], 0, [], []
    else:
        discovered, missing_sources = discover_pending_urls(db, statuses)
        missing_targets, missing_count, details = discover_missing_mapping_urls(db, args.scan_limit)
        missing_sources += missing_count
    # 새로 누락된 작업을 우선 처리하고 URL 한 개는 한 번만 실행한다.
    all_targets = list(dict.fromkeys(args.url or (missing_targets + discovered)))
    targets, selected_offset = select_target_batch(all_targets, args.limit, args.offset)
    for detail in details:
        print(f"[매핑 누락] trainer={detail['trainer_id']} slug={detail['slug']} locales={','.join(detail['missing'])}")
    print(f"[대기열 발견] pending_urls={len(discovered)} missing_trainers={len(details)} total_urls={len(all_targets)} offset={selected_offset}")

    print(f"[대기열] mode={'apply' if args.apply else 'dry-run'} targets={len(targets)}")
    failures = missing_sources
    if missing_sources:
        print(f"[SOURCE_URL_MISSING] count={missing_sources}")

    for target in targets:
        print(f"[대기열 대상] {target}")
        if not args.apply:
            continue
        command = [
            sys.executable,
            os.path.join(os.path.dirname(__file__), "scraper.py"),
            "--provider",
            "azure",
            "--url",
            target,
        ]
        if target in missing_targets and target not in discovered:
            command.extend(["--languages", "ko", "ja"])
        try:
            result = subprocess.run(command, check=False)
        except Exception as exc:
            failures += 1
            print(f"[대기열 실패] url={target} error={type(exc).__name__}")
            continue
        if result.returncode:
            failures += 1
            print(f"[대기열 실패] url={target} exit={result.returncode}")

    print(f"[대기열 결과] targets={len(targets)} failures={failures}")
    return reprocess_exit_code(apply=args.apply, failures=failures)


if __name__ == "__main__":
    raise SystemExit(main())
