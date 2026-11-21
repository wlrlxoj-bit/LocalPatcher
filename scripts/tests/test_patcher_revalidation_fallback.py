"""패처 재검증 웹훅 실패 시 DB RPC fallback과 부분 승인·안전 중계 계약을 격리 검증한다."""

import ast
import contextlib
import hashlib
import io
import os
import pathlib
import subprocess
import sys
import types
import unittest
import zipfile
from unittest import mock


SCRIPTS_DIR = pathlib.Path(__file__).resolve().parents[1]
SCRAPER_SOURCE = SCRIPTS_DIR / "scraper.py"
REPROCESS_SOURCE = SCRIPTS_DIR / "reprocess_pending_translations.py"

SECRET_URL = "https://secret-endpoint.invalid/api/internal/revalidate-patcher?token=SECRET_TOKEN"
SECRET_KEY = "SECRET_REVALIDATE_KEY_DO_NOT_LOG"
SECRET_BODY = "SECRET_RESPONSE_BODY_DO_NOT_LOG"


class FakeRequestException(Exception):
    """외부 requests 패키지 없이 네트워크 예외를 모사한다."""


def load_revalidate_scope(*, url=SECRET_URL, secret=SECRET_KEY, post_mock=None):
    """scraper.py에서 revalidate_patcher_after_automation만 AST로 격리 로드한다."""
    tree = ast.parse(SCRAPER_SOURCE.read_text(encoding="utf-8"))
    fn = next(
        node for node in tree.body
        if isinstance(node, ast.FunctionDef) and node.name == "revalidate_patcher_after_automation"
    )
    requests_mod = types.SimpleNamespace(
        post=post_mock if post_mock is not None else mock.Mock(),
        RequestException=FakeRequestException,
    )
    scope = {
        "PATCHER_REVALIDATE_URL": url,
        "PATCHER_REVALIDATE_SECRET": secret,
        "requests": requests_mod,
    }
    exec(compile(ast.Module(body=[fn], type_ignores=[]), str(SCRAPER_SOURCE), "exec"), scope)
    return scope, requests_mod.post


def load_scraper_loop_scope(*, validate_side_effect, save_side_effect=None):
    """scrape_and_patch_trainer와 page_result만 외부 호출 없이 격리 로드한다."""
    class Link(dict):
        text = "Fixture Trainer +2"

    anchor = Link(href="https://fixture.invalid/downloads/fixture.exe")
    soup = mock.Mock()
    soup.select_one.return_value = None
    soup.select.return_value = [anchor]
    response = types.SimpleNamespace(status_code=200, content=b"MZfixture", text="ok")

    db = mock.Mock()

    def table(name):
        query = mock.Mock()
        for method in ("select", "eq", "update", "range"):
            getattr(query, method).return_value = query
        query.execute.return_value = types.SimpleNamespace(
            data=[{"id": 2052, "game_id": 1}] if name == "trainers" else []
        )
        return query

    db.table.side_effect = table
    translator = mock.Mock(return_value="Num 1 - 번역됨")
    revalidate_mock = mock.Mock(return_value=True)
    schedule_retry_mock = mock.Mock(return_value=True)

    scope = {
        "Client": object,
        "SUPABASE_URL": "fixture",
        "SUPABASE_KEY": "fixture",
        "db_dictionary_ko": {},
        "db_dictionary_ja": {},
        "paced_fling_get": mock.Mock(return_value=response),
        "BeautifulSoup": lambda *args: soup,
        "latest_supported_download": lambda links: (anchor, 0),
        "normalize_fling_slug": lambda value: "fixture",
        "recover_official_archive": lambda value, headers: value,
        "retry_after_delay_seconds": lambda *args, **kwargs: 0,
        "sleep_for_fling_retry": lambda *args: False,
        "should_retry_upstream_status": lambda *args: False,
        "defer_existing_trainers_for_upstream": mock.Mock(return_value=False),
        "is_rar_archive": lambda *args: False,
        "hashlib": hashlib,
        "zipfile": zipfile,
        "io": io,
        "parse_pe_binary": mock.Mock(
            return_value=types.SimpleNamespace(PointerToRawData=0, SizeOfRawData=2)
        ),
        "scan_cheat_string_offset": mock.Mock(return_value={
            "offset_dec": 10,
            "original_text": "Num 1 - Health",
            "encoding": "utf-8",
            "max_char_len": 100,
        }),
        "parse_trainer_version": lambda text: ("v1", 1),
        "source_block_completeness": lambda *args: (True, 1),
        "TRANSLATION_PROVIDER": "gemini",
        "FLING_429_RETRY_MAX_SECONDS": 10,
        "process_translation_block": translator,
        "process_translation_block_ja": translator,
        "process_translation_block_de": translator,
        "process_translation_block_es": translator,
        "validate_translation": mock.Mock(side_effect=validate_side_effect),
        "save_validated_draft": mock.Mock(
            side_effect=save_side_effect
        ) if save_side_effect is not None else mock.Mock(return_value=types.SimpleNamespace(value="approved")),
        "complete_translation_retry": mock.Mock(),
        "schedule_translation_retry": schedule_retry_mock,
        "retry_failure_policy": mock.Mock(return_value=("blocked", "TRANSLATION_PERMANENT", 0)),
        "learn_approved_option_labels": mock.Mock(),
        "revalidate_patcher_after_automation": revalidate_mock,
    }
    tree = ast.parse(SCRAPER_SOURCE.read_text(encoding="utf-8"))
    functions = [
        node for node in tree.body
        if isinstance(node, ast.FunctionDef)
        and node.name in {"scrape_and_patch_trainer", "page_result"}
    ]
    exec(compile(ast.Module(body=functions, type_ignores=[]), str(SCRAPER_SOURCE), "exec"), scope)
    return scope, db, revalidate_mock, schedule_retry_mock


