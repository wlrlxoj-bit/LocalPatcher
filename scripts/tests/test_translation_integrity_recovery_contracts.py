"""승인·수동 매핑을 보존하는 무결성 복구 경계 계약을 확인한다."""

import pathlib
import sys
import unittest

TESTS = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(TESTS))
from test_translation_pipeline_contracts import load_functions
from translation_validation import parse_options

ROOT = pathlib.Path(__file__).resolve().parents[2]
SQL = (ROOT / 'supabase/migrations/202609290002_translation_integrity_recovery_lease_and_coverage.sql').read_text(encoding='utf-8').casefold()
WORKER = ROOT / 'scripts/recover_translation_integrity.py'


class IntegrityQueueSqlContracts(unittest.TestCase):
    def test_service_role_only_bounded_claim_and_rls(self):
        self.assertIn("auth.role() <> 'service_role'", SQL)
        self.assertIn('p_limit not between 1 and 1', SQL)
        self.assertIn('for update skip locked', SQL)
        self.assertIn('lease_token uuid', SQL)
        self.assertIn('lease_checked_at := pg_catalog.clock_timestamp()', SQL)
        self.assertIn('claim_translation_integrity_recovery_v2', SQL)
        self.assertIn('finish_translation_integrity_recovery_v2', SQL)

    def test_enqueue_uses_option_coverage_not_only_missing_locale_rows(self):
        enqueue = SQL[SQL.index('create or replace function public.enqueue'):SQL.index('create function public.claim_translation_integrity_recovery_v2')]
        self.assertIn("values ('ko'::text), ('ja'::text), ('de'::text), ('es'::text)", enqueue)
        self.assertIn('regexp_matches', enqueue)
        self.assertIn('cross join lateral', enqueue)
        self.assertNotIn('cardinality(pg_catalog.regexp_matches', enqueue)
        self.assertIn('< r.option_count', enqueue)
        self.assertNotIn('update public.translation_mappings', enqueue)
        self.assertNotIn('delete from public.translation_mappings', enqueue)


