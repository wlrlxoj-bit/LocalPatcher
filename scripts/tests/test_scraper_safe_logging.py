"""스크레이퍼 import·환경 로드·외부 호출 없이 로그 계약만 격리 검증한다."""

import ast
import contextlib
import io
import pathlib
import types
import unittest


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
