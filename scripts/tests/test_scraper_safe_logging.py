"""스크레이퍼 import·환경 로드·외부 호출 없이 로그 계약만 격리 검증한다."""

import ast
import contextlib
import io
import pathlib
import types
import unittest
import argparse
import hashlib
import sys
import zipfile
from unittest import mock


SOURCE = pathlib.Path(__file__).resolve().parents[1] / "scraper.py"
SENTINEL = "원문_SECRET_SENTINEL https://fixture.invalid/?token=URL_SENTINEL HASH_SENTINEL"
EVENTS = {
    "[LEGACY_TRANSLATION_FAILED]": "code=PROVIDER_EXCEPTION",
    "[PE_HEADER_PARSE_FAILED]": "code=INVALID_EXECUTABLE",
    "[FLING_FEED_FAILED]": "code=FETCH_OR_PARSE_EXCEPTION",
    "[STEAM_META_SEARCH_STARTED]": "",
    "[STEAM_META_FOUND]": "",
    "[STEAM_META_FAILED]": "code=FETCH_OR_PARSE_EXCEPTION",
    "[PAGE_PROCESSING_STARTED]": "",
    "[DOWNLOAD_SELECTED]": "skipped_links=7 fallback=disabled",
    "[BINARY_DOWNLOAD_FAILED]": "code=DOWNLOAD_FAILED status=429",
    "[ARCHIVE_RAR_SKIPPED]": "source=magic_bytes",
    "[BINARY_INSPECTED]": "size_bytes=123",
    "[DOWNLOAD_PROCESSING_FAILED]": "code=PROCESSING_EXCEPTION",
    "[PAGE_PROCESSING_FAILED]": "code=PAGE_PROCESSING_EXCEPTION",
    "[DICTIONARY_LOAD_FAILED]": "code=DATABASE_EXCEPTION fallback=local",
    "[PINPOINT_SCRAPE_STARTED]": "",
    "[POPULAR_TRAINERS_SYNC_FAILED]": "code=FETCH_OR_DATABASE_EXCEPTION",
}


def print_calls():
    """최상위 코드는 실행하지 않고 실제 print 호출 AST만 반환한다."""
    return [node for node in ast.walk(ast.parse(SOURCE.read_text(encoding="utf-8")))
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
            and node.func.id == "print"]


def emit_print(node, **overrides):
    """민감한 입력을 주입하되 선택된 출력문 외의 동작은 실행하지 않는다."""
    scope = {
        "post": {"title": SENTINEL, "link": SENTINEL},
        "args": types.SimpleNamespace(url=SENTINEL),
        "download_url": SENTINEL, "download_text": SENTINEL,
        "download_failure": SENTINEL, "original_file_hash": SENTINEL,
        "game_title": SENTINEL, "appid": SENTINEL,
        "meta": {"cover_url": SENTINEL}, "e": RuntimeError(SENTINEL),
        "upstream_status": 429, "skipped_link_count": 7, "original_file_size": 123,
    }
    scope.update(overrides)
    stdout, stderr = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
        exec(compile(ast.Expression(body=node), str(SOURCE), "eval"), scope)
    return stdout.getvalue(), stderr.getvalue()