class IntegrityWorkerContracts(unittest.TestCase):
    def preflight(self, rows, option_count):
        function, = load_functions('recover_translation_integrity.py', ['preflight_slots'], {
            'TARGET_LOCALES': ('ko', 'ja', 'de', 'es'),
            'parse_options': parse_options,
        })
        return function(rows, option_count)

    def test_conflicting_same_offset_is_blocked_but_split_offsets_are_preserved(self):
        source = {'language_code': 'ko', 'offset_dec': 100, 'encoding': 'ASCII', 'max_char_len': 20, 'original_text': 'Num 1 - HP', 'is_approved': True, 'translation_provider': 'gemini'}
        self.assertEqual(self.preflight([source, {**source, 'language_code': 'ja', 'original_text': 'Num 1 - Other'}], 2)[2], 'APPROVED_SLOT_CONFLICT')
        split = {**source, 'language_code': 'ja', 'offset_dec': 200, 'original_text': 'Num 2 - MP'}
        slots, _plan, problem = self.preflight([source, split], 2)
        self.assertIsNone(problem)
        self.assertEqual(set(slots), {100, 200})

    def test_only_absent_language_slots_are_recoverable(self):
        rows = [
            {'language_code': 'ko', 'offset_dec': 100, 'encoding': 'ASCII', 'max_char_len': 20, 'original_text': 'Num 1 - HP', 'is_approved': True, 'translation_provider': 'gemini'},
            {'language_code': 'ja', 'offset_dec': 100, 'encoding': 'ASCII', 'max_char_len': 20, 'original_text': 'Num 1 - HP', 'is_approved': True, 'translation_provider': 'gemini'},
        ]
        _source, missing, problem = self.preflight(rows, 1)
        self.assertIsNone(problem)
        self.assertEqual({locale for locale, _source in missing}, {'de', 'es'})

    def test_duplicate_target_rows_are_conflict_not_dict_overwrite(self):
        source = {'language_code': 'ko', 'offset_dec': 100, 'encoding': 'ASCII', 'max_char_len': 20,
                  'original_text': 'Num 1 - HP', 'is_approved': True, 'translation_provider': 'gemini'}
        duplicate_pending = {**source, 'language_code': 'ja', 'is_approved': False, 'translation_provider': 'gemini'}
        _slots, _plan, problem = self.preflight([source, duplicate_pending, {**duplicate_pending}], 1)
        self.assertEqual(problem, 'TARGET_SLOT_CONFLICT')

    def test_partial_coverage_with_all_locales_is_not_treated_as_complete(self):
        rows = [{'language_code': locale, 'offset_dec': 100, 'encoding': 'ASCII', 'max_char_len': 20,
                 'original_text': 'Num 1 - HP', 'is_approved': True, 'translation_provider': 'gemini'} for locale in ('ko','ja','de','es')]
        _slots, plan, problem = self.preflight(rows, 2)
        self.assertIsNone(problem)
        self.assertEqual(plan, ())

    def test_single_block_scanner_refuses_multi_source_partial_write(self):
        checker, = load_functions('recover_translation_integrity.py', ['scanner_slots_are_exact_superset'])
        first = (100, 'ASCII', 20, 'Num 1 - HP')
        second = (200, 'ASCII', 20, 'Num 2 - MP')
        self.assertFalse(checker([first, second], [first]))
        self.assertTrue(checker([first], [first]))

    def test_worker_source_has_explicit_identity_and_non_overwrite_guards(self):
        source = WORKER.read_text(encoding='utf-8')
        self.assertIn('SOURCE_IDENTITY_MISMATCH', source)
        self.assertIn('APPROVED_SLOT_CONFLICT', source)
        self.assertIn('prepare_missing_slot', source)
        self.assertIn('apply_prepared_batch', source)
        self.assertIn('apply_translation_integrity_recovery_v2', source)
        self.assertIn("target.get(\"translation_provider\") == \"manual\"", source)
        self.assertIn("p_lease_token", source)
        self.assertIn('claim_translation_integrity_recovery_v2', source)
        self.assertIn('scan_option_blocks', source)
        self.assertIn('APPROVED_SLOT_CONFLICT', source)

    def test_worker_blocks_oversized_batch_before_translation_or_db_apply(self):
        source = WORKER.read_text(encoding='utf-8')
        guard = source.index('if batch_upper_bound > 64:')
        self.assertIn('"RECOVERY_BATCH_TOO_LARGE"', source[guard:guard + 180])
        self.assertLess(guard, source.index('binary, download_problem = extract_current_executable', guard))
        # LLM 준비는 lease 갱신을 포함한 명시적 loop로 바뀌었다. 호출의 한 줄
        # 표기 대신 실제 prepare loop와 최종 apply의 순서를 검증한다.
        self.assertLess(guard, source.index('prepared.append(prepare_missing_slot(', guard))
        self.assertLess(guard, source.index('if not apply_prepared_batch(db, claim, prepared):', guard))

    def test_conservative_batch_upper_bound_counts_missing_language_slots(self):
        bound, = load_functions('recover_translation_integrity.py', ['conservative_recovery_batch_upper_bound'], {
            'TARGET_LOCALES': ('ko', 'ja', 'de', 'es'),
        })
        rows = [
            {'language_code': 'ko', 'offset_dec': offset, 'encoding': 'ASCII', 'max_char_len': 20,
             'original_text': 'Num 1 - HP', 'is_approved': True, 'translation_provider': 'gemini'}
            for offset in range(22)
        ]
        self.assertEqual(bound(rows), 66)

    def test_pending_target_cannot_reduce_batch_bound_or_evade_conflict(self):
        bound, = load_functions('recover_translation_integrity.py', ['conservative_recovery_batch_upper_bound'], {
            'TARGET_LOCALES': ('ko', 'ja', 'de', 'es'),
        })
        source_rows = [
            {'language_code': 'ko', 'offset_dec': offset, 'encoding': 'ASCII', 'max_char_len': 20,
             'original_text': 'Num 1 - HP', 'is_approved': True, 'translation_provider': 'gemini'}
            for offset in range(22)
        ]
        pending_targets = [
            {**row, 'language_code': 'ja', 'is_approved': False, 'translation_provider': 'gemini'}
            for row in source_rows
        ]
        self.assertIsNone(bound(source_rows + pending_targets))

    def test_stale_lease_is_constrained_by_post_lock_wall_clock_checks(self):
        self.assertNotIn('lease_expires_at>now()', SQL)
        apply_start = SQL.index('create function public.apply_translation_integrity_recovery_v2')
        finish_start = SQL.index('create function public.finish_translation_integrity_recovery_v2')
        renew_start = SQL.index('create function public.renew_translation_integrity_recovery_lease_v2')
        apply_sql = SQL[apply_start:finish_start]
        finish_sql = SQL[finish_start:renew_start]
        renew_sql = SQL[renew_start:]
        # 세 RPC는 잠금 직후 null·만료 claim을 거절하고, 상태를 바꾸거나 lease를
        # 연장하는 UPDATE는 SQL 실행 시점의 벽시각을 WHERE에 다시 적용한다.
        for section in (apply_sql, finish_sql, renew_sql):
            self.assertIn('lease_checked_at := pg_catalog.clock_timestamp()', section)
            self.assertIn('queue_row.lease_expires_at is null', section)
            self.assertIn('queue_row.lease_expires_at <= lease_checked_at', section)
            self.assertIn('lease_expires_at>pg_catalog.clock_timestamp()', section)

    def test_old_lease_less_rpc_is_revoked_and_v2_is_granted(self):
        self.assertIn('revoke all on function public.claim_translation_integrity_recovery(integer) from public,anon,authenticated,service_role', SQL)
        self.assertIn('revoke all on function public.finish_translation_integrity_recovery(bigint,text,text,integer) from public,anon,authenticated,service_role', SQL)
        self.assertIn('grant execute on function public.finish_translation_integrity_recovery_v2(bigint,uuid,text,text,integer) to service_role', SQL)


if __name__ == '__main__':
    unittest.main()
