"""무결성 복구의 실제 worker RPC 계약과 단일 트랜잭션 경계를 확인한다."""

import pathlib
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
TESTS = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(TESTS))
from test_translation_pipeline_contracts import load_functions

SQL = (ROOT / "supabase/migrations/202609290002_translation_integrity_recovery_lease_and_coverage.sql").read_text(encoding="utf-8").casefold()


class RpcResult:
    def __init__(self, data):
        self.data = data


class FakeRpc:
    def __init__(self, data):
        self.data = data

    def execute(self):
        return RpcResult(self.data)


class FakeDb:
    def __init__(self, data):
        self.data = data
        self.calls = []

    def rpc(self, name, args):
        self.calls.append((name, args))
        return FakeRpc(self.data)


class TranslationIntegrityLeaseContracts(unittest.TestCase):
    @staticmethod
    def _ui_version_parts(version: str):
        """lib/supabase.ts의 마지막 v 토큰·누락 0 비교 규칙을 독립적으로 표현한다."""
        import re
        matches = re.findall(r"v(\d+(?:\.\d+)*)", version, flags=re.IGNORECASE)
        return [int(part) for part in matches[-1].split('.')] if matches else []

    @classmethod
    def _compare_ui_versions(cls, left: str, right: str) -> int:
        left_parts = cls._ui_version_parts(left)
        right_parts = cls._ui_version_parts(right)
        for index in range(max(len(left_parts), len(right_parts))):
            difference = (right_parts[index] if index < len(right_parts) else 0) - (left_parts[index] if index < len(left_parts) else 0)
            if difference:
                return difference
        return 0

    def test_worker_sends_entire_prepared_batch_to_one_rpc(self):
        apply_batch, = load_functions('recover_translation_integrity.py', ['apply_prepared_batch'])
        claim = {'trainer_id': 42, 'lease_token': 'lease-token'}
        mapping_a = {'trainer_id': 42, 'language_code': 'ko', 'offset_dec': 10, 'encoding': 'ASCII', 'max_char_len': 30, 'original_text': 'Num 1 - HP', 'translated_text': 'Num 1 - 체력', 'translation_provider': 'gemini'}
        mapping_b = {**mapping_a, 'language_code': 'ja', 'offset_dec': 20, 'original_text': 'Num 2 - MP'}
        db = FakeDb({'applied': 2})
        self.assertTrue(apply_batch(db, claim, [(mapping_a, object()), (mapping_b, object())]))
        self.assertEqual(len(db.calls), 1)
        name, args = db.calls[0]
        self.assertEqual(name, 'apply_translation_integrity_recovery_v2')
        self.assertEqual(len(args['p_batch']), 2)
        self.assertEqual(args['p_batch'][0]['source']['offset_dec'], 10)

    def test_worker_renews_only_the_claim_token_before_long_work(self):
        renew, = load_functions('recover_translation_integrity.py', ['renew_lease'])
        claim = {'trainer_id': 42, 'lease_token': 'lease-token'}
        db = FakeDb(True)
        self.assertTrue(renew(db, claim))
        self.assertEqual(db.calls, [(
            'renew_translation_integrity_recovery_lease_v2',
            {'p_trainer_id': 42, 'p_lease_token': 'lease-token'},
        )])

    def test_renewal_sql_uses_wall_clock_after_lock_and_cannot_revive_expired_claim(self):
        start = SQL.index('create function public.renew_translation_integrity_recovery_lease_v2')
        end = SQL.index('-- 001의 lease 없는 호출', start)
        renew_sql = SQL[start:end]
        self.assertIn("auth.role() <> 'service_role'", renew_sql)
        self.assertIn('for update', renew_sql)
        self.assertIn('lease_checked_at := pg_catalog.clock_timestamp()', renew_sql)
        self.assertIn('queue_row.lease_expires_at is null', renew_sql)
        self.assertIn('queue_row.lease_expires_at <= lease_checked_at', renew_sql)
        self.assertIn("lease_expires_at=pg_catalog.clock_timestamp()+interval '30 minutes'", renew_sql)
        self.assertIn("next_retry_at=pg_catalog.clock_timestamp()+interval '30 minutes'", renew_sql)
        self.assertIn('lease_expires_at>pg_catalog.clock_timestamp()', renew_sql)
        self.assertNotIn('lease_expires_at>now()', renew_sql)
        self.assertLess(renew_sql.index('for update'), renew_sql.index('lease_checked_at := pg_catalog.clock_timestamp()'))
        self.assertLess(renew_sql.index('queue_row.lease_expires_at <= lease_checked_at'), renew_sql.index("lease_expires_at=pg_catalog.clock_timestamp()+interval '30 minutes'"))
        self.assertIn('return found', renew_sql)
        self.assertIn('revoke all on function public.renew_translation_integrity_recovery_lease_v2(bigint,uuid) from public,anon,authenticated', SQL)
        self.assertIn('grant execute on function public.renew_translation_integrity_recovery_lease_v2(bigint,uuid) to service_role', SQL)

    def test_worker_stops_without_apply_when_lease_renewal_fails(self):
        source = (ROOT / 'scripts/recover_translation_integrity.py').read_text(encoding='utf-8')
        download = source.index('binary, download_problem = extract_current_executable')
        self.assertIn('if not renew_lease(db, claim):', source[download - 260:download])
        self.assertIn('return lease_renewal_failed(db, claim)', source[download - 260:download])
        prepare = source.index('prepared.append(prepare_missing_slot(')
        self.assertIn('if not renew_lease(db, claim):', source[prepare - 360:prepare])
        apply = source.index('if not apply_prepared_batch(db, claim, prepared):')
        self.assertIn('if not renew_lease(db, claim):', source[apply - 220:apply])

    def test_batch_rpc_fences_post_lock_lease_atomically_before_transactional_writes(self):
        start = SQL.index('create function public.apply_translation_integrity_recovery_v2')
        end = SQL.index('create function public.finish_translation_integrity_recovery_v2')
        apply_sql = SQL[start:end]
        self.assertIn("lease_token=p_lease_token and state='ready'", apply_sql)
        self.assertIn('for update', apply_sql)
        self.assertIn('lease_checked_at := pg_catalog.clock_timestamp()', apply_sql)
        self.assertIn('queue_row.lease_expires_at is null', apply_sql)
        self.assertIn('queue_row.lease_expires_at <= lease_checked_at', apply_sql)
        self.assertNotIn('lease_expires_at>now()', apply_sql)
        self.assertLess(apply_sql.index('for update'), apply_sql.index('lease_checked_at := pg_catalog.clock_timestamp()'))
        # source/target 잠금 대기 뒤에는 쓰기 직전에 lease를 원자적으로 갱신해야 한다.
        # 단순한 rowtype 재검사는 행이 잠긴 뒤 경과한 시간을 갱신하지 못하므로 충분하지 않다.
        write_lease_check = apply_sql.rindex('lease_checked_at := pg_catalog.clock_timestamp()')
        self.assertGreater(write_lease_check, apply_sql.index('-- 4단계'))
        self.assertLess(write_lease_check, apply_sql.index("insert into public.translation_mappings"))
        fence = apply_sql[write_lease_check:apply_sql.index('-- 5단계')]
        self.assertIn('update public.translation_integrity_recovery_queue', fence)
        self.assertIn('lease_token=p_lease_token', fence)
        self.assertIn("state='ready'", fence)
        # UPDATE의 SQL 문 자체가 비교·연장에 각각 현재 벽시각을 사용한다. 따라서
        # 행 잠금 이후 만료된 lease는 0행이 되어 INSERT까지 진행할 수 없다.
        self.assertIn('lease_expires_at>pg_catalog.clock_timestamp()', fence)
        self.assertIn("lease_expires_at=pg_catalog.clock_timestamp()+interval '30 minutes'", fence)
        self.assertIn("next_retry_at=pg_catalog.clock_timestamp()+interval '30 minutes'", fence)
        self.assertIn("if not found then", fence)
        self.assertIn("raise exception 'integrity recovery lease invalid'", fence)
        self.assertNotIn('queue_row.lease_token is distinct from p_lease_token', fence)
        self.assertIn("integrity recovery source snapshot changed", apply_sql)
        self.assertIn("integrity recovery target appeared", apply_sql)
        self.assertIn("pg_advisory_xact_lock", apply_sql)
        self.assertIn("order by source_row.id for update", apply_sql)
        self.assertIn("order by target_row.id for update", apply_sql)
        self.assertLess(apply_sql.index("-- 1단계"), apply_sql.index("-- 2단계"))
        self.assertLess(apply_sql.index("-- 2단계"), apply_sql.index("-- 3단계"))
        self.assertLess(apply_sql.index("-- 3단계"), apply_sql.index("-- 4단계"))
        self.assertLess(apply_sql.index("insert into public.translation_mappings"), apply_sql.index("set is_approved=true, translation_status='approved'"))
        self.assertIn("set state='completed'", apply_sql)

    def test_claim_uses_content_eligibility_version_and_elden_merge_order(self):
        claim_start = SQL.index('create function public.claim_translation_integrity_recovery_v2')
        claim_end = SQL.index('create function public.apply_translation_integrity_recovery_v2')
        claim_sql = SQL[claim_start:claim_end]
        self.assertIn("regexp_match(candidate.version_str", claim_sql)
        self.assertIn("elden-ring-shadow-of-the-erdtree-trainer-1768067282", claim_sql)
        self.assertIn("p_limit is null or p_limit not between 1 and 1", claim_sql)
        self.assertIn('q.next_retry_at<=pg_catalog.clock_timestamp()', claim_sql)
        self.assertIn("lease_expires_at=pg_catalog.clock_timestamp()+interval '30 minutes'", claim_sql)

    def test_finish_uses_post_lock_wall_clock_and_rejects_expired_lease(self):
        start = SQL.index('create function public.finish_translation_integrity_recovery_v2')
        end = SQL.index('create function public.renew_translation_integrity_recovery_lease_v2', start)
        finish_sql = SQL[start:end]
        # SQL의 NOT IN/BETWEEN은 NULL이면 NULL을 반환한다. 반환값 false가 아닌
        # 상태 변경으로 이어지는 우회를 막기 위해 nullable 입력을 선행 차단한다.
        self.assertIn('p_state is null', finish_sql)
        self.assertIn('p_delay_seconds is null', finish_sql)
        self.assertIn('for update', finish_sql)
        self.assertIn('lease_checked_at := pg_catalog.clock_timestamp()', finish_sql)
        self.assertIn('queue_row.lease_expires_at is null', finish_sql)
        self.assertIn('queue_row.lease_expires_at <= lease_checked_at', finish_sql)
        self.assertIn('lease_checked_at+make_interval', finish_sql)
        self.assertIn('lease_expires_at>pg_catalog.clock_timestamp()', finish_sql)
        self.assertNotIn('lease_expires_at>now()', finish_sql)
        self.assertLess(finish_sql.index('for update'), finish_sql.index('lease_checked_at := pg_catalog.clock_timestamp()'))

    def test_sql_version_comparison_matches_unbounded_component_ui_rule(self):
        self.assertNotIn("generate_series(1, 8)", SQL)
        self.assertNotIn("lpad(", SQL)
        self.assertGreaterEqual(SQL.count("::numeric[]"), 3)
        self.assertGreaterEqual(SQL.count("'(?:[.]0)+$'"), 3)

    def test_nine_plus_component_and_trailing_zero_versions_match_ui_equality(self):
        nine_component = 'v1.2.3.4.5.6.7.8.9'
        ten_component = 'v1.2.3.4.5.6.7.8.10'
        self.assertEqual(self._compare_ui_versions(nine_component, f'{nine_component}.0.0'), 0)
        self.assertGreater(self._compare_ui_versions(nine_component, ten_component), 0)
        self.assertLess(self._compare_ui_versions(ten_component, nine_component), 0)

    def test_enqueue_claim_and_apply_share_elden_and_limit_guards(self):
        enqueue_end = SQL.index('create function public.claim_translation_integrity_recovery_v2')
        enqueue_sql = SQL[:enqueue_end]
        apply_start = SQL.index('create function public.apply_translation_integrity_recovery_v2')
        apply_end = SQL.index('create function public.finish_translation_integrity_recovery_v2')
        apply_sql = SQL[apply_start:apply_end]
        for section in (enqueue_sql, SQL[enqueue_end:apply_start], apply_sql):
            self.assertIn("elden-ring-shadow-of-the-erdtree-trainer-1768067282", section)
            self.assertIn("::numeric[]", section)
        self.assertIn("p_limit not between 1 and 200", enqueue_sql)
        self.assertIn("p_limit not between 1 and 1", SQL[enqueue_end:apply_start])
        # SQL의 NULL 조건은 IF에서 false처럼 처리될 수 있으므로, NULL batch는
        # 명시 거절하고 길이도 null-safe하게 제한해야 한다.
        self.assertIn('p_batch is null', apply_sql)
        self.assertIn("jsonb_typeof(p_batch) is distinct from 'array'", apply_sql)
        self.assertIn('coalesce(jsonb_array_length(p_batch), 0) not between 1 and 64', apply_sql)

    def test_enqueue_option_pattern_covers_content_eligibility_special_keys(self):
        enqueue = SQL[:SQL.index('create function public.claim_translation_integrity_recovery_v2')]
        # content-eligibility.ts의 OPTION_KEY_PATTERN과 달리 []·=·Num 기호를 누락하면
        # 실제 noindex 항목이 복구 후보로 들어오지 못한다.
        self.assertIn(r"[\[\]]", enqueue)
        self.assertIn(r"[a-z0-9+\-=.,/]", enqueue)
        self.assertIn(r"[+\-./*]", enqueue)


if __name__ == "__main__":
    unittest.main()
