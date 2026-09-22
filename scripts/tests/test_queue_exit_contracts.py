import ast
import pathlib
import unittest
from types import SimpleNamespace


SCRIPTS = pathlib.Path(__file__).resolve().parents[1]


def load_function(filename, function_name, namespace=None):
    """외부 서비스 초기화 없이 선택한 순수 함수만 읽어 테스트한다."""
    source = (SCRIPTS / filename).read_text(encoding="utf-8")
    module = ast.parse(source)
    function = next(
        node for node in module.body
        if isinstance(node, ast.FunctionDef) and node.name == function_name
    )
    isolated = ast.Module(body=[function], type_ignores=[])
    scope = dict(namespace or {})
    exec(compile(isolated, filename, "exec"), scope)
    return scope[function_name]


def load_functions(filename, function_names, namespace=None):
    """의존하는 순수 함수 묶음을 외부 초기화 없이 읽어 테스트한다."""
    source = (SCRIPTS / filename).read_text(encoding="utf-8")
    module = ast.parse(source)
    selected = [
        node for node in module.body
        if isinstance(node, ast.FunctionDef) and node.name in function_names
    ]
    scope = dict(namespace or {})
    exec(compile(ast.Module(body=selected, type_ignores=[]), filename, "exec"), scope)
    return [scope[name] for name in function_names]


