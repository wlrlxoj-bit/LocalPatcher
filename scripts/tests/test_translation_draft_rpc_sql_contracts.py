import pathlib
import re
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[2]
MIGRATION = (
    ROOT / "supabase" / "migrations"
    / "202607260001_translation_draft_finalize.sql"
)


class TranslationDraftRpcSqlContracts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sql = MIGRATION.read_text(encoding="utf-8").casefold()

    def test_functions_are_service_role_only_security_definer(self):
        self.assertEqual(self.sql.count("security definer"), 2)
        self.assertEqual(self.sql.count("set search_path = ''"), 2)
        self.assertEqual(self.sql.count("auth.role() <> 'service_role'"), 2)
        self.assertIn("revoke all on function public.finalize_translation_draft", self.sql)
        self.assertIn("revoke all on function public.list_pending_translation_sources", self.sql)
        self.assertIn("to service_role", self.sql)
        self.assertNotRegex(self.sql, r"grant\s+.+\s+on\s+table")

    def test_finalize_is_locked_and_transitions_only_expected_draft(self):
        self.assertIn("pg_catalog.pg_advisory_xact_lock", self.sql)
        self.assertIn("for update", self.sql)
        self.assertIn("p_status not in ('approved', 'rejected')", self.sql)
        self.assertIn("target.translated_text is distinct from p_expected_translated_text", self.sql)
        self.assertIn("mapping.translation_status in ('pending', 'rejected')", self.sql)
        self.assertIn("set is_approved = (p_status = 'approved')", self.sql)
        self.assertIn("'approved_preserved'", self.sql)
        for reason in ("not_found", "invalid_state", "translated_text_mismatch"):
            self.assertIn(f"'{reason}'", self.sql)

    def test_listing_is_cursor_ordered_and_filters_unapproved(self):
        self.assertIn("mapping.id > p_after_id", self.sql)
        self.assertIn("mapping.is_approved = false", self.sql)
        self.assertIn("mapping.translation_status = 'pending'", self.sql)
        self.assertIn("p_retry_rejected", self.sql)
        self.assertIn("order by mapping.id", self.sql)
        self.assertRegex(
            self.sql,
            re.compile(r"returns table\(mapping_id bigint, trainer_id bigint, fling_url text\)"),
        )


if __name__ == "__main__":
    unittest.main()
