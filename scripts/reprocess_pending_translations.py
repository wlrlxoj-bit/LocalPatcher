"""대기 중인 번역 원본을 안전하게 다시 수집하고 검증한다."""

import argparse
import os
import subprocess
import sys

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
        rows = (db.table("translation_mappings")
                .select("id,translation_status,trainers!inner(games!inner(fling_url))")
                .in_("translation_status", statuses)
                .gt("id", last_id)
                .order("id")
                .limit(page_size)
                .execute().data or [])
        if not rows:
            break
        for row in rows:
            last_id = max(last_id, int(row["id"]))
            target = ((row.get("trainers") or {}).get("games") or {}).get("fling_url")
            if target and target not in seen:
                seen.add(target)
                discovered.append(target)
                if limit is not None and len(discovered) >= limit:
                    break
            elif not target:
                missing_sources += 1
        if len(rows) < page_size:
            break
    return discovered, missing_sources


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--retry-rejected", action="store_true")
    parser.add_argument("--url", action="append", default=[])
    parser.add_argument("--limit", type=int, default=None)
    args = parser.parse_args()

    endpoint = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not endpoint or not key:
        print("[대기열] Supabase 서비스 환경변수가 없습니다.")
        return 1

    db = create_client(endpoint, key)
    statuses = ["pending", "rejected"] if args.retry_rejected else ["pending"]
    discovered, missing_sources = discover_pending_urls(db, statuses, args.limit)
    targets = list(dict.fromkeys(args.url)) if args.url else discovered

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
