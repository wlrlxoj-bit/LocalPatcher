"""pending/rejected 번역을 다시 수집·검증한다. 기본 동작은 dry-run이다."""

import argparse
import os
import subprocess
import sys
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env.local"), override=True)


def reprocess_exit_code(*, apply: bool, failures: int) -> int:
    """dry-run은 성공으로 끝내고 실제 적용은 부분 실패를 종료 코드로 전달한다."""
    return 0 if not apply else (1 if failures else 0)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--retry-rejected", action="store_true", help="rejected를 운영자 요청으로 1회 재시도")
    parser.add_argument("--url", action="append", default=[])
    parser.add_argument("--limit", type=int, default=30)
    args = parser.parse_args()
    endpoint, key = os.getenv("NEXT_PUBLIC_SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not endpoint or not key:
        print("[대기열] Supabase 서비스 환경변수가 없습니다.")
        return 1
    db = create_client(endpoint, key)
    statuses = ["pending", "rejected"] if args.retry_rejected else ["pending"]
    rows = (db.table("translation_mappings")
              .select("translation_status,trainers!inner(games!inner(fling_url))")
              .in_("translation_status", statuses).limit(args.limit).execute().data or [])
    discovered = []
    missing_sources = 0
    for row in rows:
        target = ((row.get("trainers") or {}).get("games") or {}).get("fling_url")
        if target and target not in discovered:
            discovered.append(target)
        elif not target:
            missing_sources += 1
            print("[SOURCE_URL_MISSING] pending mapping은 원본 URL이 없어 fail-closed 상태로 유지됩니다.")
    targets = args.url or discovered
    print(f"[대기열] mode={'apply' if args.apply else 'dry-run'} targets={len(targets)}")
    failures = missing_sources
    for target in targets:
        print(f"[대기열 대상] {target}")
        if args.apply:
            command = [sys.executable, os.path.join(os.path.dirname(__file__), "scraper.py"),
                       "--provider", "azure", "--url", target]
            result = subprocess.run(command, check=False)
            if result.returncode:
                failures += 1
                print(f"[대기열 실패] url={target} exit={result.returncode}")
    print(f"[대기열 결과] targets={len(targets)} failures={failures}")
    return reprocess_exit_code(apply=args.apply, failures=failures)


if __name__ == "__main__":
    raise SystemExit(main())
