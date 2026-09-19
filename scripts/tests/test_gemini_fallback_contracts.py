"""Gemini 기본 번역과 제한된 GPT 보조 경로의 외부 호출 없는 계약 테스트."""

import ast
import pathlib
import unittest


SCRIPTS = pathlib.Path(__file__).resolve().parents[1]


def load_function(name, namespace):
    source = (SCRIPTS / "scraper.py").read_text(encoding="utf-8")
    module = ast.parse(source)
    node = next(
        item for item in module.body
        if isinstance(item, ast.FunctionDef) and item.name == name
    )
    scope = dict(namespace)
    exec(compile(ast.Module(body=[node], type_ignores=[]), "scraper.py", "exec"), scope)
    return scope[name]


def load_functions(names, namespace):
    source = (SCRIPTS / "scraper.py").read_text(encoding="utf-8")
    module = ast.parse(source)
    nodes = [
        item for item in module.body
        if isinstance(item, ast.FunctionDef) and item.name in names
    ]
    scope = dict(namespace)
    exec(compile(ast.Module(body=nodes, type_ignores=[]), "scraper.py", "exec"), scope)
    return [scope[name] for name in names]


class GeminiFallbackContracts(unittest.TestCase):
    def test_gemini_is_primary_and_openai_is_single_fallback(self):
        gemini, openai, azure = object(), object(), object()
        _available, provider_selector = load_functions([
            "openai_automation_fallback_available", "translation_providers",
        ], {
            "TRANSLATION_PROVIDER": "gemini",
            "GEMINI_MONTHLY_MAX_CHARS": 1000,
            "OPENAI_API_KEY": "configured",
            "OPENAI_AUTOMATION_FALLBACK_ENABLED": True,
            "OPENAI_FALLBACK_MONTHLY_MAX_CHARS": 1000,
            "translation_usage_db": object(),
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

    def test_openai_fallback_requires_a_nonzero_monthly_cap(self):
        gemini, openai, azure = object(), object(), object()
        _available, provider_selector = load_functions([
            "openai_automation_fallback_available", "translation_providers",
        ], {
            "TRANSLATION_PROVIDER": "gemini",
            "GEMINI_MONTHLY_MAX_CHARS": 1000,
            "OPENAI_API_KEY": "configured",
            "OPENAI_AUTOMATION_FALLBACK_ENABLED": True,
            "OPENAI_FALLBACK_MONTHLY_MAX_CHARS": 0,
            "translation_usage_db": object(),
            "_call_gemini": gemini,
            "_call_openai_fallback": openai,
            "_call_azure": azure,
        })
        self.assertEqual(provider_selector(), [("Gemini", gemini)])
        self.assertEqual(provider_selector(prefer_openai_fallback=True), [])

    def test_openai_fallback_budget_blocks_before_network_request(self):
        class QuotaError(RuntimeError):
            pass

        class Requests:
            def post(self, *_args, **_kwargs):
                raise AssertionError("예산 초과 시 네트워크 요청을 해서는 안 됩니다")

        caller = load_function("_call_openai_fallback", {
            "OPENAI_API_KEY": "configured",
            "OPENAI_FALLBACK_MAX_REQUESTS": 1,
            "OPENAI_FALLBACK_MAX_CHARS": 10,
            "openai_fallback_requests": 1,
            "openai_fallback_chars": 0,
            "TranslationQuotaError": QuotaError,
            "requests": Requests(),
            "_reserve_openai_fallback_usage": lambda *_args: "reservation",
            "_finalize_openai_fallback_usage": lambda *_args, **_kwargs: None,
            "_call_openai": lambda *_args: [],
            "print": lambda *_args: None,
        })
        with self.assertRaises(QuotaError):
            caller(["Infinite Health"], "prompt", 0.7)

    def test_gemini_reservation_failure_blocks_http_request(self):
        class QuotaError(RuntimeError):
            pass

        class Requests:
            def post(self, *_args, **_kwargs):
                raise AssertionError("월 예산 예약 실패 뒤 HTTP 요청을 해서는 안 됩니다")

        caller = load_function("_call_gemini", {
            "GEMINI_API_KEY": "configured",
            "GEMINI_MODEL": "gemini-2.5-flash",
            "GEMINI_MONTHLY_MAX_CHARS": 1000,
            "TranslationQuotaError": QuotaError,
            "_reserve_automation_usage": lambda *_args: (_ for _ in ()).throw(QuotaError("budget")),
            "_finalize_automation_usage": lambda *_args, **_kwargs: None,
            "requests": Requests(),
            "print": lambda *_args: None,
        })
        with self.assertRaises(QuotaError):
            caller(["Infinite Health"], "prompt", 0.7)

    def test_gemini_finalizes_shared_reservation_after_request(self):
        calls = []

        class Response:
            status_code = 200

            @staticmethod
            def json():
                return {"candidates": [{"content": {"parts": [{"text": '{"line_0":"무한 체력"}'}]}}]}

        class Requests:
            @staticmethod
            def post(*_args, **_kwargs):
                return Response()

        caller = load_function("_call_gemini", {
            "GEMINI_API_KEY": "configured",
            "GEMINI_MODEL": "gemini-2.5-flash",
            "GEMINI_MONTHLY_MAX_CHARS": 1000,
            "_reserve_automation_usage": lambda *_args: "reservation-1",
            "_finalize_automation_usage": lambda reservation, consumed: calls.append((reservation, consumed)),
            "requests": Requests(),
            "_parse_indexed_translations": lambda text, _count: [text],
            "print": lambda *_args: None,
        })
        self.assertEqual(caller(["Infinite Health"], "prompt", 0.7), ['{"line_0":"무한 체력"}'])
        self.assertEqual(calls, [("reservation-1", True)])

    def test_gemini_http_403_or_429_uses_openai_fallback(self):
        class QuotaError(RuntimeError):
            pass

        translator = load_function("_translate_via_llm_with_fallback", {
            "TranslationQuotaError": QuotaError,
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

    def test_gemini_quota_or_reservation_unavailable_uses_openai_fallback(self):
        class QuotaError(RuntimeError):
            pass

        translator = load_function("_translate_via_llm_with_fallback", {
            "TranslationQuotaError": QuotaError,
            "_chunk_translation_items": lambda lines: [lines],
            "_build_llm_prompt": lambda *_args: "prompt",
            "print": lambda *_args: None,
            "last_llm_provider": None,
        })
        for message in ("gemini 월 예산을 초과했습니다", "gemini 공유 월 예산을 확인할 수 없습니다"):
            calls = []

            def gemini(*_args, message=message):
                raise QuotaError(message)

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
            pass

        translator = load_function("_translate_via_llm_with_fallback", {
            "TranslationQuotaError": QuotaError,
            "_chunk_translation_items": lambda lines: [lines],
            "_build_llm_prompt": lambda *_args: "prompt",
            "print": lambda *_args: None,
            "last_llm_provider": None,
        })
        called = []

        def openai(*_args):
            raise QuotaError("OpenAI 보조 번역 요청 상한에 도달했습니다")

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
        self.assertIn("GEMINI_MONTHLY_MAX_CHARS: ${{ vars.GEMINI_MONTHLY_MAX_CHARS }}", workflow)
        self.assertIn("OPENAI_FALLBACK_MONTHLY_MAX_CHARS: ${{ vars.OPENAI_FALLBACK_MONTHLY_MAX_CHARS }}", workflow)

    def test_gemini_model_has_safe_default(self):
        scraper = (SCRIPTS / "scraper.py").read_text(encoding="utf-8")
        self.assertIn('GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")', scraper)
        self.assertIn('OPENAI_AUTOMATION_FALLBACK_ENABLED", "true"', scraper)
        self.assertNotIn("res.text[:500]", scraper)


if __name__ == "__main__":
    unittest.main()
