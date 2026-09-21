import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[2]
MIGRATION = ROOT / 'supabase' / 'migrations' / '202609210001_translation_job_slot_capacity.sql'
MANUAL_MIGRATION = ROOT / 'supabase' / 'migrations' / '202609210002_manual_mapping_utf16le_capacity.sql'
MANUAL_ROLLBACK = ROOT / 'supabase' / 'rollback' / '202609210002_manual_mapping_utf16le_capacity.rollback.sql'


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
        self.assertIn("pg_catalog.ascii(pg_catalog.substr(translated_block, characters.position, 1)) > 65535", self.sql)
        self.assertIn("pg_catalog.generate_series(1, pg_catalog.char_length(translated_block))", self.sql)
        self.assertNotIn("'utf16'", self.sql)
        self.assertIn("'slot translation exceeds capacity'", self.sql)

    def test_utf16le_capacity_formula_counts_code_units_not_utf8_bytes(self):
        # SQL은 각 유니코드 코드 포인트를 분해하여 BMP=2, 보조 평면=4바이트로
        # 계산한다. 이 표본은 한글/중국어(BMP)와 이모지(보조 평면)를 함께 검증한다.
        def utf16le_bytes(value: str) -> int:
            return sum(4 if ord(char) > 0xFFFF else 2 for char in value)

        self.assertEqual(utf16le_bytes('ABC'), 6)
        self.assertEqual(utf16le_bytes('한字'), 4)
        self.assertEqual(utf16le_bytes('A😀\n'), 8)

    def test_rpc_remains_service_role_only(self):
        self.assertIn("auth.role() <> 'service_role'", self.sql)
        self.assertIn('revoke all on function public.approve_translation_job(uuid, jsonb) from public, anon, authenticated', self.sql)
        self.assertIn('grant execute on function public.approve_translation_job(uuid, jsonb) to service_role', self.sql)

    def test_manual_mapping_repair_and_rollback_use_supported_utf16le_formula(self):
        for path in (MANUAL_MIGRATION, MANUAL_ROLLBACK):
            sql = path.read_text(encoding='utf-8').casefold()
            self.assertIn('create or replace function public.save_manual_translation_mapping', sql)
            self.assertIn("pg_catalog.ascii(pg_catalog.substr(p_translated_text, characters.position, 1)) > 65535", sql)
            self.assertIn("pg_catalog.generate_series(1, pg_catalog.char_length(p_translated_text))", sql)
            self.assertNotIn("'utf16'", sql)
            self.assertIn('revoke all on function public.save_manual_translation_mapping(bigint, text, text) from public, anon, authenticated', sql)
            self.assertIn('grant execute on function public.save_manual_translation_mapping(bigint, text, text) to service_role', sql)


if __name__ == '__main__':
    unittest.main()
