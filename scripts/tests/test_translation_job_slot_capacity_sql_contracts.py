import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[2]
MIGRATION = ROOT / 'supabase' / 'migrations' / '202609210001_translation_job_slot_capacity.sql'


class TranslationJobSlotCapacityContracts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sql = MIGRATION.read_text(encoding='utf-8').casefold()

    def test_approval_requires_all_source_slots_before_writing(self):
        self.assertIn("'result source slots mismatch'", self.sql)
        self.assertIn("'slot translation missing'", self.sql)
        self.assertIn('prepared_slots jsonb', self.sql)
        self.assertLess(
            self.sql.index('prepared_slots := pg_catalog.jsonb_set'),
            self.sql.index('insert into public.translation_mappings'),
        )

    def test_slot_encoding_and_capacity_are_enforced_in_rpc(self):
        self.assertIn("source_row.encoding not in ('ascii', 'utf-8', 'utf-16le')", self.sql)
        self.assertIn("source_row.encoding = 'ascii'", self.sql)
        self.assertIn("convert_to(translated_block, 'utf16')", self.sql)
        self.assertIn("'slot translation exceeds capacity'", self.sql)

    def test_rpc_remains_service_role_only(self):
        self.assertIn("auth.role() <> 'service_role'", self.sql)
        self.assertIn('revoke all on function public.approve_translation_job(uuid, jsonb) from public, anon, authenticated', self.sql)
        self.assertIn('grant execute on function public.approve_translation_job(uuid, jsonb) to service_role', self.sql)


if __name__ == '__main__':
    unittest.main()
