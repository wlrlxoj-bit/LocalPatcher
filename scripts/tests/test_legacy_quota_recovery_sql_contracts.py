"""과거 내부 한도 선별 claim의 권한·범위·보호 조건을 확인한다."""

import pathlib
import unittest


SQL = (pathlib.Path(__file__).resolve().parents[2] / "supabase/migrations/202610150001_claim_legacy_internal_quota_recovery.sql").read_text(encoding="utf-8")


class LegacyQuotaRecoverySqlContracts(unittest.TestCase):
    def test_recovery_is_service_role_only_and_strictly_bounded(self):
        self.assertIn("auth.role() is distinct from 'service_role'", SQL)
        self.assertIn("set search_path = ''", SQL)
        self.assertIn("p_limit not between 1 and 4", SQL)
        self.assertIn("array[2730, 2731]::bigint[]", SQL)
        self.assertIn("pg_catalog.array_position(p_trainer_ids, null)", SQL)
        self.assertIn("from public,anon,authenticated", SQL)
        self.assertIn("to service_role", SQL)
        self.assertIn("notify pgrst, 'reload schema';", SQL)

    def test_recovery_does_not_reset_attempts_or_touch_new_provider_errors(self):
        self.assertIn("q.state = 'deferred'", SQL)
        self.assertIn("q.last_failure_code = 'TRANSLATION_QUOTA'", SQL)
        self.assertIn("q.updated_at < timestamptz '2026-10-15 01:53:34+00'", SQL)
        self.assertNotIn("attempt_count=", SQL)
        self.assertNotIn("attempt_count =", SQL)
        self.assertIn("INTERNAL_QUOTA_RECOVERY_CLAIMED", SQL)

    def test_approved_manual_integrity_and_concurrent_claims_are_protected(self):
        self.assertIn("m.is_approved=true or m.translation_provider='manual'", SQL)
        self.assertIn("i.state='blocked' or i.lease_expires_at > pg_catalog.clock_timestamp()", SQL)
        self.assertIn("for update of q skip locked", SQL)
        self.assertIn("interval '30 minutes'", SQL)
        self.assertIn("q.language_code in ('ko', 'ja', 'de', 'es')", SQL)
        self.assertIn("newer.game_id=t.game_id and newer.id>t.id", SQL)
        self.assertIn("public.source_discovery_queue", SQL)
        self.assertIn("s.state='blocked'", SQL)
        self.assertIn("^https://flingtrainer[.]com/trainer/", SQL)


if __name__ == "__main__":
    unittest.main()
