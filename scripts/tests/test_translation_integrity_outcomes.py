"""복구 claim의 완료·보류·차단·실패 집계를 실제 worker 경로로 검증한다."""

import contextlib
import copy
import hashlib
import io
import re
import types
import unittest

from test_translation_pipeline_contracts import load_functions
from test_translation_provider_failure_outcomes import provider_scope, Timeout
from translation_validation import parse_options


class FakeDb:
    """매핑은 읽기만 허용하고 worker가 호출한 RPC 상태 전이만 기록한다."""

    def __init__(self, rows, *, finish_ok=True, apply_ok=True, lease_results=None):
        self.rows = copy.deepcopy(rows)
        self.calls = []
        self.finish_ok = finish_ok
        self.apply_ok = apply_ok
        self.lease_results = list(lease_results or [])
        self.state = "ready"

    def table(self, name):
        if name != "translation_mappings":
            raise AssertionError("지정된 매핑 읽기 외 DB 요청은 허용하지 않습니다")
        return types.SimpleNamespace(select=lambda *_args: types.SimpleNamespace(
            eq=lambda *_args: types.SimpleNamespace(execute=lambda: types.SimpleNamespace(data=copy.deepcopy(self.rows))),
        ))

    def rpc(self, name, args):
        self.calls.append((name, copy.deepcopy(args)))
        def execute():
            if name == "renew_translation_integrity_recovery_lease_v2":
                data = self.lease_results.pop(0) if self.lease_results else True
            elif name == "finish_translation_integrity_recovery_v2":
                data = self.finish_ok
                if data:
                    self.state = args["p_state"]
            elif name == "apply_translation_integrity_recovery_v2":
                data = {"applied": len(args["p_batch"])} if self.apply_ok else {"applied": 0}
                if self.apply_ok:
                    self.state = "completed"
            else:
                raise AssertionError("예상하지 않은 RPC")
            return types.SimpleNamespace(data=data)
        return types.SimpleNamespace(execute=execute)


def worker_fixture(*, translator_error=None, validation_ok=True):
    """실제 scanner·preflight·lease·일괄 apply를 가짜 공급자와 함께 연결한다."""
    original = "Num 1 - Health"
    binary = bytes(200) + b"\n\n" + original.encode("ascii") + b"\x00\x00" + bytes(200)
    section = types.SimpleNamespace(PointerToRawData=64, SizeOfRawData=64)
    claim = {"trainer_id": 42, "lease_token": "fixture-token", "option_count": 1,
             "fling_url": "https://flingtrainer.com/fixture-trainer/",
             "original_file_hash": hashlib.sha256(binary).hexdigest(), "original_file_size": len(binary)}
    rows = [{"id": 1, "language_code": "ko", "offset_dec": 202, "encoding": "ASCII",
             "max_char_len": len(original), "original_text": original,
             "translated_text": "Num 1 - 체력", "is_approved": True,
             "translation_provider": "manual", "translation_status": "approved"}]
    provider = provider_scope()
    translated = []
    revalidated = []
    def translator(text, _db, **_kwargs):
        translated.append(text)
        if translator_error:
            raise translator_error(provider)
        return text
    scraper = types.SimpleNamespace(
        TRANSLATION_PROVIDER="gemini", last_llm_provider=None,
        is_official_fling_trainer_url=lambda url: url == claim["fling_url"],
        parse_pe_binary=lambda _binary: section,
        retry_failure_policy=provider["retry_failure_policy"],
        process_translation_block=translator, process_translation_block_ja=translator,
        process_translation_block_de=translator, process_translation_block_es=translator,
        revalidate_patcher_after_automation=lambda trainer: revalidated.append(trainer),
    )
    names = ["_slot_signature", "_all_offsets", "scan_option_blocks", "safe_code", "finish",
             "renew_lease", "lease_renewal_failed", "get_mappings", "preflight_slots",
             "conservative_recovery_batch_upper_bound", "scanner_slots_are_exact_superset",
             "identity_matches", "apply_prepared_batch", "prepare_missing_slot", "process_claim"]
    functions = load_functions("recover_translation_integrity.py", names, {
        "TARGET_LOCALES": ("ko", "ja", "de", "es"), "parse_options": parse_options,
        "hashlib": hashlib, "scraper": scraper,
        "extract_current_executable": lambda _url: (binary, None),
        "validate_translation": lambda **_kwargs: types.SimpleNamespace(ok=validation_ok),
    })
    return functions[-1], claim, rows, translated, revalidated


