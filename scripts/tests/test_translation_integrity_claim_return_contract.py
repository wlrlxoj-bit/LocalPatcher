"""claim 반환 형식·오류 관측성을 외부 요청 없이 검증한다."""

import contextlib
import io
import pathlib
import re
import sys
import types
import unittest

TESTS = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(TESTS))
from test_translation_pipeline_contracts import load_functions

ROOT = pathlib.Path(__file__).resolve().parents[2]
ORIGINAL_SQL = ROOT / 'supabase/migrations/202609290002_translation_integrity_recovery_lease_and_coverage.sql'
FIX_SQL = ROOT / 'supabase/migrations/202610050002_translation_integrity_claim_return_contract.sql'


class ClaimReturnSqlContracts(unittest.TestCase):
    def test_replacement_keeps_signature_security_and_transaction_boundary(self):
        sql = FIX_SQL.read_text(encoding='utf-8').casefold()
        self.assertIn('create or replace function public.claim_translation_integrity_recovery_v2(p_limit integer default 1)', sql)
        self.assertIn('returns table(trainer_id bigint,fling_url text,original_file_hash text,original_file_size bigint,option_count integer,lease_token uuid)', sql)
        self.assertIn("language plpgsql security definer set search_path = ''", sql)
        self.assertLess(sql.index('begin;'), sql.index('create or replace function'))
        self.assertLess(sql.index("notify pgrst, 'reload schema';"), sql.index('commit;'))
        self.assertNotIn('drop function', sql)
        self.assertNotIn('delete from', sql)
        self.assertNotIn('truncate', sql)

    def test_every_return_column_is_cast_without_changing_claim_or_lease_logic(self):
        old_sql = ORIGINAL_SQL.read_text(encoding='utf-8').casefold()
        original = old_sql.split('create function public.claim_translation_integrity_recovery_v2', 1)[1].split('end; $$;', 1)[0]
        fixed = FIX_SQL.read_text(encoding='utf-8').casefold().split('create or replace function public.claim_translation_integrity_recovery_v2', 1)[1].split('end; $$;', 1)[0]
        before = 'select c.trainer_id,g.fling_url,t.original_file_hash,t.original_file_size,t.option_count,c.lease_token'
        after = 'select c.trainer_id::bigint,g.fling_url::text,t.original_file_hash::text,t.original_file_size::bigint,t.option_count::integer,c.lease_token::uuid'
        self.assertIn(after, fixed)
        # 반환식 외 후보 선택·행 잠금·시도 횟수·lease 생성·한도는 그대로여야 한다.
        self.assertEqual(original.replace(before, after), fixed)


class ClaimFailureObservabilityContracts(unittest.TestCase):
    def setUp(self):
        self.marker, = load_functions('recover_translation_integrity.py', ['claim_failure_marker'], {'re': re})

    @staticmethod
    def error_with_code(code):
        error = RuntimeError('민감한 응답 본문은 출력하면 안 됨')
        error.code = code
        return error

    def test_known_sqlstate_and_postgrest_codes_are_normalized(self):
        for code, expected in [('42804', '42804'), ('42p01', '42P01'), ('pgrst202', 'PGRST202')]:
            with self.subTest(code=code):
                self.assertEqual(self.marker(self.error_with_code(code)), f'[INTEGRITY_QUEUE_CLAIM_FAILED code={expected}]')

    def test_unknown_or_unsafe_codes_never_leak_response_details(self):
        for code in [None, 42804, {}, 'https://invalid.local/key', '42804\nSQL', '42804 ', 'TOKEN_SECRET', 'A' * 10000, 'ｐｇｒｓｔ２０２', 'ſ2P01']:
            with self.subTest(code_type=type(code).__name__):
                self.assertEqual(self.marker(self.error_with_code(code)), '[INTEGRITY_QUEUE_CLAIM_FAILED]')
        self.assertEqual(self.marker(RuntimeError('응답·URL·SQL 본문')), '[INTEGRITY_QUEUE_CLAIM_FAILED]')

    def test_error_code_property_failure_and_stringification_are_not_exposed(self):
        class UnreadableError(Exception):
            @property
            def code(self):
                raise RuntimeError('속성 조회 실패')

            def __str__(self):
                raise AssertionError('예외 본문을 문자열로 변환하면 안 됨')

        self.assertEqual(self.marker(UnreadableError()), '[INTEGRITY_QUEUE_CLAIM_FAILED]')

    def run_main(self, *, failing_rpc=None, error=None, claims=None):
        calls, processed = [], []

        class FakeDb:
            def rpc(self, name, payload):
                calls.append((name, payload))

                class Request:
                    def execute(self):
                        if name == failing_rpc:
                            raise error
                        data = 3 if name == 'enqueue_translation_integrity_recovery_candidates' else claims
                        return types.SimpleNamespace(data=data)

                return Request()

        db = FakeDb()
        fake_parser = types.SimpleNamespace(
            add_argument=lambda *args, **kwargs: None,
            parse_args=lambda: types.SimpleNamespace(apply=True, limit=1, provider='gemini'),
        )
        namespace = {
            'argparse': types.SimpleNamespace(ArgumentParser=lambda: fake_parser),
            'os': types.SimpleNamespace(getenv=lambda name: 'unused-local-fixture'),
            'create_client': lambda *_: db,
            'scraper': types.SimpleNamespace(),
            'claim_failure_marker': self.marker,
            'process_claim': lambda *args: processed.append(args) or True,
        }
        main, = load_functions('recover_translation_integrity.py', ['main'], namespace)
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            status = main()
        return status, output.getvalue(), calls, processed

    def test_claim_exception_reports_only_safe_code_and_stops_processing(self):
        status, output, calls, processed = self.run_main(
            failing_rpc='claim_translation_integrity_recovery_v2', error=self.error_with_code('42804'),
        )
        self.assertEqual(status, 1)
        self.assertEqual(output, '[INTEGRITY_QUEUE_CLAIM_FAILED code=42804]\n')
        self.assertEqual(calls, [
            ('enqueue_translation_integrity_recovery_candidates', {'p_limit': 20}),
            ('claim_translation_integrity_recovery_v2', {'p_limit': 1}),
        ])
        self.assertEqual(processed, [])

    def test_enqueue_exception_is_not_misreported_as_claim_failure(self):
        status, output, calls, processed = self.run_main(
            failing_rpc='enqueue_translation_integrity_recovery_candidates', error=self.error_with_code('42804'),
        )
        self.assertEqual(status, 1)
        self.assertEqual(output, '[INTEGRITY_QUEUE_ENQUEUE_FAILED]\n')
        self.assertEqual(len(calls), 1)
        self.assertEqual(processed, [])

    def test_empty_and_successful_claims_keep_run_summary(self):
        for claims in (None, [], [{'trainer_id': 42, 'lease_token': 'fixture-token'}]):
            with self.subTest(claims_count=len(claims or [])):
                status, output, _calls, processed = self.run_main(claims=claims)
                self.assertEqual(status, 0)
                self.assertEqual(output, f'[INTEGRITY_RECOVERY_RUN] queued=3 claimed={len(claims or [])} failures=0\n')
                self.assertEqual(len(processed), len(claims or []))


if __name__ == '__main__':
    unittest.main()
