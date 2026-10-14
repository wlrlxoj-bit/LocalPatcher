"""외부 HTTP·DB 호출 없이 공급자 실패 타입과 재시도 분류를 검증한다."""

import contextlib
import io
import json
import types
import unittest

from test_gemini_fallback_contracts import load_functions


class Timeout(Exception):
    pass


class ConnectionError(Exception):
    pass


def provider_scope():
    """실제 공급자·fallback 함수를 가짜 네트워크와 예산 저장소에 연결한다."""
    names = ["TranslationQuotaError", "TranslationProviderError", "retry_failure_policy",
             "_parse_indexed_translations", "_call_gemini", "_call_openai", "_call_openai_fallback", "_call_azure",
             "_translate_via_llm_with_fallback"]
    functions = load_functions(names, {
        "json": json,
        "requests": types.SimpleNamespace(Timeout=Timeout, ConnectionError=ConnectionError),
        "GEMINI_API_KEY": "fixture-only", "GEMINI_MODEL": "fixture-model",
        "GEMINI_MONTHLY_MAX_CHARS": 1000, "OPENAI_API_KEY": "fixture-only",
        "AZURE_TRANSLATOR_KEY": "fixture-only", "AZURE_TRANSLATOR_REGION": "fixture-region",
        "AZURE_TRANSLATOR_ENDPOINT": "https://invalid.local",
        "_reserve_automation_usage": lambda *_args: "fixture-reservation",
        "_finalize_automation_usage": lambda *_args, **_kwargs: None,
        "_chunk_translation_items": lambda lines: [lines],
        "_build_llm_prompt": lambda *_args: "fixture-prompt",
        "last_llm_provider": None,
        "time": types.SimpleNamespace(sleep=lambda *_args: None),
    })
    # 클래스에는 __globals__가 없으므로 같은 모듈 scope를 실제 함수에서 얻는다.
    return functions[-1].__globals__


