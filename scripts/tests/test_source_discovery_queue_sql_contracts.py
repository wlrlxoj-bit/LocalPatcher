"""FLiNG 소스 발견 큐의 URL·lease·접근 제어 SQL 계약을 확인한다."""

import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "supabase" / "migrations" / "202609270001_source_discovery_queue.sql"


class SourceDiscoveryQueueSqlContracts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sql = MIGRATION.read_text(encoding="utf-8").casefold()

    def test_queue_is_separate_and_accepts_only_canonical_fling_trainer_urls(self):
        self.assertIn("create table if not exists public.source_discovery_queue", self.sql)
        self.assertNotIn("create table if not exists public.translation_retry_queue", self.sql)
        self.assertIn("source_url text primary key", self.sql)
        self.assertIn("https://flingtrainer\\\\.com/trainer/", self.sql)
        self.assertIn("state in ('ready', 'deferred', 'blocked', 'completed')", self.sql)
        self.assertIn("source_lastmod timestamptz", self.sql)
        self.assertIn("discovered_at timestamptz not null default now()", self.sql)
        self.assertIn("attempt_count integer not null default 0", self.sql)

    def test_claim_uses_bounded_service_role_only_skip_locked_lease(self):
        self.assertIn("create or replace function public.claim_fling_discovery_candidates", self.sql)
        self.assertIn("auth.role() <> 'service_role'", self.sql)
        self.assertIn("p_limit not between 1 and 5", self.sql)
        self.assertIn("for update skip locked", self.sql)
        self.assertIn("next_attempt_at = now() + interval '30 minutes'", self.sql)
        self.assertIn("order by queue.source_lastmod desc nulls last, queue.discovered_at, queue.source_url", self.sql)
        self.assertIn("create index if not exists source_discovery_queue_due_idx", self.sql)
        self.assertIn("on public.source_discovery_queue (next_attempt_at)", self.sql)
        self.assertIn("create index if not exists source_discovery_queue_priority_idx", self.sql)
        self.assertIn("source_lastmod desc nulls last, discovered_at, source_url", self.sql)

    def test_lifecycle_rpcs_are_bounded_and_private(self):
        self.assertIn("create or replace function public.upsert_fling_discovery_candidate", self.sql)
        self.assertIn("create or replace function public.upsert_fling_discovery_candidates(p_candidates jsonb)", self.sql)
        self.assertIn("jsonb_array_length(p_candidates) not between 1 and 5000", self.sql)
        self.assertIn("jsonb_to_recordset(normalized_candidates)", self.sql)
        self.assertEqual(
            self.sql.count(
                "where excluded.source_lastmod is not null\n"
                "      and (queue.source_lastmod is null or queue.source_lastmod < excluded.source_lastmod);"
            ),
            2,
        )
        self.assertNotIn(
            "where queue.source_lastmod is null\n"
            "       or (excluded.source_lastmod is not null and queue.source_lastmod < excluded.source_lastmod);",
            self.sql,
        )
        self.assertIn("create or replace function public.complete_fling_discovery_candidate", self.sql)
        self.assertIn("create or replace function public.defer_fling_discovery_candidate", self.sql)
        self.assertIn("create or replace function public.block_fling_discovery_candidate", self.sql)
        self.assertIn("p_delay_seconds not between 60 and 2678400", self.sql)
        self.assertIn("queue.attempt_count >= 20", self.sql)
        self.assertIn("'retry_limit_exceeded'", self.sql)
        self.assertIn("revoke all on table public.source_discovery_queue from public, anon, authenticated", self.sql)
        self.assertIn("grant execute on function public.upsert_fling_discovery_candidate", self.sql)
        self.assertNotIn("to anon, authenticated, service_role", self.sql)


if __name__ == "__main__":
    unittest.main()
