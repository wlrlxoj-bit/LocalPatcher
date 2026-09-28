"""noindex 자동 복구 RPC가 승인·비용·실행 중 상태를 보호하는지 확인한다."""

import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "supabase" / "migrations" / "202609270004_safe_noindex_requeue.sql"


class SafeNoindexRequeueSqlContracts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sql = MIGRATION.read_text(encoding="utf-8").casefold()

    def test_service_role_only_and_bounded_chunk(self):
        self.assertIn("security definer", self.sql)
        self.assertIn("auth.role() <> 'service_role'", self.sql)
        self.assertIn("p_limit not between 1 and 500", self.sql)
        self.assertIn("limit p_limit", self.sql)
        self.assertIn("grant execute on function public.requeue_safe_noindex_translation_candidates(integer)", self.sql)
        self.assertNotIn("to anon, authenticated, service_role", self.sql)

    def test_latest_selection_merges_elden_ring_source(self):
        self.assertIn("elden-ring-shadow-of-the-erdtree-trainer-1768067282", self.sql)
        self.assertIn("partition by versioned.requested_game_id", self.sql)
        self.assertIn("versioned.trainer_id desc", self.sql)
        self.assertIn("generate_series(1, 8)", self.sql)

    def test_canonical_and_legacy_elden_candidates_are_deduplicated_before_upsert(self):
        safe_start = self.sql.index("safe_candidates as")
        upsert_start = self.sql.index("upserted as")
        safe_candidates = self.sql[safe_start:upsert_start]
        self.assertIn("select distinct latest.trainer_id, locale.language_code", safe_candidates)
        self.assertIn("on conflict (trainer_id, language_code)", self.sql[upsert_start:])

    def test_only_safe_automatic_rows_can_be_requeued(self):
        self.assertIn("mapping.is_approved = true or mapping.translation_provider = 'manual'", self.sql)
        self.assertIn("mapping.translation_status in ('pending', 'rejected')", self.sql)
        self.assertIn("coalesce(btrim(mapping.original_text), '') = ''", self.sql)
        self.assertIn("coalesce(btrim(mapping.translated_text), '') = ''", self.sql)
        self.assertIn("noindex_safe_recovery", self.sql)

    def test_automatic_mapping_not_exists_is_closed_before_retry_queue_filter(self):
        # 중첩 not exists의 닫는 괄호가 빠지면 Supabase가 function body incomplete로
        # 거부한다. 자동 매핑 허용 조건과 retry queue 보존 조건은 별도 predicate다.
        self.assertIn(
            "coalesce(btrim(mapping.translated_text), '') = ''\n"
            "            )\n"
            "          )\n"
            "        )\n"
            "       and not exists (\n"
            "       -- 이미 작업자가 claim한 lease",
            self.sql,
        )

    def test_active_or_explicitly_blocked_retry_is_preserved(self):
        safe_start = self.sql.index("safe_candidates as")
        upsert_start = self.sql.index("upserted as")
        safe_candidates = self.sql[safe_start:upsert_start]
        # 후보 단계에서 제외해야 여러 chunk가 같은 보존 PK를 반복 집계하지 않는다.
        self.assertIn("from public.translation_retry_queue queue", safe_candidates)
        self.assertIn("queue.state = 'ready' and queue.next_retry_at > now()", safe_candidates)
        self.assertIn("queue.state = 'deferred' and queue.next_retry_at > now()", safe_candidates)
        self.assertIn("queue.state = 'blocked'", safe_candidates)
        self.assertIn("queue.last_failure_code = 'translation_quota'", safe_candidates)
        self.assertIn("queue.last_failure_code = 'noindex_safe_recovery'", safe_candidates)


if __name__ == "__main__":
    unittest.main()