class ScraperSafeLoggingTests(unittest.TestCase):
    def scraper_scope(self, *, status=200, content=b"MZfixture", anchors=True):
        """실제 함수만 로드하고 네트워크·DB·번역 경계를 격리한다."""
        link = types.SimpleNamespace(text="Fixture Trainer +2")
        class Link(dict):
            text = link.text
        anchor = Link(href="https://fixture.invalid/downloads/fixture.exe")
        soup = mock.Mock()
        soup.select_one.return_value = None
        soup.select.return_value = [anchor] if anchors else []
        response = types.SimpleNamespace(status_code=status, content=content, text=SENTINEL)
        db = mock.Mock()
        def table(name):
            query = mock.Mock()
            for method in ("select", "eq", "update", "range"):
                getattr(query, method).return_value = query
            query.execute.return_value = types.SimpleNamespace(data=(
                [{"id": 2052, "game_id": 1}] if name == "trainers" else []
            ))
            return query
        db.table.side_effect = table
        translator = mock.Mock(return_value="번역")
        scope = {
            "Client": object, "argparse": argparse, "sys": sys,
            "SUPABASE_URL": "fixture", "SUPABASE_KEY": "fixture",
            "create_client": lambda *args: db, "db_dictionary_ko": {}, "db_dictionary_ja": {},
            "paced_fling_get": mock.Mock(return_value=response), "BeautifulSoup": lambda *args: soup,
            "latest_supported_download": lambda links: (anchor, 0),
            "normalize_fling_slug": lambda value: "fixture", "recover_official_archive": lambda value, headers: value,
            "retry_after_delay_seconds": lambda *args, **kwargs: 0,
            "sleep_for_fling_retry": lambda *args: False,
            "should_retry_upstream_status": lambda *args: False,
            "defer_existing_trainers_for_upstream": mock.Mock(return_value=False),
            "is_rar_archive": lambda *args: False, "hashlib": hashlib, "zipfile": zipfile, "io": io,
            "parse_pe_binary": mock.Mock(return_value=types.SimpleNamespace(PointerToRawData=0, SizeOfRawData=2)),
            "scan_cheat_string_offset": mock.Mock(return_value={
                "offset_dec": 10, "original_text": "Num 1 - Health", "encoding": "utf-8", "max_char_len": 100,
            }),
            "parse_trainer_version": lambda text: ("v1", 1),
            "source_block_completeness": lambda *args: (True, 1),
            "TRANSLATION_PROVIDER": "gemini", "FLING_429_RETRY_MAX_SECONDS": 10,
            "process_translation_block": translator, "process_translation_block_ja": translator,
            "process_translation_block_de": translator, "process_translation_block_es": translator,
            "validate_translation": mock.Mock(return_value=types.SimpleNamespace(ok=True, issues=[])),
            "save_validated_draft": mock.Mock(return_value=types.SimpleNamespace(value="approved")),
            "complete_translation_retry": mock.Mock(), "learn_approved_option_labels": mock.Mock(),
            "revalidate_patcher_after_automation": mock.Mock(),
        }
        tree = ast.parse(SOURCE.read_text(encoding="utf-8"))
        functions = [node for node in tree.body if isinstance(node, ast.FunctionDef)
                     and node.name in {"scrape_and_patch_trainer", "page_result", "main"}]
        exec(compile(ast.Module(body=functions, type_ignores=[]), str(SOURCE), "exec"), scope)
        return scope, db, translator

    def test_url_mode_observes_page_failures_without_changing_exit_or_writing_queue(self):
        for status, code in ((403, "UPSTREAM_HTTP_403"), (429, "UPSTREAM_HTTP_429"),
                             (503, "PAGE_HTTP_FAILED")):
            with self.subTest(status=status):
                scope, db, translator = self.scraper_scope(status=status)
                output = io.StringIO()
                with mock.patch.object(sys, "argv", ["scraper.py", "--url", SENTINEL,
                        "--languages", "ko", "ja", "--trainer-id", "2052"]), \
                        contextlib.redirect_stdout(output):
                    self.assertEqual(scope["main"](), 1)
                for locale in ("ko", "ja"):
                    self.assertIn(f"[SCRAPE_FAILURE] trainer=2052 locale={locale} code={code}", output.getvalue())
                db.rpc.assert_not_called()
                translator.assert_not_called()
                self.assertNotIn("SECRET_SENTINEL", output.getvalue())
                report = mock.Mock()
                if status in {403, 429}:
                    self.assertTrue(scope["scrape_and_patch_trainer"](
                        {"link": SENTINEL}, db, outcome_reporter=report,
                    ))
                    report.assert_called_once_with("deferred", code, 10800)

    def test_actual_scraper_failure_branches_keep_specific_diagnostics(self):
        cases = (
            ("no_links", "NO_DOWNLOAD_LINKS"), ("invalid_exe", "BINARY_INVALID_EXECUTABLE"),
            ("empty", "BINARY_EMPTY_RESPONSE"), ("pe", "BINARY_PE_PARSE_FAILED"),
            ("options", "SOURCE_OPTIONS_MISSING"), ("text", "SOURCE_TEXT_SECTION_PROTECTED"),
            ("incomplete", "SOURCE_OPTION_INCOMPLETE"), ("processing", "PROCESSING_EXCEPTION"),
            ("archive", "BINARY_ARCHIVE_INVALID"), ("page", "PAGE_PROCESSING_EXCEPTION"),
        )
        for branch, code in cases:
            with self.subTest(branch=branch):
                scope, db, translator = self.scraper_scope(
                    anchors=branch != "no_links", content=(b"bad" if branch == "invalid_exe"
                        else b"" if branch == "empty" else b"PKbroken" if branch == "archive" else b"MZfixture"),
                )
                if branch == "pe":
                    scope["parse_pe_binary"].return_value = None
                elif branch == "options":
                    scope["scan_cheat_string_offset"].return_value = None
                elif branch == "text":
                    scope["scan_cheat_string_offset"].return_value["offset_dec"] = 1
                elif branch == "incomplete":
                    scope["source_block_completeness"] = lambda *args: (False, 0)
                elif branch == "processing":
                    scope["parse_pe_binary"].side_effect = RuntimeError(SENTINEL)
                elif branch == "page":
                    scope["paced_fling_get"].side_effect = RuntimeError(SENTINEL)
                failures, report = [], mock.Mock()
                output, errors = io.StringIO(), io.StringIO()
                with contextlib.redirect_stdout(output), contextlib.redirect_stderr(errors):
                    result = scope["scrape_and_patch_trainer"](
                        {"link": SENTINEL, "title": "Fixture Trainer", "slug": "fixture"}, db,
                        languages=["ko"], target_trainer_id=2052,
                        failure_reporter=failures.append, outcome_reporter=report,
                    )
                self.assertFalse(result)
                self.assertEqual(failures, [code])
                self.assertEqual(report.call_args.args, ("blocked", code))
                translator.assert_not_called()
                db.rpc.assert_not_called()
                self.assertNotIn("SECRET_SENTINEL", output.getvalue() + errors.getvalue())

    def test_successful_translation_keeps_approved_outcome_without_failure_observation(self):
        scope, db, translator = self.scraper_scope()
        failures, output = [], io.StringIO()
        with contextlib.redirect_stdout(output):
            result = scope["scrape_and_patch_trainer"](
                {"link": SENTINEL, "title": "Fixture Trainer", "slug": "fixture"}, db,
                languages=["ko"], target_trainer_id=2052, failure_reporter=failures.append,
            )
        self.assertTrue(result)
        self.assertEqual(failures, [])
        translator.assert_called_once()
        self.assertIn("[save-outcome] trainer=2052 locale=ko status=approved", output.getvalue())

    def test_safe_events_keep_fixed_failure_codes_and_aggregates(self):
        calls = print_calls()
        for event, detail in EVENTS.items():
            with self.subTest(event=event):
                matching = [node for node in calls if event in ast.unparse(node)]
                self.assertEqual(len(matching), 1)
                stdout, stderr = emit_print(matching[0])
                self.assertIn(event, stdout)
                self.assertIn(detail, stdout)
                self.assertEqual(stderr, "")
                for private in (SENTINEL, "SECRET_SENTINEL", "URL_SENTINEL", "HASH_SENTINEL"):
                    self.assertNotIn(private, stdout + stderr)

    def test_sensitive_inputs_are_not_referenced_by_any_print(self):
        forbidden = {"e", "post", "args", "download_url", "download_text",
                     "download_failure", "original_file_hash", "game_title", "appid", "meta"}
        for call in print_calls():
            with self.subTest(line=call.lineno):
                names = {node.id for node in ast.walk(call) if isinstance(node, ast.Name)}
                # args.force는 기존 비민감 실행 모드 표시이므로 허용한다.
                if "args" in names:
                    attrs = [node.attr for node in ast.walk(call)
                             if isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name)
                             and node.value.id == "args"]
                    self.assertEqual(attrs, ["force"])
                    names.remove("args")
                self.assertFalse(names & forbidden, f"민감 입력 출력: line={call.lineno}")

    def test_download_http_status_accepts_only_integer_http_range(self):
        node = next(call for call in print_calls() if "[BINARY_DOWNLOAD_FAILED]" in ast.unparse(call))
        for value, expected in ((403, 403), (429, 429), (503, 503), (None, 0),
                                (SENTINEL, 0), (True, 0), (99, 0), (600, 0)):
            with self.subTest(value=value):
                stdout, stderr = emit_print(node, upstream_status=value)
                self.assertEqual(stdout, f"[BINARY_DOWNLOAD_FAILED] code=DOWNLOAD_FAILED status={expected}\n")
                self.assertEqual(stderr, "")


if __name__ == "__main__":
    unittest.main()
