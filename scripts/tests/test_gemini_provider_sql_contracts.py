import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[2]
MIGRATION = ROOT / 'supabase' / 'migrations' / '202609150001_gemini_translation_provider_and_limits.sql'
ROLLBACK = ROOT / 'supabase' / 'rollback' / '202609150001_gemini_translation_provider_and_limits.rollback.sql'


class GeminiProviderSqlContracts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sql = MIGRATION.read_text(encoding='utf-8').casefold()
        cls.rollback = ROLLBACK.read_text(encoding='utf-8').casefold()

    def test_gemini_is_allowed_by_every_provider_constraint(self):
        self.assertGreaterEqual(self.sql.count("'gemini'"), 6)
        for table in (
            'translation_jobs',
            'translation_usage_monthly',
            'translation_usage_reservations',
            'translation_mappings',
        ):
            self.assertIn(f'alter table public.{table}', self.sql)

    def test_new_paid_providers_fail_closed_until_limit_is_configured(self):
        self.assertIn("default_limit := case when p_provider = 'azure' then 2000000 else 0 end", self.sql)
        self.assertIn('configure_translation_usage_limit', self.sql)
        self.assertIn('used_characters', self.sql)
        self.assertIn('reserved_characters', self.sql)

    def test_only_service_role_can_reserve_or_configure(self):
        self.assertGreaterEqual(self.sql.count("auth.role() <> 'service_role'"), 2)
        self.assertIn('revoke all on function public.configure_translation_usage_limit', self.sql)
        self.assertIn('grant execute on function public.configure_translation_usage_limit(text, bigint) to service_role', self.sql)

    def test_rollback_refuses_to_destroy_gemini_records(self):
        self.assertIn("where provider = 'gemini'", self.rollback)
        self.assertIn("where translation_provider = 'gemini'", self.rollback)
        self.assertIn('before rollback', self.rollback)


if __name__ == '__main__':
    unittest.main()
