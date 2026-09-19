import ast
import pathlib
import unittest


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
