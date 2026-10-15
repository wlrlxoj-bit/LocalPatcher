"""Gemini 기본 번역과 내부 비용 상한 없는 GPT 보조 경로의 격리 계약 테스트."""

import ast
import pathlib
import types
import unittest


SCRIPTS = pathlib.Path(__file__).resolve().parents[1]


def load_function(name, namespace):
    return load_functions([name], namespace)[0]


def load_functions(names, namespace):
    source = (SCRIPTS / "scraper.py").read_text(encoding="utf-8")
    module = ast.parse(source)
    scope = dict(namespace)
    scope.setdefault("requests", types.SimpleNamespace(
        Timeout=type("Timeout", (Exception,), {}),
        ConnectionError=type("ConnectionError", (Exception,), {}),
    ))
    dependencies = {"TranslationQuotaError", "TranslationProviderError", "retry_failure_policy"}
    nodes = [
        item for item in module.body
        if isinstance(item, (ast.FunctionDef, ast.ClassDef))
        and (item.name in names or (item.name in dependencies and item.name not in scope))
    ]
    exec(compile(ast.Module(body=nodes, type_ignores=[]), "scraper.py", "exec"), scope)
    return [scope[name] for name in names]


class GeminiFallbackContracts(unittest.TestCase):
    def test_gemini_is_primary_and_openai_is_single_fallback(self):
        gemini, openai, azure = object(), object(), object()
        _available, provider_selector = load_functions([
            "openai_automation_fallback_available", "translation_providers",
        ], {
            "TRANSLATION_PROVIDER": "gemini",
            "OPENAI_API_KEY": "configured",
            "OPENAI_AUTOMATION_FALLBACK_ENABLED": True,
            "_call_gemini": gemini,
            "_call_openai_fallback": openai,
            "_call_azure": azure,
        })
        self.assertEqual(
            provider_selector(),
            [("Gemini", gemini), ("OpenAI Paid Fallback", openai)],
        )
        self.assertEqual(
            provider_selector(prefer_openai_fallback=True),
            [("OpenAI Paid Fallback", openai)],
        )

    def test_openai_fallback_still_requires_enabled_flag_and_key(self):
        gemini, openai, azure = object(), object(), object()
        _available, provider_selector = load_functions([
            "openai_automation_fallback_available", "translation_providers",
        ], {
            "TRANSLATION_PROVIDER": "gemini",
            "OPENAI_API_KEY": "configured",
            "OPENAI_AUTOMATION_FALLBACK_ENABLED": False,
            "_call_gemini": gemini,
            "_call_openai_fallback": openai,
            "_call_azure": azure,
        })
        self.assertEqual(provider_selector(), [("Gemini", gemini)])
        self.assertEqual(provider_selector(prefer_openai_fallback=True), [])
        scope = provider_selector.__globals__
        scope["OPENAI_AUTOMATION_FALLBACK_ENABLED"] = True
        scope["OPENAI_API_KEY"] = ""
        self.assertEqual(provider_selector(), [("Gemini", gemini)])
        self.assertEqual(provider_selector(prefer_openai_fallback=True), [])

    def test_openai_fallback_exceeds_old_run_caps_without_monthly_config_or_db(self):
        calls = []
        _available, caller = load_functions([
            "openai_automation_fallback_available", "_call_openai_fallback",
        ], {
            "OPENAI_API_KEY": "fixture-only",
            "OPENAI_AUTOMATION_FALLBACK_ENABLED": True,
            "_call_openai": lambda lines, *_args: calls.append(lines) or ["번역"],
        })
        # 각 요청은 기존 청크 크기 이내지만 누적 9회·13,500자로 옛 비용 상한을 넘는다.
        for _ in range(9):
            self.assertEqual(caller(["a" * 1500], "prompt", 0.7), ["번역"])
        self.assertEqual(len(calls), 9)
        self.assertEqual(sum(len(lines[0]) for lines in calls), 13500)

    def test_disabled_openai_fallback_never_calls_provider(self):
        def unexpected_call(*_args):
            raise AssertionError("비활성화된 보조 경로는 공급자를 호출해서는 안 됩니다")
        caller = load_function("_call_openai_fallback", {
            "openai_automation_fallback_available": lambda: False,
            "_call_openai": unexpected_call,
        })
        with self.assertRaises(RuntimeError):
            caller(["Infinite Health"], "prompt", 0.7)

    def test_gemini_calls_provider_without_monthly_configuration_or_database(self):
        calls = []

        class Response:
            status_code = 200

            @staticmethod
            def json():
                return {"candidates": [{"content": {"parts": [{"text": '{"line_0":"무한 체력"}'}]}}]}

        class Requests:
            @staticmethod
            def post(*_args, **_kwargs):
                calls.append("gemini")
                return Response()

        caller = load_function("_call_gemini", {
            "GEMINI_API_KEY": "configured",
            "GEMINI_MODEL": "gemini-2.5-flash",
            "requests": Requests(),
            "_parse_indexed_translations": lambda text, _count: [text],
            "print": lambda *_args: None,
        })
        self.assertEqual(caller(["Infinite Health"], "prompt", 0.7), ['{"line_0":"무한 체력"}'])
        self.assertEqual(calls, ["gemini"])

    def test_gemini_http_403_or_429_uses_openai_fallback(self):
        class QuotaError(RuntimeError):
            def __init__(self, message="TRANSLATION_QUOTA", reason_code="UNKNOWN", status_code=None):
                self.reason_code = reason_code
                self.status_code = status_code
                super().__init__(message)

        translator = load_function("_translate_via_llm_with_fallback", {
            "TranslationQuotaError": QuotaError,
            "TranslationProviderError": type("TranslationProviderError", (RuntimeError,), {}),
            "retry_failure_policy": lambda _exc: ("deferred", "TRANSLATION_QUOTA", 86400),
            "_chunk_translation_items": lambda lines: [lines],
            "_build_llm_prompt": lambda *_args: "prompt",
            "print": lambda *_args: None,
            "last_llm_provider": None,
        })
        for status in (403, 429):
            calls = []

            def gemini(*_args, status=status):
                raise RuntimeError(f"Gemini API가 HTTP {status}을 반환했습니다")

            def openai(*_args):
                calls.append("openai")
                return ["무한 체력"]

            self.assertEqual(
                translator(["Infinite Health"], "Korean", "무한 체력", [
                    ("Gemini", gemini), ("OpenAI Paid Fallback", openai),
                ]),
                ["무한 체력"],
            )
            self.assertEqual(calls, ["openai"])

    def test_gemini_provider_quota_uses_openai_fallback(self):
        class QuotaError(RuntimeError):
            def __init__(self, message="TRANSLATION_QUOTA", reason_code="UNKNOWN", status_code=None):
                self.reason_code = reason_code
                self.status_code = status_code
                super().__init__(message)

        translator = load_function("_translate_via_llm_with_fallback", {
            "TranslationQuotaError": QuotaError,
            "TranslationProviderError": type("TranslationProviderError", (RuntimeError,), {}),
            "retry_failure_policy": lambda _exc: ("deferred", "TRANSLATION_QUOTA", 86400),
            "_chunk_translation_items": lambda lines: [lines],
            "_build_llm_prompt": lambda *_args: "prompt",
            "print": lambda *_args: None,
            "last_llm_provider": None,
        })
        for status in (403, 429):
            calls = []

            def gemini(*_args, status=status):
                raise QuotaError(reason_code="PROVIDER_HTTP_QUOTA", status_code=status)

            def openai(*_args):
                calls.append("openai")
                return ["무한 체력"]

            self.assertEqual(
                translator(["Infinite Health"], "Korean", "무한 체력", [
                    ("Gemini", gemini), ("OpenAI Paid Fallback", openai),
                ]),
                ["무한 체력"],
            )
            self.assertEqual(calls, ["openai"])

    def test_openai_quota_failure_does_not_continue_to_another_provider(self):
        class QuotaError(RuntimeError):
            def __init__(self, message="TRANSLATION_QUOTA", reason_code="UNKNOWN", status_code=None):
                self.reason_code = reason_code
                self.status_code = status_code
                super().__init__(message)

        translator = load_function("_translate_via_llm_with_fallback", {
            "TranslationQuotaError": QuotaError,
            "TranslationProviderError": type("TranslationProviderError", (RuntimeError,), {}),
            "retry_failure_policy": lambda _exc: ("deferred", "TRANSLATION_QUOTA", 86400),
            "_chunk_translation_items": lambda lines: [lines],
            "_build_llm_prompt": lambda *_args: "prompt",
            "print": lambda *_args: None,
            "last_llm_provider": None,
        })
        called = []

        def openai(*_args):
            raise QuotaError(reason_code="PROVIDER_HTTP_QUOTA", status_code=429)

        def unexpected_provider(*_args):
            called.append(True)
            return ["무한 체력"]

        with self.assertRaises(QuotaError):
            translator(["Infinite Health"], "Korean", "무한 체력", [
                ("OpenAI Paid Fallback", openai), ("Unexpected", unexpected_provider),
            ])
        self.assertEqual(called, [])

    def test_workflow_uses_gemini_and_passes_only_secret_names(self):
        workflow = (SCRIPTS.parent / ".github" / "workflows" / "scraper.yml").read_text(encoding="utf-8")
        self.assertIn("GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}", workflow)
        self.assertIn("GEMINI_MODEL: gemini-2.5-flash", workflow)
        self.assertIn("--provider gemini", workflow)
        for removed_setting in (
            "GEMINI_MONTHLY_MAX_CHARS", "OPENAI_FALLBACK_MONTHLY_MAX_CHARS",
            "OPENAI_FALLBACK_MAX_REQUESTS", "OPENAI_FALLBACK_MAX_CHARS",
        ):
            self.assertNotIn(removed_setting, workflow)

    def test_gemini_model_has_safe_default(self):
        scraper = (SCRIPTS / "scraper.py").read_text(encoding="utf-8")
        self.assertIn('GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")', scraper)
        self.assertIn('OPENAI_AUTOMATION_FALLBACK_ENABLED", "true"', scraper)
        self.assertNotIn("res.text[:500]", scraper)


if __name__ == "__main__":
    unittest.main()
