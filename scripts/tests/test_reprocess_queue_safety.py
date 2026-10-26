"""자동 재시도 폭주를 막는 외부 호출 없는 계약 테스트."""

import argparse
import ast
import json
import os
import pathlib
import subprocess
import sys
import unittest
from types import SimpleNamespace
from urllib.parse import urlparse
from unittest import mock


TESTS_DIR = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(TESTS_DIR))
from test_translation_pipeline_contracts import load_functions
from test_integrity_workflow_scope import evaluate_condition


class ReprocessQueueSafetyTests(unittest.TestCase):
    def test_main_relays_only_validated_source_diagnostic_and_keeps_failure_exit(self):
        script = TESTS_DIR.parent / "reprocess_pending_translations.py"
        functions = [node for node in ast.parse(script.read_text(encoding="utf-8")).body
                     if isinstance(node, ast.FunctionDef)]
        payload = {"trainer": 2052, "locale": "ko", "reason": "COUNT_MISMATCH", "expected": 50, "actual": 2}
        for extra in ({}, {"raw": "SECRET_SENTINEL"}):
            db = mock.Mock()
            child_output = ("[SCRAPE_FAILURE] trainer=2052 locale=ko code=SOURCE_OPTION_INCOMPLETE\n"
                            "[SOURCE_OPTION_DIAGNOSTIC] " + json.dumps(dict(payload, **extra))
                            + "\nSECRET_SENTINEL https://private.invalid")
            run = mock.Mock(return_value=SimpleNamespace(returncode=1, stdout=child_output, stderr="SECRET_SENTINEL"))
            scope = {
                "argparse": argparse, "os": os, "sys": sys, "__file__": str(script),
                "subprocess": SimpleNamespace(run=run, TimeoutExpired=subprocess.TimeoutExpired),
                "time": SimpleNamespace(monotonic=lambda: 100),
                "create_client": lambda *args: db,
            }
            exec(compile(ast.Module(body=functions, type_ignores=[]), str(script), "exec"), scope)
            scope["claim_due_retry_targets"] = mock.Mock(return_value=([
                ("https://flingtrainer.com/a", 2052, "ko"),
            ], []))
            with mock.patch.dict(os.environ, {
                "NEXT_PUBLIC_SUPABASE_URL": "https://example.supabase.co",
                "SUPABASE_SERVICE_ROLE_KEY": "test-only",
            }, clear=True), mock.patch.object(sys, "argv", [str(script), "--apply"]), \
                    mock.patch("builtins.print") as output:
                self.assertEqual(scope["main"](), 1)
            lines = [call.args[0] for call in output.call_args_list]
            self.assertIn("[REPROCESS_RESULT] trainer=2052 locale=ko outcome=failed code=SOURCE_OPTION_INCOMPLETE exit=1", lines)
            diagnostic_lines = [line for line in lines if line.startswith("[REPROCESS_SOURCE_DIAGNOSTIC]")]
            self.assertEqual(diagnostic_lines, [] if extra else [
                "[REPROCESS_SOURCE_DIAGNOSTIC] trainer=2052 locale=ko reason=COUNT_MISMATCH expected=50 actual=2",
            ])
            self.assertNotIn("SECRET_SENTINEL", repr(lines))
            db.rpc.assert_not_called()
            self.assertEqual(run.call_args.kwargs["timeout"], 1740.0)

    def test_source_diagnostic_is_bounded_identity_scoped_and_not_queue_evidence(self):
        details, = load_functions("reprocess_pending_translations.py", ["child_result_details"])
        failure = "[SCRAPE_FAILURE] trainer=2052 locale=ko code=SOURCE_OPTION_INCOMPLETE"
        payload = {"trainer": 2052, "locale": "ko", "reason": "COUNT_MISMATCH", "expected": 50, "actual": 2}
        token = lambda value: "[SOURCE_OPTION_DIAGNOSTIC] " + json.dumps(value)
        for rc in (0, 1):
            result = details(rc, failure + "\n" + token(payload), 2052, "ko")
            self.assertEqual((result["outcome"], result["code"], result["queued"]),
                             ("failed", "SOURCE_OPTION_INCOMPLETE", False))
            self.assertEqual(result["source_diagnostic"], {
                "reason": "COUNT_MISMATCH", "expected": 50, "actual": 2,
            })
        for reason, expected, actual in (
            ("EXPECTED_COUNT_UNKNOWN", None, 2), ("COUNT_MISMATCH", 50, 2),
            ("UNPARSED_OPTION", 2, 2), ("SOURCE_QUALITY_FAILED", 2, 2),
        ):
            output = failure + "\n" + token(dict(payload, reason=reason, expected=expected, actual=actual))
            self.assertEqual(details(1, output, 2052, "ko")["source_diagnostic"]["reason"], reason)
        invalid = [dict(payload, **change) for change in (
            {"trainer": 2053}, {"trainer": True}, {"locale": "ja"},
            {"reason": "SECRET_SENTINEL"}, {"reason": []}, {"actual": True},
            {"actual": -1}, {"actual": 1_000_001}, {"expected": 0},
            {"expected": "SECRET_SENTINEL"}, {"actual": "https://private.invalid"},
            {"raw": "SECRET_SENTINEL"}, {"actual": 50},
        )]
        for value in invalid:
            with self.subTest(value=value):
                result = details(1, failure + "\n" + token(value), 2052, "ko")
                self.assertNotIn("source_diagnostic", result)
                self.assertNotIn("SECRET_SENTINEL", repr(result))
        for output in (
            token(payload), failure + "\n" + token(payload) + "\n" + token(payload),
            failure + "\n" + token(payload) + "\n" + token(dict(payload, actual=3)),
            failure + '\n[SOURCE_OPTION_DIAGNOSTIC] {"trainer":2052,"trainer":2052,"locale":"ko","reason":"COUNT_MISMATCH","expected":50,"actual":2}',
            failure + "\n" + token(payload) + "\n[save-outcome] trainer=2052 locale=ko status=approved",
            failure + "\n[SOURCE_OPTION_DIAGNOSTIC] SECRET_SENTINEL",
        ):
            self.assertNotIn("source_diagnostic", details(1, output, 2052, "ko"))

    def test_observed_failures_are_exact_allowlisted_and_not_queue_evidence(self):
        details, = load_functions("reprocess_pending_translations.py", ["child_result_details"])
        codes = (
            "UPSTREAM_HTTP_403", "UPSTREAM_HTTP_429", "PAGE_HTTP_FAILED", "NO_DOWNLOAD_LINKS",
            "BINARY_DOWNLOAD_FAILED", "BINARY_EMPTY_RESPONSE", "BINARY_INVALID_EXECUTABLE",
            "BINARY_PE_PARSE_FAILED", "BINARY_ARCHIVE_INVALID", "SOURCE_OPTIONS_MISSING",
            "SOURCE_TEXT_SECTION_PROTECTED", "SOURCE_OPTION_INCOMPLETE",
            "PROCESSING_EXCEPTION", "PAGE_PROCESSING_EXCEPTION",
        )
        for code in codes:
            output = f"[SCRAPE_FAILURE] trainer=2052 locale=ko code={code}"
            for rc in (0, 1):
                with self.subTest(code=code, rc=rc):
                    result = details(rc, output, 2052, "ko")
                    self.assertEqual((result["outcome"], result["code"], result["queued"]),
                                     ("failed", code, False))
            self.assertEqual(details(1, output, 2053, "ko")["code"], "REPROCESS_CHILD_FAILED")
            self.assertEqual(details(1, output, 2052, "ja")["code"], "REPROCESS_CHILD_FAILED")
        for token in ("SECRET_SENTINEL", "https://private.invalid", "PAGE_HTTP_999"):
            output = f"[SCRAPE_FAILURE] trainer=2052 locale=ko code={token}"
            self.assertEqual(details(1, output, 2052, "ko")["code"], "REPROCESS_CHILD_FAILED")
        manual = "[SCRAPE_FAILURE] trainer=0 locale=ko code=NO_DOWNLOAD_LINKS"
        self.assertEqual(details(1, manual, None, "ko")["code"], "NO_DOWNLOAD_LINKS")
        self.assertEqual(details(1, manual, 2052, "ko")["code"], "REPROCESS_CHILD_FAILED")

    def test_duplicate_or_contradictory_final_tokens_never_confirm_success_or_deferral(self):
        details, = load_functions("reprocess_pending_translations.py", ["child_result_details"])
        approved = "[save-outcome] trainer=2052 locale=ko status=approved"
        deferred = "[RETRY_QUEUED] trainer=2052 locale=ko state=deferred code=TRANSLATION_QUOTA"
        blocked = "[RETRY_QUEUED] trainer=2052 locale=ko state=blocked code=VALIDATION_FAILED"
        for output in (approved + "\n" + approved, deferred + "\n" + deferred,
                       approved + "\n" + deferred, deferred + "\n" + approved,
                       approved + "\n[save-outcome] trainer=2052 locale=ko status=rejected",
                       deferred + "\n" + blocked):
            for rc in (0, 1):
                with self.subTest(output=output, rc=rc):
                    result = details(rc, output, 2052, "ko")
                    self.assertEqual((result["outcome"], result["code"], result["queued"]),
                                     ("failed", "CHILD_RESULT_CONFLICT", False))
        self.assertEqual(details(1, approved, 2052, "ko")["outcome"], "failed")
        mixed = approved + "\n[save-outcome] trainer=2053 locale=ja status=approved"
        self.assertEqual(details(0, mixed, 2052, "ko")["outcome"], "approved")
        upstream = "[RETRY_QUEUED] trainer=2052 locale=ko state=deferred code=UPSTREAM_HTTP_403"
        observed = "[SCRAPE_FAILURE] trainer=2052 locale=ko code=UPSTREAM_HTTP_403"
        self.assertEqual(details(1, upstream + "\n" + observed, 2052, "ko")["outcome"], "deferred")

    def test_time_slots_do_not_rotate_pending_urls_automatically(self):
        select, = load_functions("reprocess_pending_translations.py", ["select_target_batch"])
        targets = list(range(45))
        self.assertEqual(select(targets, 20, now=0), (targets[:20], 0))
        self.assertEqual(select(targets, 20, now=10_800), (targets[:20], 0))
        self.assertEqual(select(targets, 20, offset=20), (targets[20:40], 20))

    def test_quota_is_a_normal_deferred_outcome(self):
        classify, = load_functions("reprocess_pending_translations.py", ["classify_child_result"])
        self.assertEqual(classify(1, "[locale-failed] error=TranslationQuotaError"), "quota_deferred")
        self.assertEqual(classify(1, "unclassified failure"), "failed")
        self.assertEqual(classify(0, ""), "success")

    def test_due_claims_keep_each_trainer_locale_independent_and_separate_invalid_sources(self):
        class Db:
            def rpc(self, name, payload):
                self.name, self.payload = name, payload
                rows = [
                    {"trainer_id": 1, "language_code": "ko", "fling_url": "https://flingtrainer.com/a"},
                    {"trainer_id": 2, "language_code": "ja", "fling_url": "https://flingtrainer.com/a"},
                    {"trainer_id": 3, "language_code": "de", "fling_url": None},
                ]
                return SimpleNamespace(execute=lambda: SimpleNamespace(data=rows))

        claim, = load_functions("reprocess_pending_translations.py", ["claim_due_retry_targets"], {
            "urlparse": urlparse,
            "TARGET_LOCALES": ("ko", "ja", "de", "es"),
        })
        db = Db()
        targets, missing = claim(db, 4)
        self.assertEqual(db.name, "claim_due_translation_retries")
        self.assertEqual(db.payload, {"p_limit": 4})
        # 같은 FLiNG 게시물이라도 claim한 trainer/locale 한 건씩만 하위 작업에
        # 전달해야 한다. URL 단위로 합치면 한 작업이 다른 대기 항목까지 처리한다.
        self.assertEqual(targets, [
            ("https://flingtrainer.com/a", 1, "ko"),
            ("https://flingtrainer.com/a", 2, "ja"),
        ])
        self.assertEqual(missing, [(3, "de")])

    def test_main_starts_one_child_per_trainer_locale_for_same_url(self):
        """동일 URL claim도 trainer/locale별로 정확히 한 번씩만 실행한다."""
        script = pathlib.Path(__file__).resolve().parents[1] / "reprocess_pending_translations.py"
        module = ast.parse(script.read_text(encoding="utf-8"))
        functions = [node for node in module.body if isinstance(node, ast.FunctionDef)]
        commands = []
        fake_db = object()
        scope = {
            "argparse": argparse,
            "os": os,
            "subprocess": subprocess,
            "time": SimpleNamespace(monotonic=lambda: 0),
            "sys": sys,
            "__file__": str(script),
            "urlparse": urlparse,
            "TARGET_LOCALES": ("ko", "ja", "de", "es"),
            "create_client": lambda endpoint, key: fake_db,
        }
        exec(compile(ast.Module(body=functions, type_ignores=[]), str(script), "exec"), scope)
        scope["claim_due_retry_targets"] = lambda db, limit: ([
            ("https://flingtrainer.com/a", 1, "ko"),
            ("https://flingtrainer.com/a", 2, "ja"),
        ], [])

        def fake_run(command, **kwargs):
            commands.append((command, kwargs))
            return SimpleNamespace(returncode=0, stdout=(
                f"[save-outcome] trainer={command[-1]} locale={command[-3]} status=approved"
            ))

        with mock.patch.dict(os.environ, {
            "NEXT_PUBLIC_SUPABASE_URL": "https://example.supabase.co",
            "SUPABASE_SERVICE_ROLE_KEY": "test-only",
        }, clear=True), mock.patch.object(
            sys, "argv", ["reprocess_pending_translations.py", "--apply", "--limit", "4"]
        ), mock.patch.object(subprocess, "run", side_effect=fake_run):
            self.assertEqual(scope["main"](), 0)

        self.assertEqual([command for command, _ in commands], [
            [sys.executable, str(script.parent / "scraper.py"), "--provider", "gemini",
             "--url", "https://flingtrainer.com/a", "--languages", "ko", "--trainer-id", "1"],
            [sys.executable, str(script.parent / "scraper.py"), "--provider", "gemini",
             "--url", "https://flingtrainer.com/a", "--languages", "ja", "--trainer-id", "2"],
        ])
        self.assertEqual([kwargs for _, kwargs in commands], [
            {"check": False, "capture_output": True, "text": True, "timeout": 870.0},
            {"check": False, "capture_output": True, "text": True, "timeout": 1740.0},
        ])

    def test_child_failures_preserve_unknown_or_terminal_queue_state_and_continue(self):
        """시간 초과·시작 실패는 큐를 덮어쓰지 않고 다음 claim을 한 번 처리한다."""
        script = TESTS_DIR.parent / "reprocess_pending_translations.py"
        functions = [node for node in ast.parse(script.read_text(encoding="utf-8")).body
                     if isinstance(node, ast.FunctionDef)]
        cases = [
            ("", "unknown"),
            ("[save-outcome] trainer=1 locale=ko status=approved", "approved"),
            ("[save-outcome] trainer=1 locale=ko status=preserved", "preserved"),
            ("[RETRY_QUEUED] trainer=1 locale=ko state=blocked code=SOURCE_IDENTITY_MISMATCH", "blocked"),
            ("[RETRY_QUEUED] trainer=1 locale=ko state=deferred code=TRANSLATION_QUOTA", "deferred"),
        ]
        failures = []
        for partial, confirmed in cases:
            for as_bytes in (False, True):
                text = partial + "\n원문 secret-token https://private.example"
                failures.append((subprocess.TimeoutExpired(
                    ["secret-command"], 870, output=text.encode() if as_bytes else text,
                    stderr=b"private-stderr-token\xff",
                ), "CHILD_TIMEOUT", confirmed))
        failures.append((OSError("원문 secret-token private-command"), "CHILD_START_FAILED", None))
        for failure, code, confirmed in failures:
            with self.subTest(code=code, confirmed=confirmed):
                db = mock.Mock()
                run = mock.Mock(side_effect=[failure, SimpleNamespace(
                    returncode=0, stdout="[save-outcome] trainer=2 locale=ja status=approved", stderr="",
                )])
                scope = {
                    "argparse": argparse, "os": os, "sys": sys, "__file__": str(script),
                    "subprocess": SimpleNamespace(run=run, TimeoutExpired=subprocess.TimeoutExpired),
                    "time": SimpleNamespace(monotonic=mock.Mock(side_effect=[100, 100, 200])),
                    "create_client": lambda *args: db,
                }
                exec(compile(ast.Module(body=functions, type_ignores=[]), str(script), "exec"), scope)
                claim = mock.Mock(return_value=([
                    ("https://flingtrainer.com/a", 1, "ko"),
                    ("https://flingtrainer.com/a", 2, "ja"),
                ], []))
                scope["claim_due_retry_targets"] = claim
                with mock.patch.dict(os.environ, {
                    "NEXT_PUBLIC_SUPABASE_URL": "https://example.supabase.co",
                    "SUPABASE_SERVICE_ROLE_KEY": "test-only",
                }, clear=True), mock.patch.object(sys, "argv", [str(script), "--apply"]), \
                        mock.patch("builtins.print") as output:
                    self.assertEqual(scope["main"](), 1)
                claim.assert_called_once_with(db, 20)
                db.rpc.assert_not_called()
                self.assertEqual(run.call_count, 2)
                self.assertEqual([call.args[0][-1] for call in run.call_args_list], ["1", "2"])
                self.assertEqual([call.kwargs for call in run.call_args_list], [
                    {"check": False, "capture_output": True, "text": True, "timeout": 870.0},
                    {"check": False, "capture_output": True, "text": True, "timeout": 1640.0},
                ])
                lines = [call.args[0] for call in output.call_args_list]
                first = next(line for line in lines if "trainer=1 " in line)
                self.assertIn(f"outcome=failed code={code}", first)
                if confirmed is not None:
                    self.assertIn(f"confirmed={confirmed}", first)
                self.assertTrue(any("trainer=2 locale=ja outcome=approved" in line for line in lines))
                self.assertIn("[REPROCESS_SUMMARY] approved=1 preserved=0 deferred=0 blocked=0 skipped=0 unconfirmed=0 failed=1", lines)
                for secret in ("원문", "secret-token", "secret-command", "private-stderr-token", "private.example"):
                    self.assertNotIn(secret, "\n".join(lines))

    def test_exhausted_claim_lease_budget_classifies_all_targets_without_spawning(self):
        """30분 lease의 정리 여유가 끝나면 자식·큐 재쓰기 없이 실패를 노출한다."""
        script = TESTS_DIR.parent / "reprocess_pending_translations.py"
        functions = [node for node in ast.parse(script.read_text(encoding="utf-8")).body
                     if isinstance(node, ast.FunctionDef)]
        db, run = mock.Mock(), mock.Mock()
        scope = {
            "argparse": argparse, "os": os, "sys": sys, "__file__": str(script),
            "subprocess": SimpleNamespace(run=run, TimeoutExpired=subprocess.TimeoutExpired),
            "time": SimpleNamespace(monotonic=mock.Mock(side_effect=[100, 1840, 1841])),
            "create_client": lambda *args: db,
        }
        exec(compile(ast.Module(body=functions, type_ignores=[]), str(script), "exec"), scope)
        scope["claim_due_retry_targets"] = lambda *args: ([
            ("https://flingtrainer.com/a", 1, "ko"),
            ("https://flingtrainer.com/a", 2, "ja"),
        ], [])
        with mock.patch.dict(os.environ, {
            "NEXT_PUBLIC_SUPABASE_URL": "https://example.supabase.co",
            "SUPABASE_SERVICE_ROLE_KEY": "test-only",
        }, clear=True), mock.patch.object(sys, "argv", [str(script), "--apply"]), \
                mock.patch("builtins.print") as output:
            self.assertEqual(scope["main"](), 1)
        run.assert_not_called()
        db.rpc.assert_not_called()
        lines = [call.args[0] for call in output.call_args_list]
        self.assertEqual(sum("code=TIME_BUDGET_EXHAUSTED" in line for line in lines), 2)
        self.assertIn("[REPROCESS_SUMMARY] approved=0 preserved=0 deferred=0 blocked=0 skipped=0 unconfirmed=0 failed=2", lines)
        sql = (TESTS_DIR.parent.parent / "supabase/migrations/202609190001_translation_retry_queue.sql").read_text(encoding="utf-8")
        self.assertIn("next_retry_at = now() + interval '30 minutes'", sql)

    def test_reprocessor_uses_all_four_locales_and_never_runs_on_schedule(self):
        scripts = pathlib.Path(__file__).resolve().parents[1]
        source = (scripts / "reprocess_pending_translations.py").read_text(encoding="utf-8")
        workflow = (scripts.parent / ".github" / "workflows" / "scraper.yml").read_text(encoding="utf-8")
        self.assertIn('TARGET_LOCALES = ("ko", "ja", "de", "es")', source)
        self.assertIn('claim_due_translation_retries', source)
        self.assertIn("reprocess-ready:", workflow)
        self.assertIn("github.event_name == 'schedule'", workflow)
        self.assertIn("reprocess_pending_translations.py --apply --provider gemini --limit 4", workflow)

    def test_scheduled_crawl_skips_existing_unapproved_trainers(self):
        scripts = pathlib.Path(__file__).resolve().parents[1]
        scraper = (scripts / "scraper.py").read_text(encoding="utf-8")
        self.assertIn("reprocess_existing_unapproved=False", scraper)
        self.assertIn("[SCHEDULED_EXISTING_PENDING_SKIPPED]", scraper)
        self.assertIn("VALIDATION_REJECTED", scraper)
        self.assertIn("TRANSLATION_QUOTA", scraper)

    def test_safe_noindex_requeue_is_explicit_chunked_and_aggregate_only(self):
        class Db:
            def __init__(self):
                self.calls = 0

            def rpc(self, name, payload):
                self.calls += 1
                self.name, self.payload = name, payload
                rows = [{"queued_count": 2, "preserved_count": 1}] if self.calls == 1 else [
                    {"queued_count": 0, "preserved_count": 0}
                ]
                return SimpleNamespace(execute=lambda: SimpleNamespace(data=rows))

        requeue, = load_functions(
            "reprocess_pending_translations.py",
            ["requeue_safe_noindex_candidates"],
        )
        db = Db()
        self.assertEqual(requeue(db, chunk_limit=500, chunks=20), (2, 1))
        self.assertEqual(db.name, "requeue_safe_noindex_translation_candidates")
        self.assertEqual(db.payload, {"p_limit": 500})
        self.assertEqual(db.calls, 2)

    def test_safe_noindex_requeue_does_not_join_the_scheduled_workflow(self):
        scripts = pathlib.Path(__file__).resolve().parents[1]
        source = (scripts / "reprocess_pending_translations.py").read_text(encoding="utf-8")
        workflow = (scripts.parent / ".github" / "workflows" / "scraper.yml").read_text(encoding="utf-8")
        self.assertIn("--requeue-safe-noindex", source)
        self.assertIn("--apply와 함께 단독", source)
        self.assertNotIn("requeue-safe-noindex", workflow)

    def test_child_outcomes_require_exact_trainer_locale_and_never_print_originals(self):
        details, = load_functions("reprocess_pending_translations.py", ["child_result_details"])
        cases = [
            (0, "[save-outcome] trainer=2730 locale=ko status=approved", "approved", "NONE"),
            (0, "[save-outcome] trainer=2730 locale=ko status=preserved", "preserved", "NONE"),
            (0, "[RETRY_PROTECTED] trainer=2730 locale=ko", "preserved", "EXISTING_MAPPING_PROTECTED"),
            (1, "[RETRY_QUEUED] trainer=2730 locale=ko state=deferred code=TRANSLATION_QUOTA", "deferred", "TRANSLATION_QUOTA"),
            (1, "[RETRY_QUEUED] trainer=2730 locale=ko state=blocked code=VALIDATION_FAILED", "blocked", "VALIDATION_FAILED"),
            (0, "[ARCHIVE_ONLY_PAGE_SKIPPED] neutral", "skipped", "ARCHIVE_RAR_ONLY"),
            (0, "", "unconfirmed", "CHILD_RESULT_UNCONFIRMED"),
            (1, "ModuleNotFoundError: secret module body", "failed", "CHILD_DEPENDENCY_MISSING"),
            (1, "Authorization: Bearer secret-key\nhttps://secret.example/private", "failed", "REPROCESS_CHILD_FAILED"),
            (0, "[save-outcome] trainer=2731 locale=ko status=approved", "unconfirmed", "CHILD_RESULT_UNCONFIRMED"),
            (0, "[save-outcome] trainer=2730 locale=ja status=approved", "unconfirmed", "CHILD_RESULT_UNCONFIRMED"),
            (1, "[RETRY_QUEUED] trainer=2730 locale=ko state=deferred code=PRIVATE_SECRET", "failed", "REPROCESS_CHILD_FAILED"),
        ]
        for rc, output, outcome, code in cases:
            with self.subTest(output=output):
                result = details(rc, output, 2730, "ko")
                self.assertEqual((result["outcome"], result["code"]), (outcome, code))
                self.assertNotIn("secret", str(result).lower())

    def test_provider_diagnostics_do_not_turn_successful_fallback_into_failure(self):
        details, = load_functions("reprocess_pending_translations.py", ["child_result_details"])
        result = details(0, (
            "[TRANSLATION_PROVIDER_FAILED] provider=GEMINI code=TRANSLATION_PERMANENT status=402\n"
            "[save-outcome] trainer=2730 locale=ko status=approved\n"
            "[TRANSLATION_PROVIDER_FAILED] provider=secret code=TRANSLATION_PERMANENT status=402"
        ), 2730, "ko")
        self.assertEqual(result["outcome"], "approved")
        self.assertEqual(result["providers"], [("GEMINI", "TRANSLATION_PERMANENT", "NONE", "402")])

    def test_provider_quota_diagnostics_match_only_scraper_fixed_reason_codes(self):
        """생성자·출력부와 같은 고정 사유만 허용하고 외부 원문은 거절한다."""
        details, = load_functions("reprocess_pending_translations.py", ["child_result_details"])
        reasons = {
            "UNKNOWN", "RUN_REQUEST_CAP", "RUN_CHAR_CAP", "MONTHLY_CONFIG_MISSING",
            "MONTHLY_CONFIG_REJECTED", "MONTHLY_RESERVE_FAILED",
            "MONTHLY_QUOTA_EXHAUSTED", "MONTHLY_FINALIZE_FAILED", "PROVIDER_HTTP_QUOTA",
        }
        scraper = ast.parse((TESTS_DIR.parent / "scraper.py").read_text(encoding="utf-8"))
        quota_class = next(node for node in scraper.body
                           if isinstance(node, ast.ClassDef) and node.name == "TranslationQuotaError")
        class_reasons = next(node for node in ast.walk(quota_class) if isinstance(node, ast.Set))
        self.assertEqual(ast.literal_eval(class_reasons), reasons)
        output_reasons = next(node.value for node in ast.walk(scraper)
                              if isinstance(node, ast.Assign) and any(
                                  isinstance(target, ast.Name) and target.id == "quota_reasons"
                                  for target in node.targets))
        self.assertEqual(ast.literal_eval(output_reasons), reasons)
        for reason in sorted(reasons):
            with self.subTest(reason=reason):
                output = ("[TRANSLATION_PROVIDER_FAILED] provider=GEMINI "
                          f"code=TRANSLATION_QUOTA quota_reason={reason} status=429")
                self.assertEqual(details(1, output, 1, "ko")["providers"], [
                    ("GEMINI", "TRANSLATION_QUOTA", reason, "429"),
                ])
        for reason in ("PRIVATE_SECRET", "unknown", "UNKNOWN extra=secret", "원문_비밀"):
            output = ("[TRANSLATION_PROVIDER_FAILED] provider=GEMINI "
                      f"code=TRANSLATION_QUOTA quota_reason={reason} status=429")
            self.assertEqual(details(1, output, 1, "ko")["providers"], [])

    def test_unconfirmed_completed_child_preserves_committed_state_and_claim_lease(self):
        """완료된 자식의 출력이 불확실해도 부모는 종결 상태·lease를 덮어쓰지 않는다."""
        script = TESTS_DIR.parent / "reprocess_pending_translations.py"
        functions = [node for node in ast.parse(script.read_text(encoding="utf-8")).body
                     if isinstance(node, ast.FunctionDef)]
        cases = [
            (0, "", "unconfirmed"),
            (0, "[save-outcome] trainer=3 locale=ko status=approved", "unconfirmed"),
            (0, "[save-outcome] trainer=1 locale=ja status=approved", "unconfirmed"),
            (1, "", "failed"),
            (1, "[save-outcome] trainer=1 locale=ko status=approved", "failed"),
            (0, "[RETRY_QUEUED] trainer=1 locale=ko state=blocked code=UNKNOWN_CODE", "unconfirmed"),
            (1, "[RETRY_QUEUED] trainer=1 locale=ko state=deferred code=UNKNOWN_CODE", "failed"),
        ]
        for returncode, stdout, outcome in cases:
            for committed_state in ("blocked", "approved", "leased"):
                with self.subTest(returncode=returncode, outcome=outcome, state=committed_state):
                    # 자식이 이미 blocked를 저장하거나 승인 후 큐를 삭제한 상황과
                    # 아직 claim lease만 남은 상황을 외부 연결 없이 모사한다.
                    initial_queue = None if committed_state == "approved" else {
                        "state": "blocked" if committed_state == "blocked" else "deferred",
                        "next_retry_at": 1800,
                    }
                    db = mock.Mock()
                    db.queue = initial_queue.copy() if initial_queue is not None else None

                    def overwrite_queue(*args, **kwargs):
                        db.queue = {"state": "deferred", "next_retry_at": 3600}
                        return SimpleNamespace(execute=lambda: SimpleNamespace(data=True))

                    db.rpc.side_effect = overwrite_queue
                    run = mock.Mock(side_effect=[
                        SimpleNamespace(returncode=returncode, stdout=stdout, stderr=""),
                        SimpleNamespace(returncode=0, stdout=(
                            "[save-outcome] trainer=2 locale=ja status=approved"
                        ), stderr=""),
                    ])
                    scope = {
                        "argparse": argparse, "os": os, "sys": sys, "__file__": str(script),
                        "subprocess": SimpleNamespace(run=run, TimeoutExpired=subprocess.TimeoutExpired),
                        "time": SimpleNamespace(monotonic=lambda: 0),
                        "create_client": lambda *args: db,
                    }
                    exec(compile(ast.Module(body=functions, type_ignores=[]), str(script), "exec"), scope)
                    claim = mock.Mock(return_value=([
                        ("https://flingtrainer.com/a", 1, "ko"),
                        ("https://flingtrainer.com/a", 2, "ja"),
                    ], []))
                    scope["claim_due_retry_targets"] = claim
                    with mock.patch.dict(os.environ, {
                        "NEXT_PUBLIC_SUPABASE_URL": "https://example.supabase.co",
                        "SUPABASE_SERVICE_ROLE_KEY": "test-only",
                    }, clear=True), mock.patch.object(sys, "argv", [str(script), "--apply"]), \
                            mock.patch("builtins.print") as output:
                        self.assertEqual(scope["main"](), 1)
                    claim.assert_called_once_with(db, 20)
                    db.rpc.assert_not_called()
                    self.assertEqual(db.queue, initial_queue)
                    self.assertEqual(run.call_count, 2)
                    self.assertEqual([call.args[0][-1] for call in run.call_args_list], ["1", "2"])
                    self.assertEqual([call.kwargs for call in run.call_args_list], [
                        {"check": False, "capture_output": True, "text": True, "timeout": 870.0},
                        {"check": False, "capture_output": True, "text": True, "timeout": 1740.0},
                    ])
                    lines = [call.args[0] for call in output.call_args_list]
                    self.assertTrue(any(f"trainer=1 locale=ko outcome={outcome}" in line for line in lines))
                    self.assertTrue(any("trainer=2 locale=ja outcome=approved" in line for line in lines))
                    self.assertIn(
                        "[REPROCESS_SUMMARY] approved=1 preserved=0 deferred=0 blocked=0 skipped=0 "
                        f"unconfirmed={int(outcome == 'unconfirmed')} failed={int(outcome == 'failed')}",
                        lines,
                    )

    def test_legacy_recovery_claim_is_explicit_and_not_the_default(self):
        class Db:
            def rpc(self, name, payload):
                self.name, self.payload = name, payload
                return SimpleNamespace(execute=lambda: SimpleNamespace(data=[]))

        claim, = load_functions("reprocess_pending_translations.py", ["claim_due_retry_targets"], {
            "urlparse": urlparse, "TARGET_LOCALES": ("ko", "ja", "de", "es"),
        })
        db = Db()
        claim(db, 4, [2730])
        self.assertEqual(db.name, "claim_legacy_internal_quota_recovery")
        self.assertEqual(db.payload, {"p_limit": 4, "p_trainer_ids": [2730]})
        claim(db, 4)
        self.assertEqual(db.name, "claim_due_translation_retries")

    def test_retry_only_workflow_preserves_scheduled_batch_and_is_shell_safe(self):
        scripts = pathlib.Path(__file__).resolve().parents[1]
        workflow = (scripts.parent / ".github/workflows/scraper.yml").read_text(encoding="utf-8")
        self.assertIn("retry_only:", workflow)
        self.assertIn("recover_internal_quota_trainer:", workflow)
        # 기존 두 작업의 차단 조건은 유지한다. 무결성 복구는 새 허용 목록을 실제 식으로 검증한다.
        self.assertEqual(workflow.count("github.event.inputs.retry_only != 'true'"), 2)
        for job_name, next_job in (("drain-patcher-revalidation-outbox", "crawl"),
                                   ("crawl", "reprocess-ready")):
            job = workflow.split(f"  {job_name}:\n", 1)[1].split(f"\n  {next_job}:\n", 1)[0]
            condition_line = next(line for line in job.splitlines() if line.startswith("    if: "))
            self.assertIn("github.event.inputs.retry_only != 'true'", condition_line)
        integrity = workflow.split("  integrity-recovery:\n", 1)[1]
        condition_line = next(line for line in integrity.splitlines() if line.startswith("    if: "))
        expression = condition_line.split("${{ ", 1)[1].rsplit(" }}", 1)[0]
        context = {
            "github.ref": "refs/heads/main",
            "github.event_name": "workflow_dispatch",
            "github.event.inputs.target_url": "",
            "github.event.inputs.recover_internal_quota_trainer": "",
            "needs.validate-inputs.result": "success",
            "needs.crawl.result": "success",
            "needs.reprocess-ready.result": "failure",
            "cancelled()": False,
        }
        for retry, expected in (("", True), ("false", True), ("true", False), ("unexpected", False)):
            with self.subTest(retry=retry):
                self.assertEqual(evaluate_condition(expression, {
                    **context, "github.event.inputs.retry_only": retry,
                }), expected)
        self.assertIn('2730|2731)', workflow)
        self.assertIn('--recover-internal-quota-trainer "$RECOVERY_TRAINER"', workflow)
        self.assertNotIn('--recover-internal-quota-trainer "${{', workflow)
        self.assertIn("--discovery-limit 3", workflow)
        self.assertIn("recover_translation_integrity.py --apply --provider gemini --limit 1", workflow)
        self.assertIn("validate-inputs:", workflow)
        self.assertIn("needs: [validate-inputs, crawl]", workflow)
        self.assertIn("needs.validate-inputs.result == 'success'", workflow)
        self.assertIn("[RETRY_ONLY_TARGET_URL_CONFLICT]", workflow)

    def test_retry_target_mismatch_cannot_insert_or_translate(self):
        """제품의 실제 early-continue 블록을 실행하여 미등록/다른 해시의 외부 쓰기를 막는다."""
        script = pathlib.Path(__file__).resolve().parents[1] / "scraper.py"
        tree = ast.parse(script.read_text(encoding="utf-8"))
        fn = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == "scrape_and_patch_trainer")
        guard = next(node for node in ast.walk(fn) if isinstance(node, ast.If)
                     and "retry_identity_mismatch = True" in ast.unparse(node)
                     and "not any(" in ast.unparse(node.test))
        guard_line = guard.lineno
        inserts = [node.lineno for node in ast.walk(fn) if isinstance(node, ast.Call)
                   and isinstance(node.func, ast.Attribute) and node.func.attr == "insert"]
        self.assertTrue(inserts and all(line > guard_line for line in inserts))
        # 실제 guard 뒤에 등록/번역 호출을 배치한 격리 루프이다.
        module = ast.Module(body=[ast.For(
            target=ast.Name(id="_", ctx=ast.Store()), iter=ast.Tuple(elts=[ast.Constant(1)], ctx=ast.Load()),
            body=[guard, ast.Expr(value=ast.Call(func=ast.Name(id="insert", ctx=ast.Load()), args=[], keywords=[])),
                  ast.Expr(value=ast.Call(func=ast.Name(id="translate", ctx=ast.Load()), args=[], keywords=[]))],
            orelse=[],
        )], type_ignores=[])
        ast.fix_missing_locations(module)
        for target, rows, calls in [(2730, [], 0), (2730, [{"id": 2731}], 0),
                                    (2730, [{"id": 2730}], 1), (None, [], 1)]:
            insert, translate = mock.Mock(), mock.Mock()
            namespace = {"target_trainer_id": target, "trainer_res": SimpleNamespace(data=rows),
                         "insert": insert, "translate": translate, "print": lambda *args: None}
            exec(compile(module, str(script), "exec"), namespace)
            self.assertEqual(insert.call_count, calls)
            self.assertEqual(translate.call_count, calls)

    def test_duplicate_hash_selects_exact_target_before_any_game_update(self):
        """조회 첫 행이 다른 trainer라도 claim 대상의 game_id만 선택한다."""
        script = pathlib.Path(__file__).resolve().parents[1] / "scraper.py"
        tree = ast.parse(script.read_text(encoding="utf-8"))
        fn = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == "scrape_and_patch_trainer")
        selection = next(node for node in ast.walk(fn) if isinstance(node, ast.Assign)
                         and any(isinstance(t, ast.Name) and t.id == "matched_trainer_rows" for t in node.targets))
        module = ast.fix_missing_locations(ast.Module(body=[selection], type_ignores=[]))
        for target, expected in [(2730, 30), (None, 31)]:
            namespace = {"target_trainer_id": target, "trainer_res": SimpleNamespace(data=[
                {"id": 2731, "game_id": 31}, {"id": 2730, "game_id": 30},
            ])}
            exec(compile(module, str(script), "exec"), namespace)
            self.assertEqual(namespace["matched_trainer_rows"][0]["game_id"], expected)
        source = ast.unparse(fn)
        self.assertIn("trainer_id = matched_trainer_rows[0]['id']", source)
        self.assertIn("game_id = matched_trainer_rows[0]['game_id']", source)
        self.assertNotIn("trainer_id = trainer_res.data[0]['id']", source)


if __name__ == "__main__":
    unittest.main()