class IntegrityClaimOutcomeTests(unittest.TestCase):
    def run_claim(self, *, translator_error=None, validation_ok=True, **db_options):
        process, claim, rows, translated, revalidated = worker_fixture(
            translator_error=translator_error, validation_ok=validation_ok,
        )
        db = FakeDb(rows, **db_options)
        before = copy.deepcopy(db.rows)
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            outcome = process(db, claim, "gemini")
        self.assertEqual(db.rows, before, "승인·수동 매핑이 바뀌면 안 됩니다")
        return outcome, db, translated, revalidated, output.getvalue()

    def test_completed_requires_validated_atomic_apply(self):
        outcome, db, translated, revalidated, output = self.run_claim()
        self.assertEqual(outcome, "completed")
        self.assertEqual(db.state, "completed")
        self.assertEqual(len(translated), 3)
        self.assertEqual(revalidated, [42])
        applies = [args for name, args in db.calls if name == "apply_translation_integrity_recovery_v2"]
        self.assertEqual(len(applies), 1)
        self.assertEqual({row["mapping"]["language_code"] for row in applies[0]["p_batch"]}, {"ja", "de", "es"})
        self.assertIn("state=completed", output)

    def test_quota_and_transient_provider_failures_are_persisted_not_completed(self):
        cases = [
            (lambda scope: scope["TranslationQuotaError"]("DO_NOT_LOG"), "TRANSLATION_QUOTA", 86400),
            (lambda scope: scope["TranslationProviderError"](503), "TRANSLATION_API_TEMPORARY", 1800),
            (lambda _scope: Timeout("DO_NOT_LOG"), "TRANSLATION_API_TEMPORARY", 1800),
        ]
        for error, code, delay in cases:
            with self.subTest(code=code):
                outcome, db, translated, revalidated, output = self.run_claim(translator_error=error)
                self.assertEqual(outcome, "deferred")
                self.assertEqual(db.state, "deferred")
                self.assertEqual(len(translated), 1)
                self.assertEqual(revalidated, [])
                self.assertFalse(any(name == "apply_translation_integrity_recovery_v2" for name, _args in db.calls))
                self.assertEqual(db.calls[-1][1]["p_failure_code"], code)
                self.assertEqual(db.calls[-1][1]["p_delay_seconds"], delay)
                self.assertNotIn("DO_NOT_LOG", output)

    def test_permanent_provider_failure_and_invalid_translation_are_blocked(self):
        cases = [
            {"translator_error": lambda scope: scope["TranslationProviderError"](401)},
            {"validation_ok": False},
        ]
        for options in cases:
            with self.subTest(options=list(options)):
                outcome, db, _translated, revalidated, _output = self.run_claim(**options)
                self.assertEqual(outcome, "blocked")
                self.assertEqual(db.state, "blocked")
                self.assertEqual(revalidated, [])
                self.assertFalse(any(name == "apply_translation_integrity_recovery_v2" for name, _args in db.calls))

    def test_failed_finish_is_not_reported_as_persisted_deferral(self):
        outcome, db, _translated, revalidated, output = self.run_claim(
            translator_error=lambda scope: scope["TranslationQuotaError"]("DO_NOT_LOG"), finish_ok=False,
        )
        self.assertEqual(outcome, "failed")
        self.assertEqual(db.state, "ready")
        self.assertEqual(revalidated, [])
        self.assertIn("[INTEGRITY_QUEUE_FINISH_FAILED]", output)

    def test_lease_failure_stops_before_provider_and_apply(self):
        outcome, db, translated, revalidated, _output = self.run_claim(lease_results=[False])
        self.assertEqual(outcome, "deferred")
        self.assertEqual(translated, [])
        self.assertEqual(revalidated, [])
        self.assertEqual(db.calls[-1][1]["p_failure_code"], "LEASE_RENEWAL_FAILED")

    def test_apply_rejection_is_deferred_and_never_revalidated(self):
        outcome, db, _translated, revalidated, _output = self.run_claim(apply_ok=False)
        self.assertEqual(outcome, "deferred")
        self.assertEqual(db.state, "deferred")
        self.assertEqual(revalidated, [])
        self.assertEqual(db.calls[-1][1]["p_failure_code"], "RECOVERY_BATCH_APPLY_FAILED")


class IntegrityRunOutcomeTests(unittest.TestCase):
    def run_main(self, outcome):
        claim = {"trainer_id": 42}
        def process(*_args):
            if isinstance(outcome, Exception):
                raise outcome
            return outcome
        db = types.SimpleNamespace(rpc=lambda name, _args: types.SimpleNamespace(
            execute=lambda: types.SimpleNamespace(data=20 if name == "enqueue_translation_integrity_recovery_candidates" else [claim]),
        ))
        parser = types.SimpleNamespace(add_argument=lambda *_args, **_kwargs: None,
                                       parse_args=lambda: types.SimpleNamespace(apply=True, limit=1, provider="gemini"))
        main, = load_functions("recover_translation_integrity.py", ["main"], {
            "argparse": types.SimpleNamespace(ArgumentParser=lambda: parser),
            "os": types.SimpleNamespace(getenv=lambda _name: "fixture-only"),
            "create_client": lambda *_args: db, "scraper": types.SimpleNamespace(),
            "process_claim": process,
        })
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            status = main()
        return status, output.getvalue()

    def test_expected_deferred_and_blocked_keep_exit_zero_but_incomplete_one(self):
        for outcome in ("deferred", "blocked"):
            with self.subTest(outcome=outcome):
                status, output = self.run_main(outcome)
                self.assertEqual(status, 0)
                self.assertIn("completed=0", output)
                self.assertIn(f"{outcome}=1", output)
                self.assertIn("failed=0 incomplete=1 failures=0", output)

    def test_completed_is_the_only_complete_outcome(self):
        status, output = self.run_main("completed")
        self.assertEqual(status, 0)
        self.assertIn("completed=1 deferred=0 blocked=0 failed=0 incomplete=0", output)

    def test_invalid_legacy_boolean_and_worker_exceptions_are_real_failures(self):
        for outcome in ("failed", True, None, RuntimeError("DO_NOT_LOG")):
            with self.subTest(outcome_type=type(outcome).__name__):
                status, output = self.run_main(outcome)
                self.assertEqual(status, 1)
                self.assertIn("completed=0", output)
                self.assertIn("failed=1 incomplete=1 failures=1", output)
                self.assertNotIn("DO_NOT_LOG", output)


if __name__ == "__main__":
    unittest.main()
