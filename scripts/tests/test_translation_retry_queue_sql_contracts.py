"""재시도 큐 마이그레이션의 접근 제어·상태 전이 계약을 확인한다."""

import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "supabase" / "migrations" / "202609190001_translation_retry_queue.sql"


class TranslationRetryQueueSqlContracts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sql = MIGRATION.read_text(encoding="utf-8").casefold()

    def test_queue_has_bounded_state_and_unique_locale_key(self):
        self.assertIn("primary key (trainer_id, language_code)", self.sql)
        self.assertIn("state in ('ready', 'deferred', 'blocked')", self.sql)
        self.assertIn("next_retry_at timestamptz", self.sql)
        self.assertIn("attempt_count integer not null default 0", self.sql)
        self.assertIn("last_failure_code text", self.sql)

    def test_claim_is_service_role_only_and_uses_skip_locked(self):
        self.assertIn("create or replace function public.claim_due_translation_retries", self.sql)
        self.assertIn("auth.role() <> 'service_role'", self.sql)
        self.assertIn("for update skip locked", self.sql)
        self.assertIn("p_limit not between 1 and 20", self.sql)
        self.assertIn("next_retry_at = now() + interval '30 minutes'", self.sql)

    def test_failure_schedule_has_backoff_and_public_access_is_revoked(self):
        self.assertIn("power(2, least(coalesce(current_attempt, 0), 5))", self.sql)
        self.assertIn("effective_failure_code := 'retry_limit_exceeded'", self.sql)
        self.assertIn("state = 'blocked' then null", self.sql)
        self.assertIn("revoke all on table public.translation_retry_queue from public, anon, authenticated", self.sql)
        self.assertIn("grant execute on function public.schedule_translation_retry", self.sql)
        self.assertNotIn("to anon, authenticated, service_role", self.sql)


if __name__ == "__main__":
    unittest.main()
