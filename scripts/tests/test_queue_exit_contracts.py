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