class ProviderFailureOutcomeTests(unittest.TestCase):
    def test_gemini_http_status_is_preserved_when_fallback_is_unavailable(self):
        for status in (400, 401, 403, 429, 500, 502, 503, 504):
            with self.subTest(status=status):
                scope = provider_scope()
                scope["requests"].post = lambda *_args, **_kwargs: types.SimpleNamespace(
                    status_code=status, text="response=DO_NOT_LOG body_secret=NO_LOG",
                )
                output = io.StringIO()
                with contextlib.redirect_stdout(output), self.assertRaises(scope["TranslationProviderError"]) as caught:
                    scope["_translate_via_llm_with_fallback"](
                        ["Infinite Health"], "Japanese", "無限体力", [("Gemini", scope["_call_gemini"])],
                    )
                self.assertEqual(caught.exception.status_code, status)
                expected = ("deferred", "TRANSLATION_API_TEMPORARY", 1800) if status == 429 or status >= 500 else ("blocked", "TRANSLATION_PERMANENT", 0)
                self.assertEqual(scope["retry_failure_policy"](caught.exception), expected)
                self.assertIn(f"status={status}", output.getvalue())
                self.assertNotIn("fixture-only", output.getvalue())
                self.assertNotIn("generativelanguage.googleapis.com", output.getvalue())
                self.assertNotIn("DO_NOT_LOG", output.getvalue())
                self.assertNotIn("NO_LOG", output.getvalue())

    def test_gemini_quota_without_fallback_remains_quota(self):
        scope = provider_scope()
        quota = scope["TranslationQuotaError"]("민감한 예산 정보")
        scope["_reserve_automation_usage"] = lambda *_args: (_ for _ in ()).throw(quota)
        output = io.StringIO()
        with contextlib.redirect_stdout(output), self.assertRaises(scope["TranslationQuotaError"]) as caught:
            scope["_translate_via_llm_with_fallback"](
                ["HP"], "Korean", "체력", [("Gemini", scope["_call_gemini"])],
            )
        self.assertIs(caught.exception, quota)
        self.assertEqual(scope["retry_failure_policy"](caught.exception), ("deferred", "TRANSLATION_QUOTA", 86400))
        self.assertNotIn("민감한 예산 정보", output.getvalue())

    def test_openai_http_quota_preserves_only_fixed_reason_and_numeric_status(self):
        for status in (403, 429):
            with self.subTest(status=status):
                scope = provider_scope()
                scope["requests"].post = lambda *_args, **_kwargs: types.SimpleNamespace(
                    status_code=status, text="response=DO_NOT_LOG body_secret=NO_LOG",
                )
                output = io.StringIO()
                with contextlib.redirect_stdout(output), self.assertRaises(scope["TranslationQuotaError"]) as caught:
                    scope["_translate_via_llm_with_fallback"](
                        ["HP"], "Korean", "체력", [("OpenAI Paid", scope["_call_openai"])],
                    )
                self.assertIsInstance(caught.exception, RuntimeError)
                self.assertEqual(caught.exception.reason_code, "PROVIDER_HTTP_QUOTA")
                self.assertEqual(caught.exception.status_code, status)
                self.assertEqual(str(caught.exception), "TRANSLATION_QUOTA")
                self.assertIn("quota_reason=PROVIDER_HTTP_QUOTA", output.getvalue())
                self.assertIn(f"status={status}", output.getvalue())
                self.assertNotIn("fixture-only", output.getvalue())
                self.assertNotIn("DO_NOT_LOG", output.getvalue())
                self.assertNotIn("NO_LOG", output.getvalue())

    def test_azure_http_quota_preserves_status_without_logging_response(self):
        for status in (403, 429):
            with self.subTest(status=status):
                scope = provider_scope()
                scope["requests"].post = lambda *_args, **_kwargs: types.SimpleNamespace(
                    status_code=status, text="response=AZURE_DO_NOT_LOG",
                )
                output = io.StringIO()
                with contextlib.redirect_stdout(output), self.assertRaises(scope["TranslationQuotaError"]) as caught:
                    scope["_translate_via_llm_with_fallback"](
                        ["HP"], "German", "Gesundheit", [("Azure", scope["_call_azure"])],
                    )
                self.assertEqual(caught.exception.reason_code, "PROVIDER_HTTP_QUOTA")
                self.assertEqual(caught.exception.status_code, status)
                self.assertEqual(str(caught.exception), "TRANSLATION_QUOTA")
                self.assertIn(f"status={status}", output.getvalue())
                self.assertNotIn("AZURE_DO_NOT_LOG", output.getvalue())

    def test_quota_failure_sites_have_distinct_safe_reason_codes(self):
        scope = provider_scope()
        scope.update({
            "OPENAI_FALLBACK_MAX_REQUESTS": 0,
            "OPENAI_FALLBACK_MAX_CHARS": 0,
            "OPENAI_FALLBACK_MONTHLY_MAX_CHARS": 100,
            "OPENAI_AUTOMATION_FALLBACK_ENABLED": True,
            "translation_usage_db": object(),
            "openai_fallback_requests": 0,
            "openai_fallback_chars": 0,
            "openai_automation_fallback_available": lambda: True,
        })
        with self.assertRaises(scope["TranslationQuotaError"]) as caught:
            scope["_call_openai_fallback"](["HP"], "prompt", 0.7)
        self.assertEqual(caught.exception.reason_code, "RUN_REQUEST_CAP")

        scope["OPENAI_FALLBACK_MAX_REQUESTS"] = 2
        scope["OPENAI_FALLBACK_MAX_CHARS"] = 0
        with self.assertRaises(scope["TranslationQuotaError"]) as caught:
            scope["_call_openai_fallback"](["HP"], "prompt", 0.7)
        self.assertEqual(caught.exception.reason_code, "RUN_CHAR_CAP")

    def test_monthly_budget_reasons_do_not_collapse_database_failures_into_exhaustion(self):
        helpers = load_functions(["_reserve_automation_usage", "_finalize_automation_usage"], {
            "TranslationQuotaError": RuntimeError,
            "translation_usage_db": None,
        })
        scope = helpers[0].__globals__
        class QuotaError(RuntimeError):
            def __init__(self, message="TRANSLATION_QUOTA", reason_code="UNKNOWN", status_code=None):
                self.reason_code = reason_code
                self.status_code = status_code
                super().__init__(message)
        scope["TranslationQuotaError"] = QuotaError
        with self.assertRaises(scope["TranslationQuotaError"]) as caught:
            scope["_reserve_automation_usage"]("openai_paid", 1, 0)
        self.assertEqual(caught.exception.reason_code, "MONTHLY_CONFIG_MISSING")

        class RpcResult:
            def __init__(self, data):
                self.data = data

        class RpcClient:
            def __init__(self, configured, reservation):
                self.configured = configured
                self.reservation = reservation

            def rpc(self, name, _payload):
                return types.SimpleNamespace(execute=lambda: RpcResult(
                    self.configured if name == "configure_translation_usage_limit" else self.reservation
                ))

        scope["translation_usage_db"] = RpcClient(False, None)
        with self.assertRaises(scope["TranslationQuotaError"]) as caught:
            scope["_reserve_automation_usage"]("openai_paid", 1, 10)
        self.assertEqual(caught.exception.reason_code, "MONTHLY_CONFIG_REJECTED")

        scope["translation_usage_db"] = RpcClient(True, None)
        with self.assertRaises(scope["TranslationQuotaError"]) as caught:
            scope["_reserve_automation_usage"]("openai_paid", 1, 10)
        self.assertEqual(caught.exception.reason_code, "MONTHLY_QUOTA_EXHAUSTED")

        class RpcFailure:
            def rpc(self, *_args):
                raise RuntimeError("secret=DO_NOT_LOG")

        scope["translation_usage_db"] = RpcFailure()
        with self.assertRaises(scope["TranslationQuotaError"]) as caught:
            scope["_reserve_automation_usage"]("openai_paid", 1, 10)
        self.assertEqual(caught.exception.reason_code, "MONTHLY_RESERVE_FAILED")
        self.assertEqual(str(caught.exception), "TRANSLATION_QUOTA")

        with self.assertRaises(scope["TranslationQuotaError"]) as caught:
            scope["_finalize_automation_usage"]("reservation-secret", True)
        self.assertEqual(caught.exception.reason_code, "MONTHLY_FINALIZE_FAILED")
        self.assertEqual(str(caught.exception), "TRANSLATION_QUOTA")

    def test_timeout_and_connection_error_remain_transient_without_payload_logging(self):
        for error_type in (Timeout, ConnectionError):
            with self.subTest(error_type=error_type.__name__):
                scope = provider_scope()
                error = error_type("https://invalid.local/?key=DO_NOT_LOG")
                scope["requests"].post = lambda *_args, **_kwargs: (_ for _ in ()).throw(error)
                output = io.StringIO()
                with contextlib.redirect_stdout(output), self.assertRaises(error_type) as caught:
                    scope["_translate_via_llm_with_fallback"](
                        ["HP"], "German", "Gesundheit", [("Gemini", scope["_call_gemini"])],
                    )
                self.assertIs(caught.exception, error)
                self.assertEqual(scope["retry_failure_policy"](caught.exception), ("deferred", "TRANSLATION_API_TEMPORARY", 1800))
                self.assertNotIn("DO_NOT_LOG", output.getvalue())

    def test_failed_gemini_still_falls_back_once_and_keeps_terminal_error(self):
        scope = provider_scope()
        calls = []
        def gemini(*_args):
            calls.append("gemini")
            raise scope["TranslationProviderError"](503)
        def openai(*_args):
            calls.append("openai")
            raise Timeout("DO_NOT_LOG")
        with contextlib.redirect_stdout(io.StringIO()), self.assertRaises(Timeout):
            scope["_translate_via_llm_with_fallback"](
                ["HP"], "Spanish", "Salud", [("Gemini", gemini), ("OpenAI Paid Fallback", openai)],
            )
        self.assertEqual(calls, ["gemini", "openai"])

    def test_openai_and_azure_http_failures_use_same_typed_policy(self):
        for caller_name in ("_call_openai", "_call_azure"):
            for status in (400, 503):
                with self.subTest(caller=caller_name, status=status):
                    scope = provider_scope()
                    scope["requests"].post = lambda *_args, **_kwargs: types.SimpleNamespace(status_code=status)
                    with contextlib.redirect_stdout(io.StringIO()), self.assertRaises(scope["TranslationProviderError"]) as caught:
                        scope[caller_name](["HP"], "German", 0.7)
                    self.assertEqual(caught.exception.status_code, status)
                    self.assertEqual(scope["retry_failure_policy"](caught.exception)[0], "deferred" if status >= 500 else "blocked")

    def test_unknown_provider_response_is_sanitized_and_not_scanned_for_http_tokens(self):
        scope = provider_scope()
        def failing(*_args):
            raise RuntimeError("HTTP 503 key=DO_NOT_LOG")
        output = io.StringIO()
        with contextlib.redirect_stdout(output), self.assertRaises(RuntimeError) as caught:
            scope["_translate_via_llm_with_fallback"](["HP"], "Korean", "체력", [("Gemini", failing)])
        self.assertEqual(str(caught.exception), "TRANSLATION_PERMANENT")
        self.assertEqual(scope["retry_failure_policy"](caught.exception), ("blocked", "TRANSLATION_PERMANENT", 0))
        self.assertNotIn("DO_NOT_LOG", output.getvalue())

    def test_untrusted_exception_metadata_is_not_written_to_logs(self):
        scope = provider_scope()

        class MaliciousError(RuntimeError):
            status_code = "503 status_secret=DO_NOT_LOG"
            reason_code = "UNKNOWN reason_secret=DO_NOT_LOG"

        def failing(*_args):
            raise MaliciousError("exception_secret=DO_NOT_LOG")

        output = io.StringIO()
        with contextlib.redirect_stdout(output), self.assertRaises(RuntimeError):
            scope["_translate_via_llm_with_fallback"](
                ["HP"], "Korean", "체력", [("Gemini", failing)],
            )
        self.assertIn("status=0", output.getvalue())
        self.assertNotIn("quota_reason=", output.getvalue())
        self.assertNotIn("DO_NOT_LOG", output.getvalue())

    def test_http_error_rejects_non_numeric_status_metadata(self):
        scope = provider_scope()
        for value in ("503 key=DO_NOT_LOG", None, True, 0, 600):
            error = scope["TranslationProviderError"](value)
            self.assertIsNone(error.status_code)
            self.assertEqual(str(error), "TRANSLATION_API_HTTP")


if __name__ == "__main__":
    unittest.main()