def load_reprocess_scope(extra_scope=None):
    """reprocess_pending_translations.py의 함수만 AST로 격리 로드한다."""
    tree = ast.parse(REPROCESS_SOURCE.read_text(encoding="utf-8"))
    functions = [node for node in tree.body if isinstance(node, ast.FunctionDef)]
    scope = dict(extra_scope or {})
    exec(compile(ast.Module(body=functions, type_ignores=[]), str(REPROCESS_SOURCE), "exec"), scope)
    return scope


class PatcherRevalidationFallbackTests(unittest.TestCase):
    def test_webhook_200_succeeds_without_calling_db_fallback(self):
        post_mock = mock.Mock(return_value=types.SimpleNamespace(status_code=200, text=SECRET_BODY))
        scope, _ = load_revalidate_scope(post_mock=post_mock)
        db = mock.Mock()
        db.rpc.return_value.execute.return_value = types.SimpleNamespace(data=4, error=None)
        stdout, stderr = io.StringIO(), io.StringIO()

        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            ok = scope["revalidate_patcher_after_automation"](42, db=db)

        self.assertTrue(ok)
        post_mock.assert_called_once_with(
            SECRET_URL,
            headers={"Authorization": f"Bearer {SECRET_KEY}"},
            json={"trainerId": 42},
            timeout=10,
        )
        db.rpc.assert_not_called()
        combined = stdout.getvalue() + stderr.getvalue()
        self.assertIn("[PATCHER_REVALIDATED] trainer=42", stdout.getvalue())
        self.assertEqual(stderr.getvalue(), "")
        for secret in (SECRET_URL, SECRET_KEY, SECRET_BODY):
            self.assertNotIn(secret, combined)

    def test_webhook_failures_and_missing_config_use_db_rpc_fallback(self):
        cases = [
            (
                "http_402",
                SECRET_URL,
                SECRET_KEY,
                mock.Mock(return_value=types.SimpleNamespace(status_code=402, text=SECRET_BODY)),
                "[PATCHER_REVALIDATE_FAILED] trainer=42 status=402",
            ),
            (
                "http_503",
                SECRET_URL,
                SECRET_KEY,
                mock.Mock(return_value=types.SimpleNamespace(status_code=503, text=SECRET_BODY)),
                "[PATCHER_REVALIDATE_FAILED] trainer=42 status=503",
            ),
            (
                "network_error",
                SECRET_URL,
                SECRET_KEY,
                mock.Mock(side_effect=FakeRequestException(f"boom {SECRET_URL} {SECRET_KEY}")),
                "[PATCHER_REVALIDATE_FAILED] trainer=42 status=network",
            ),
            (
                "non_request_exception",
                SECRET_URL,
                SECRET_KEY,
                mock.Mock(side_effect=ValueError(f"SECRET {SECRET_URL} {SECRET_KEY}")),
                "[PATCHER_REVALIDATE_FAILED] trainer=42 status=0",
            ),
            (
                "missing_url",
                "",
                SECRET_KEY,
                mock.Mock(),
                "[PATCHER_REVALIDATE_NOT_CONFIGURED]",
            ),
            (
                "missing_secret",
                SECRET_URL,
                None,
                mock.Mock(),
                "[PATCHER_REVALIDATE_NOT_CONFIGURED]",
            ),
        ]
        for label, url, secret, post_mock, expected_marker in cases:
            with self.subTest(case=label):
                scope, _ = load_revalidate_scope(url=url, secret=secret, post_mock=post_mock)
                db = mock.Mock()
                db.rpc.return_value.execute.return_value = types.SimpleNamespace(data=4, error=None)
                stdout, stderr = io.StringIO(), io.StringIO()

                with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
                    ok = scope["revalidate_patcher_after_automation"](42, db=db)

                self.assertTrue(ok)
                db.rpc.assert_called_once_with(
                    "refresh_patcher_index_and_enqueue",
                    {"p_trainer_id": 42},
                )
                db.rpc.return_value.execute.assert_called_once_with()
                out = stdout.getvalue()
                self.assertIn(expected_marker, out)
                self.assertIn("[PATCHER_REVALIDATE_FALLBACK_ENQUEUED] trainer=42", out)
                self.assertEqual(stderr.getvalue(), "")
                for forbidden in ("SECRET", SECRET_URL, SECRET_KEY, SECRET_BODY):
                    self.assertNotIn(forbidden, out + stderr.getvalue())

    def test_webhook_and_db_fallback_both_failing_logs_safe_marker_and_returns_false(self):
        post_mock = mock.Mock(return_value=types.SimpleNamespace(status_code=402, text=SECRET_BODY))
        scope, _ = load_revalidate_scope(post_mock=post_mock)
        db = mock.Mock()
        db_secret = "DB_SECRET_EXCEPTION_TOKEN https://db-secret.invalid"
        db.rpc.return_value.execute.side_effect = RuntimeError(db_secret)
        stdout, stderr = io.StringIO(), io.StringIO()

        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            ok = scope["revalidate_patcher_after_automation"](42, db=db)

        self.assertFalse(ok)
        db.rpc.assert_called_once_with(
            "refresh_patcher_index_and_enqueue",
            {"p_trainer_id": 42},
        )
        out = stdout.getvalue()
        self.assertIn("[PATCHER_REVALIDATE_FAILED] trainer=42 status=402", out)
        self.assertIn("[PATCHER_REVALIDATE_FALLBACK_FAILED] trainer=42", out)
        self.assertNotIn("[PATCHER_REVALIDATE_FALLBACK_ENQUEUED]", out)
        self.assertEqual(stderr.getvalue(), "")
        for forbidden in (db_secret, "DB_SECRET_EXCEPTION_TOKEN", "db-secret.invalid", SECRET_URL, SECRET_KEY, SECRET_BODY):
            self.assertNotIn(forbidden, out + stderr.getvalue())

    def test_db_fallback_invalid_rpc_results_fail_safely_and_return_false(self):
        invalid_results = [
            ("none_result", None),
            ("none_data", types.SimpleNamespace(data=None, error=None)),
            ("bool_false_data", types.SimpleNamespace(data=False, error=None)),
            ("bool_true_data", types.SimpleNamespace(data=True, error=None)),
            ("negative_data", types.SimpleNamespace(data=-1, error=None)),
            ("rpc_error_present", types.SimpleNamespace(data=1, error="err")),
        ]
        for label, rpc_result in invalid_results:
            with self.subTest(case=label):
                post_mock = mock.Mock(return_value=types.SimpleNamespace(status_code=402, text=SECRET_BODY))
                scope, _ = load_revalidate_scope(post_mock=post_mock)
                db = mock.Mock()
                db.rpc.return_value.execute.return_value = rpc_result
                stdout, stderr = io.StringIO(), io.StringIO()

                with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
                    ok = scope["revalidate_patcher_after_automation"](42, db=db)

                self.assertFalse(ok)
                out = stdout.getvalue()
                self.assertIn("[PATCHER_REVALIDATE_FAILED] trainer=42 status=402", out)
                self.assertIn("[PATCHER_REVALIDATE_FALLBACK_FAILED] trainer=42", out)
                self.assertNotIn("[PATCHER_REVALIDATE_FALLBACK_ENQUEUED]", out)
                self.assertEqual(stderr.getvalue(), "")

    def test_without_db_returns_false_when_webhook_fails_or_unconfigured(self):
        cases = [
            ("webhook_failed", SECRET_URL, SECRET_KEY, mock.Mock(return_value=types.SimpleNamespace(status_code=402, text=SECRET_BODY)), "[PATCHER_REVALIDATE_FAILED] trainer=42 status=402"),
            ("unconfigured", "", None, mock.Mock(), "[PATCHER_REVALIDATE_NOT_CONFIGURED]"),
        ]
        for label, url, secret, post_mock, expected_marker in cases:
            with self.subTest(case=label):
                scope, _ = load_revalidate_scope(url=url, secret=secret, post_mock=post_mock)
                stdout, stderr = io.StringIO(), io.StringIO()

                with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
                    ok = scope["revalidate_patcher_after_automation"](42, db=None)

                self.assertFalse(ok)
                out = stdout.getvalue()
                self.assertIn(expected_marker, out)
                self.assertNotIn("[PATCHER_REVALIDATE_FALLBACK_ENQUEUED]", out)
                self.assertNotIn("[PATCHER_REVALIDATE_FALLBACK_FAILED]", out)
                self.assertEqual(stderr.getvalue(), "")

    def test_invalid_trainer_id_skips_db_fallback_and_returns_false(self):
        for bad_id in (0, -1, True, None):
            for configured in (True, False):
                with self.subTest(bad_id=bad_id, configured=configured):
                    post_mock = mock.Mock(return_value=types.SimpleNamespace(status_code=402, text=SECRET_BODY))
                    scope, _ = load_revalidate_scope(
                        url=SECRET_URL if configured else "",
                        secret=SECRET_KEY if configured else None,
                        post_mock=post_mock,
                    )
                    db = mock.Mock()
                    db.rpc.return_value.execute.return_value = types.SimpleNamespace(data=4, error=None)
                    stdout = io.StringIO()
                    with contextlib.redirect_stdout(stdout):
                        ok = scope["revalidate_patcher_after_automation"](bad_id, db=db)

                    self.assertFalse(ok)
                    post_mock.assert_not_called()
                    db.rpc.assert_not_called()

    def test_partial_locale_approval_calls_revalidation_and_keeps_failure_contract(self):
        def validate_partial(**kwargs):
            if kwargs["language_code"] == "ko":
                return types.SimpleNamespace(ok=True, issues=[], codes=[])
            return types.SimpleNamespace(ok=False, issues=[], codes=["OPTION_MISMATCH"])

        scope, db, revalidate_mock, schedule_retry_mock = load_scraper_loop_scope(
            validate_side_effect=validate_partial,
        )
        report = mock.Mock()
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            result = scope["scrape_and_patch_trainer"](
                {"link": "https://fixture.invalid/post", "title": "Fixture Trainer", "slug": "fixture"},
                db,
                languages=["ko", "ja"],
                target_trainer_id=2052,
                outcome_reporter=report,
            )

        self.assertFalse(result)
        revalidate_mock.assert_called_once_with(2052, db=db)
        schedule_retry_mock.assert_called_once_with(
            db, 2052, "ja", "blocked", "VALIDATION_FAILED", 0,
        )
        self.assertIn(("blocked", "TRANSLATION_OR_VALIDATION_FAILED"), [c.args for c in report.call_args_list])

    def test_preserved_and_rejected_locale_combinations_control_revalidation(self):
        def validate_all_ok(**_kwargs):
            return types.SimpleNamespace(ok=True, issues=[], codes=[])

        cases = [
            (
                "ko_preserved_ja_rejected_skips_revalidation",
                [types.SimpleNamespace(value="preserved"), types.SimpleNamespace(value="rejected")],
                False,
                False,
            ),
            (
                "ko_preserved_ja_approved_calls_revalidation",
                [types.SimpleNamespace(value="preserved"), types.SimpleNamespace(value="approved")],
                True,
                True,
            ),
            (
                "all_preserved_calls_revalidation",
                [types.SimpleNamespace(value="preserved"), types.SimpleNamespace(value="preserved")],
                True,
                True,
            ),
        ]
        for label, outcomes, expected_result, expected_revalidation in cases:
            with self.subTest(case=label):
                scope, db, revalidate_mock, _ = load_scraper_loop_scope(
                    validate_side_effect=validate_all_ok,
                    save_side_effect=outcomes,
                )
                output = io.StringIO()
                with contextlib.redirect_stdout(output):
                    result = scope["scrape_and_patch_trainer"](
                        {"link": "https://fixture.invalid/post", "title": "Fixture Trainer", "slug": "fixture"},
                        db,
                        languages=["ko", "ja"],
                        target_trainer_id=2052,
                    )

                self.assertEqual(result, expected_result)
                if expected_revalidation:
                    revalidate_mock.assert_called_once_with(2052, db=db)
                else:
                    revalidate_mock.assert_not_called()

    def test_all_locales_failing_does_not_call_revalidation(self):
        def validate_all_fail(**_kwargs):
            return types.SimpleNamespace(ok=False, issues=[], codes=["OPTION_MISMATCH"])

        scope, db, revalidate_mock, _ = load_scraper_loop_scope(
            validate_side_effect=validate_all_fail,
        )
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            result = scope["scrape_and_patch_trainer"](
                {"link": "https://fixture.invalid/post", "title": "Fixture Trainer", "slug": "fixture"},
                db,
                languages=["ko", "ja"],
                target_trainer_id=2052,
            )

        self.assertFalse(result)
        revalidate_mock.assert_not_called()

    def test_reprocess_child_result_details_relays_only_strict_revalidation_markers(self):
        scope = load_reprocess_scope()
        details = scope["child_result_details"]

        child_stdout = "\n".join([
            "[save-outcome] trainer=42 locale=ko status=approved",
            "[PATCHER_REVALIDATE_FAILED] trainer=42 status=0",
            "[PATCHER_REVALIDATE_FAILED] trainer=42 status=402",
            "[PATCHER_REVALIDATE_FALLBACK_ENQUEUED] trainer=42",
            # 다른 trainer(prefix 포함) 또는 위조·오염 라인은 무시되어야 한다.
            "[PATCHER_REVALIDATE_FAILED] trainer=420 status=402",
            "[PATCHER_REVALIDATED] trainer=420",
            "[PATCHER_REVALIDATE_FAILED] trainer=99 status=402",
            "[PATCHER_REVALIDATE_FALLBACK_ENQUEUED] trainer=99",
            "[PATCHER_REVALIDATED] trainer=99",
            f"[PATCHER_REVALIDATE_FAILED] trainer=42 status=402 {SECRET_URL}",
            "[PATCHER_REVALIDATE_FAILED] trainer=42 status=SECRET_BODY",
            "[PATCHER_REVALIDATE_FAILED] trainer=42 status=999",
            "noise [PATCHER_REVALIDATED] trainer=42",
            f"[PATCHER_REVALIDATE_NOT_CONFIGURED] {SECRET_KEY}",
        ])
        detail = details(0, child_stdout, 42, "ko")
        self.assertEqual((detail["outcome"], detail["code"], detail["queued"]), ("approved", "NONE", False))
        self.assertEqual(detail["revalidation_events"], [
            ("FAILED", "0"),
            ("FAILED", "402"),
            ("FALLBACK_ENQUEUED", "RPC"),
        ])
        self.assertNotIn("secret", repr(detail).lower())

        # 5종 허용 마커와 최대 4건 제한, 수동 URL(trainer_id=None) 매칭을 검증한다.
        all_markers = "\n".join([
            "[save-outcome] trainer=42 locale=ko status=approved",
            "[PATCHER_REVALIDATED] trainer=42",
            "[PATCHER_REVALIDATE_NOT_CONFIGURED]",
            "[PATCHER_REVALIDATE_FAILED] trainer=42 status=network",
            "[PATCHER_REVALIDATE_FALLBACK_FAILED] trainer=42",
            "[PATCHER_REVALIDATE_FALLBACK_ENQUEUED] trainer=42",
        ])
        capped = details(0, all_markers, None, "ko")
        self.assertEqual(capped["revalidation_events"], [
            ("REVALIDATED", "200"),
            ("NOT_CONFIGURED", "NONE"),
            ("FAILED", "network"),
            ("FALLBACK_FAILED", "RPC"),
        ])

    def test_reprocess_main_prints_safe_revalidation_lines_without_altering_outcome(self):
        import argparse

        db = mock.Mock()
        child_output = "\n".join([
            "[save-outcome] trainer=42 locale=ko status=approved",
            "[PATCHER_REVALIDATE_FAILED] trainer=42 status=402",
            "[PATCHER_REVALIDATE_FALLBACK_ENQUEUED] trainer=42",
            f"[PATCHER_REVALIDATE_FAILED] trainer=42 status=402 {SECRET_URL}",
            f"{SECRET_KEY} {SECRET_BODY}",
        ])
        run = mock.Mock(return_value=types.SimpleNamespace(returncode=0, stdout=child_output, stderr=SECRET_BODY))
        scope = load_reprocess_scope({
            "argparse": argparse,
            "os": os,
            "sys": sys,
            "__file__": str(REPROCESS_SOURCE),
            "subprocess": types.SimpleNamespace(run=run, TimeoutExpired=subprocess.TimeoutExpired),
            "time": types.SimpleNamespace(monotonic=lambda: 100),
            "create_client": lambda *args: db,
        })
        scope["claim_due_retry_targets"] = mock.Mock(return_value=([
            ("https://flingtrainer.com/a", 42, "ko"),
        ], []))

        with mock.patch.dict(os.environ, {
            "NEXT_PUBLIC_SUPABASE_URL": "https://example.supabase.co",
            "SUPABASE_SERVICE_ROLE_KEY": "test-only",
        }, clear=True), mock.patch.object(
            sys, "argv", [str(REPROCESS_SOURCE), "--apply"],
        ), mock.patch("builtins.print") as output:
            exit_code = scope["main"]()

        self.assertEqual(exit_code, 0)
        lines = [call.args[0] for call in output.call_args_list]
        self.assertIn("[REPROCESS_RESULT] trainer=42 locale=ko outcome=approved code=NONE exit=0", lines)
        self.assertIn("[REPROCESS_REVALIDATION] trainer=42 locale=ko event=FAILED status=402", lines)
        self.assertIn("[REPROCESS_REVALIDATION] trainer=42 locale=ko event=FALLBACK_ENQUEUED status=RPC", lines)
        self.assertIn("[REPROCESS_SUMMARY] approved=1 preserved=0 deferred=0 blocked=0 skipped=0 unconfirmed=0 failed=0", lines)
        rendered = "\n".join(lines)
        for forbidden in (SECRET_URL, SECRET_KEY, SECRET_BODY):
            self.assertNotIn(forbidden, rendered)


if __name__ == "__main__":
    unittest.main()