class QueueExitContractTests(unittest.TestCase):
    def test_reprocessor_apply_propagates_child_failure(self):
        exit_code = load_function("reprocess_pending_translations.py", "reprocess_exit_code")
        self.assertEqual(exit_code(apply=True, failures=1), 1)
        self.assertEqual(exit_code(apply=False, failures=4), 0)

    def test_scraper_partial_failure_is_not_success(self):
        page_result = load_function("scraper.py", "page_result")
        self.assertFalse(page_result(True, 0, True))
        self.assertTrue(page_result(False, 2, False))

    def test_rar_archives_are_neutral_skips_not_batch_failures(self):
        is_rar_archive = load_function("scraper.py", "is_rar_archive")
        page_result = load_function("scraper.py", "page_result")

        self.assertTrue(is_rar_archive("https://example.com/trainer.rar"))
        self.assertTrue(is_rar_archive("https://example.com/download", b"Rar!\x1a\x07"))
        self.assertFalse(is_rar_archive("https://example.com/trainer.zip", b"PK\x03\x04"))
        # RAR만 있는 게시물은 지원 형식 작업이 아니라 중립 건너뜀으로 종료한다.
        self.assertTrue(page_result(False, 0, False, archive_only_skip=True))
        # RAR과 정상 ZIP/EXE가 함께 있어 지원 형식 등록이 성공하면 성공을 유지한다.
        self.assertTrue(page_result(True, 0, False))
        # ZIP/EXE 같은 지원 형식의 실제 처리 실패는 기존처럼 실패여야 한다.
        self.assertFalse(page_result(False, 0, True))

    def test_latest_supported_download_keeps_dom_latest_and_skips_rar(self):
        is_rar_archive, latest_supported_download = load_functions(
            "scraper.py", ["is_rar_archive", "latest_supported_download"],
        )

        class Anchor:
            def __init__(self, href):
                self.href = href

            def get(self, key, default=None):
                return self.href if key == "href" else default

        newest_rar = Anchor("https://flingtrainer.com/downloads/latest.rar")
        newest_supported = Anchor("https://flingtrainer.com/downloads/latest.zip")
        older_supported = Anchor("https://flingtrainer.com/downloads/older.zip")
        selected, rar_skips = latest_supported_download(
            [newest_rar, newest_supported, older_supported, newest_supported]
        )
        self.assertEqual(selected, newest_supported)
        self.assertEqual(rar_skips, 1)
        self.assertTrue(is_rar_archive(newest_rar.href))

        # 이 fixture는 현재 FLiNG HTML의 최신→과거 DOM 순서를 계약으로 고정한다.
        # 선택된 최신 URL이 일시 실패해도 helper가 과거 URL을 반환하지 않는다.
        selected_after_failure, _ = latest_supported_download(
            [newest_supported, older_supported]
        )
        self.assertEqual(selected_after_failure, newest_supported)

    def test_scraper_contract_has_no_historical_fallback_for_selected_link(self):
        source = (SCRIPTS / "scraper.py").read_text(encoding="utf-8")
        self.assertIn("for download_a in [latest_download]:", source)
        self.assertIn("[DOWNLOAD_SELECTED]", source)
        self.assertIn("fallback=disabled", source)

    def test_upstream_waf_deferral_is_neutral_but_real_failure_is_not(self):
        page_result = load_function("scraper.py", "page_result")
        self.assertTrue(page_result(False, 0, False, upstream_deferred=True))
        self.assertFalse(page_result(False, 0, True, upstream_deferred=True))

    def test_429_retry_after_is_bounded_and_falls_back_to_backoff(self):
        retry_after_delay_seconds = load_function("scraper.py", "retry_after_delay_seconds")

        class Response:
            def __init__(self, retry_after):
                self.headers = {"Retry-After": retry_after}

        self.assertEqual(retry_after_delay_seconds(Response("7"), 1), 7)
        self.assertEqual(retry_after_delay_seconds(Response("999"), 1), 10)
        self.assertEqual(retry_after_delay_seconds(Response("bad"), 2), 4)
        self.assertEqual(retry_after_delay_seconds(None, 3), 8)

    def test_403_is_not_retried_and_only_first_429_is_retried(self):
        should_retry = load_function("scraper.py", "should_retry_upstream_status")
        self.assertFalse(should_retry(403, 1))
        self.assertTrue(should_retry(429, 1))
        self.assertFalse(should_retry(429, 2))

    def test_paced_fling_request_obeys_interval(self):
        paced_fling_get = load_function(
            "scraper.py", "paced_fling_get", {
                "FLING_REQUEST_MIN_INTERVAL_SECONDS": 2,
                "last_fling_request_at": 99.0,
            },
        )

        class Clock:
            def __init__(self):
                self.sleeps = []
                self.values = iter([100.0, 101.0])

            def monotonic(self):
                return next(self.values)

            def sleep(self, seconds):
                self.sleeps.append(seconds)

        # isolated function scope is updated after compile to avoid real waits.
        clock = Clock()
        paced_fling_get.__globals__["time"] = clock
        requests = SimpleNamespace(get=lambda *args, **kwargs: "response")
        paced_fling_get.__globals__["requests"] = requests
        self.assertEqual(paced_fling_get("https://flingtrainer.com/a", headers={}, timeout=10), "response")
        self.assertEqual(clock.sleeps, [1.0])

    def test_upstream_deferral_queues_existing_trainer_and_updates_source_url(self):
        calls = []

        class Result:
            data = [{"id": 77}]

        class Query:
            def update(self, payload):
                calls.append(("update", payload))
                return self

            def select(self, fields):
                calls.append(("select", fields))
                return self

            def eq(self, *_args):
                return self

            def order(self, *_args, **_kwargs):
                return self

            def limit(self, *_args):
                return self

            def execute(self):
                return Result()

        class Db:
            def table(self, name):
                calls.append(("table", name))
                return Query()

        queued = []
        defer = load_function("scraper.py", "defer_existing_trainers_for_upstream", {
            "find_game_by_canonical_slug": lambda *_args: {"id": 12},
            "schedule_translation_retry": lambda _db, trainer, locale, state, code, delay: (
                queued.append((trainer, locale, state, code, delay)) or True
            ),
        })
        self.assertTrue(defer(Db(), "game", "Game", "https://flingtrainer.com/new", ["ko", "ja"], 403))
        self.assertIn(("update", {"fling_url": "https://flingtrainer.com/new"}), calls)
        self.assertEqual(queued, [
            (77, "ja", "deferred", "UPSTREAM_HTTP_403", 10800),
            (77, "ko", "deferred", "UPSTREAM_HTTP_403", 10800),
        ])

    def test_upstream_queue_write_failure_is_reported(self):
        defer = load_function("scraper.py", "defer_existing_trainers_for_upstream", {
            "find_game_by_canonical_slug": lambda *_args: {"id": 12},
            "schedule_translation_retry": lambda *_args: False,
        })

        class Query:
            def update(self, _payload): return self
            def select(self, _fields): return self
            def eq(self, *_args): return self
            def order(self, *_args, **_kwargs): return self
            def limit(self, *_args): return self
            def execute(self): return SimpleNamespace(data=[{"id": 77}])

        class Db:
            def table(self, _name): return Query()

        self.assertFalse(defer(Db(), "game", "Game", "https://flingtrainer.com/new", ["ko"], 429))

    def test_ja_mapping_requires_http_source(self):
        from urllib.parse import urlparse

        validator = load_function(
            "generate_ja_mappings.py", "is_valid_source_url",
            {"urlparse": urlparse},
        )
        self.assertTrue(validator("https://flingtrainer.com/trainer/example/"))
        self.assertFalse(validator(""))
        self.assertFalse(validator("stale-relative-path"))


if __name__ == "__main__":
    unittest.main()
