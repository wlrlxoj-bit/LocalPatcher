import ast
import hashlib
import json
import pathlib
import sys
import unittest
from unittest import mock


SCRIPTS = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))
from translation_validation import (
    is_option_candidate,
    is_untranslated_option_label,
    is_valid_option_label,
    option_text_is_publishable,
    parse_option_line,
    parse_options,
    validate_translation,
)


def load_functions(filename, names, namespace=None):
    source = (SCRIPTS / filename).read_text(encoding="utf-8")
    module = ast.parse(source)
    selected = [
        node for node in module.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name in names
    ]
    scope = dict(namespace or {})
    scope.setdefault("is_valid_option_label", is_valid_option_label)
    scope.setdefault("option_text_is_publishable", option_text_is_publishable)
    exec(compile(ast.Module(body=selected, type_ignores=[]), filename, "exec"), scope)
    return [scope[name] for name in names]


class TranslationChunkTests(unittest.TestCase):
    def test_source_failure_emits_target_identity_schema_before_continuing(self):
        module = ast.parse((SCRIPTS / "scraper.py").read_text(encoding="utf-8"))
        scraper = next(node for node in module.body if isinstance(node, ast.FunctionDef)
                       and node.name == "scrape_and_patch_trainer")
        guard = next(node for node in ast.walk(scraper) if isinstance(node, ast.If)
                     and isinstance(node.test, ast.UnaryOp)
                     and isinstance(node.test.operand, ast.Name)
                     and node.test.operand.id == "source_complete")
        diagnostic = {"reason": "COUNT_MISMATCH", "expected": 50, "actual": 2}
        failures, outcomes = [], []
        continuation = mock.Mock()
        scope = {
            "source_complete": False, "source_count": 2, "option_count": 50,
            "source_diagnostic": diagnostic, "trainer_id": 99, "target_trainer_id": 2052,
            "requested_locales": {"ko"}, "json": json,
            "strict_download_failures": True, "had_eligible_failure": False,
            "record_failure": failures.append,
            "outcome_reporter": lambda *args: outcomes.append(args),
            "continuation": continuation,
        }
        loop = ast.For(target=ast.Name(id="item", ctx=ast.Store()),
                       iter=ast.List(elts=[ast.Constant(1)], ctx=ast.Load()),
                       body=[guard, ast.Expr(value=ast.Call(func=ast.Name(id="continuation", ctx=ast.Load()), args=[], keywords=[]))],
                       orelse=[])
        with mock.patch("builtins.print") as output:
            exec(compile(ast.fix_missing_locations(ast.Module(body=[loop], type_ignores=[])), "scraper.py", "exec"), scope)
        lines = [call.args[0] for call in output.call_args_list]
        encoded = next(line.removeprefix("[SOURCE_OPTION_DIAGNOSTIC] ") for line in lines
                       if line.startswith("[SOURCE_OPTION_DIAGNOSTIC] "))
        self.assertEqual(json.loads(encoded), {"trainer": 2052, "locale": "ko", **diagnostic})
        self.assertEqual(failures, ["SOURCE_OPTION_INCOMPLETE"])
        self.assertEqual(outcomes, [("blocked", "SOURCE_OPTION_INCOMPLETE")])
        self.assertTrue(scope["had_eligible_failure"])
        continuation.assert_not_called()

    def test_source_diagnostic_distinguishes_failure_reasons_without_extra_evaluation(self):
        calls = []
        checker, = load_functions("scraper.py", ["source_block_completeness"], {
            "parse_options": lambda text: calls.append("parse") or [1, 2],
            "is_option_candidate": lambda line: line == "unparsed",
            "parse_option_line": lambda line: None,
            "option_text_is_publishable": lambda text: calls.append("quality") or False,
        })
        for text, expected, reason, evaluations in (
            ("unparsed", 0, "EXPECTED_COUNT_UNKNOWN", ["parse"]),
            ("unparsed", 3, "COUNT_MISMATCH", ["parse"]),
            ("unparsed", 2, "UNPARSED_OPTION", ["parse"]),
            ("source", 2, "SOURCE_QUALITY_FAILED", ["parse", "quality"]),
        ):
            with self.subTest(reason=reason):
                calls.clear()
                diagnostic = {}
                self.assertEqual(checker(text, expected, diagnostic), (False, 2))
                self.assertEqual(diagnostic, {
                    "reason": reason, "expected": expected or None, "actual": 2,
                })
                self.assertEqual(calls, evaluations)
        diagnostic = {}
        checker("source", 1_000_001, diagnostic)
        self.assertIsNone(diagnostic["expected"])

    def test_source_preflight_blocks_incomplete_slot_and_accepts_section_title(self):
        checker, = load_functions(
            "scraper.py", ["source_block_completeness"],
            {
                "parse_options": parse_options,
                "is_option_candidate": is_option_candidate,
                "parse_option_line": parse_option_line,
            },
        )
        source = "Edit Character\nNum 1 - Infinite Health\nNum 2 - Infinite Ammo"
        self.assertEqual(checker(source, 50), (False, 2))
        self.assertEqual(checker(source, 2), (True, 2))
        diagnostic = {}
        self.assertEqual(checker(source, 2, diagnostic), (True, 2))
        self.assertEqual(diagnostic, {})
        self.assertEqual(checker(source + "\nNum 3 = Money", 2), (False, 2))
        self.assertEqual(checker("Num 1 - Health\nNum 1 - Money", 2), (False, 2))
        self.assertEqual(checker("Num 1 - **note", 1), (False, 1))
        self.assertEqual(checker("Num 1 - " + "x" * 181, 1), (False, 1))

    def test_llm_note_only_result_uses_fallback_instead_of_cache(self):
        import json
        translate, = load_functions(
            "scraper.py",
            ["_translate_via_llm_with_fallback"],
            {
                "_chunk_translation_items": lambda lines: [lines],
                "_build_llm_prompt": lambda *args: "prompt",
                "is_untranslated_option_label": is_untranslated_option_label,
                "retry_failure_policy": lambda exc: ("blocked", "INVALID_TRANSLATION", 0),
                "TranslationQuotaError": type("TranslationQuotaError", (RuntimeError,), {}),
                "TranslationProviderError": type("TranslationProviderError", (RuntimeError,), {}),
                "requests": type("Requests", (), {"Timeout": TimeoutError, "ConnectionError": ConnectionError}),
                "json": json,
            },
        )
        providers = [
            ("Gemini", lambda *_: ["Money Multiplier **금액 증가"]),
            ("OpenAI Paid Fallback", lambda *_: ["자금 배율 **금액 증가"]),
        ]
        self.assertEqual(
            translate(["Money Multiplier **Takes effect"], "Korean", "예시", providers),
            ["자금 배율 **금액 증가"],
        )
        for invalid in ("**주석만", "가" * 181, "무한\x01체력", "체력\nNum 2 - 금액"):
            with self.subTest(invalid=invalid):
                self.assertEqual(
                    translate(["Health"], "Korean", "예시", [
                        ("Gemini", lambda *_, result=invalid: [result]),
                        ("OpenAI Paid Fallback", lambda *_: ["무한 체력"]),
                    ]),
                    ["무한 체력"],
                )

    def test_dictionary_rejects_unchanged_label_with_translated_note(self):
        saver, = load_functions(
            "scraper.py", ["save_new_translations_to_dictionary"],
            {
                "parse_option_line": parse_option_line,
                "is_untranslated_option_label": is_untranslated_option_label,
                "Client": object,
            },
        )
        class DictionaryDb:
            def __init__(self):
                self.calls = []
            def table(self, name):
                self.calls.append(name)
                return self
            def upsert(self, payload, **kwargs):
                self.calls.append(payload)
                return self
            def execute(self):
                return None
        db = DictionaryDb()
        saver("Num 1 - Money Multiplier **Takes effect",
              "Num 1 - Money Multiplier **금액 증가", "ko", db)
        self.assertEqual(db.calls, [])
        saver("Num 1 - Money Multiplier **Takes effect",
              "Num 1 - 자금 배율 **금액 증가", "ko", db)
        self.assertEqual(db.calls[1]["english_term"], "Money Multiplier")
        self.assertEqual(db.calls[1]["korean_translation"], "자금 배율")

    def test_invalid_memory_dictionary_value_falls_back_to_llm(self):
        translate, = load_functions(
            "scraper.py", ["translate_line_ja"],
            {
                "parse_option_line": parse_option_line,
                "is_untranslated_option_label": is_untranslated_option_label,
                "db_dictionary_ja": {"money multiplier": "Money Multiplier **金額増加"},
            },
        )
        self.assertIsNone(translate("Num 2 - Money Multiplier"))

    def test_51_items_are_chunked_25_25_1(self):
        chunker, = load_functions("scraper.py", ["_chunk_translation_items"])
        self.assertEqual([len(chunk) for chunk in chunker(["x"] * 51)], [25, 25, 1])

    def test_5000_chars_allowed_and_5001_is_split_or_rejected(self):
        chunker, = load_functions("scraper.py", ["_chunk_translation_items"])
        self.assertEqual(chunker(["x" * 5000]), [["x" * 5000]])
        self.assertEqual(
            [len(chunk) for chunk in chunker(["x" * 2500, "y" * 2501])],
            [1, 1],
        )
        with self.assertRaises(RuntimeError):
            chunker(["x" * 5001])

    def test_option_label_is_split_without_changing_prefix(self):
        import re
        source = (SCRIPTS / "scraper.py").read_text(encoding="utf-8")
        module = ast.parse(source)
        nodes = [
            node for node in module.body
            if isinstance(node, (ast.Assign, ast.FunctionDef))
            and (
                isinstance(node, ast.FunctionDef)
                and node.name == "_split_option_for_translation"
                or isinstance(node, ast.Assign)
                and any(isinstance(target, ast.Name) and target.id == "OPTION_LINE_RE" for target in node.targets)
            )
        ]
        scope = {"re": re, "parse_option_line": parse_option_line}
        exec(compile(ast.Module(body=nodes, type_ignores=[]), "scraper.py", "exec"), scope)
        self.assertEqual(
            scope["_split_option_for_translation"]("Ctrl+Num 1 - Infinite Health"),
            ("Ctrl+Num 1 - ", "Infinite Health"),
        )

    def test_all_delimiters_and_multi_modifier_roundtrip_exactly(self):
        import re
        source = (SCRIPTS / "scraper.py").read_text(encoding="utf-8")
        module = ast.parse(source)
        function = next(
            node for node in module.body
            if isinstance(node, ast.FunctionDef)
            and node.name == "_split_option_for_translation"
        )
        scope = {"parse_option_line": parse_option_line}
        exec(compile(ast.Module(body=[function], type_ignores=[]), "scraper.py", "exec"), scope)
        splitter = scope["_split_option_for_translation"]
        cases = [
            "Ctrl + Shift + F12 -> Infinite Health",
            "ArrowUp  —  Infinite Health",
            "BracketLeft – Infinite Health",
            "NumPad * → Infinite Health",
            "PageDown - Infinite Health",
            "Alt + Num 1 : Infinite Health",
        ]
        for source_line in cases:
            with self.subTest(source_line=source_line):
                prefix, label = splitter(source_line)
                self.assertEqual(label, "Infinite Health")
                self.assertEqual(prefix + "번역", source_line.replace("Infinite Health", "번역"))

    def test_unparseable_option_is_preserved_for_downstream_fail_closed_validation(self):
        import re
        source = (SCRIPTS / "scraper.py").read_text(encoding="utf-8")
        module = ast.parse(source)
        functions = [
            node for node in module.body
            if isinstance(node, ast.FunctionDef)
            and node.name in {"translate_line", "translate_line_ja"}
        ]
        scope = {
            "re": re,
            "parse_option_line": parse_option_line,
            "is_option_candidate": is_option_candidate,
            "db_dictionary_ko": {},
            "db_dictionary_ja": {},
            "COMMON_TRANSLATIONS": {},
            "is_untranslated_option_label": is_untranslated_option_label,
        }
        exec(compile(ast.Module(body=functions, type_ignores=[]), "scraper.py", "exec"), scope)
        # 번역 단계는 특이 단축키 후보를 보존한다. 저장 직전 검증이
        # SOURCE_OPTION_PARSE_FAILED로 초안을 거절하므로 크롤러 전체를 중단하지 않는다.
        unparseable_option = "Ctrl + Shift + F12 = Infinite Health"
        self.assertTrue(is_option_candidate(unparseable_option))
        for translator in (scope["translate_line"], scope["translate_line_ja"]):
            with self.subTest(translator=translator.__name__):
                self.assertEqual(translator(unparseable_option), unparseable_option)
        self.assertEqual(scope["translate_line"]("Trainer Options"), "Trainer Options")

        binary = bytearray(512)
        binary[:2] = b"MZ"
        binary = bytes(binary)
        validation = validate_translation(
            binary=binary,
            expected_sha256=hashlib.sha256(binary).hexdigest(),
            expected_size=len(binary),
            text_section=(64, 128),
            offset=256,
            max_char_len=100,
            encoding="UTF-16LE",
            original_text=unparseable_option,
            translated_text=unparseable_option,
            option_count=1,
            language_code="ko",
        )
        self.assertFalse(validation.ok)
        self.assertIn("SOURCE_OPTION_PARSE_FAILED", validation.codes)


class FakeDb:
    def __init__(self, rows):
        self.rows, self.calls = rows, []
    def rpc(self, name, payload):
        self.calls.append((name, payload))
        cursor = payload["p_after_id"]
        page_size = payload["p_page_size"]
        rows = [row for row in self.rows if row["mapping_id"] > cursor][:page_size]
        return type(
            "Q", (), {"execute": lambda _: type("R", (), {"data": rows})()}
        )()


class PendingPaginationTests(unittest.TestCase):
    def test_more_than_30_rows_are_paginated_and_deduplicated(self):
        from urllib.parse import urlparse
        discover, = load_functions(
            "reprocess_pending_translations.py",
            ["discover_pending_urls"],
            {"urlparse": urlparse},
        )
        rows = [
            {
                "mapping_id": index,
                "trainer_id": 1000 + index,
                "fling_url": f"https://example/{index % 31}",
            }
            for index in range(1, 46)
        ]
        urls, missing = discover(FakeDb(rows), ["pending"], page_size=20)
        self.assertEqual(len(urls), 31)
        self.assertEqual(missing, 0)

    def test_rpc_cursor_and_missing_url_are_fail_closed(self):
        from urllib.parse import urlparse
        discover, = load_functions(
            "reprocess_pending_translations.py",
            ["discover_pending_urls"],
            {"urlparse": urlparse},
        )
        db = FakeDb([
            {"mapping_id": 1, "trainer_id": 10, "fling_url": None},
            {"mapping_id": 2, "trainer_id": 11, "fling_url": "invalid-relative"},
            {"mapping_id": 3, "trainer_id": 12, "fling_url": "https://example/ok"},
        ])
        urls, missing = discover(db, ["pending", "rejected"], page_size=2)
        self.assertEqual(urls, ["https://example/ok"])
        self.assertEqual(missing, 2)
        self.assertEqual(db.calls[0][0], "list_pending_translation_sources")
        self.assertTrue(db.calls[0][1]["p_retry_rejected"])
        self.assertEqual(db.calls[1][1]["p_after_id"], 2)


class WorkflowContractTests(unittest.TestCase):
    def test_outbox_drain_scope_matrix_and_input_validation_dependency(self):
        import re
        workflow = (SCRIPTS.parent / ".github" / "workflows" / "scraper.yml").read_text(encoding="utf-8")
        job = workflow.split("  drain-patcher-revalidation-outbox:\n", 1)[1].split("\n  crawl:", 1)[0]
        self.assertIn("needs: validate-inputs", job)
        expression = re.search(r"^    if: \$\{\{ (.+) \}\}$", job, re.M).group(1)
        self.assertNotIn("always()", expression)
        cases = [
            ("schedule", "", "", "success", True),
            ("workflow_dispatch", "", "false", "success", True),
            ("workflow_dispatch", "https://flingtrainer.com/trainer/example/", "false", "success", False),
            ("workflow_dispatch", "", "true", "success", False),
            ("workflow_dispatch", "", "false", "failure", False),
            ("push", "", "", "success", False),
        ]
        for event, target, retry, validated, expected in cases:
            with self.subTest(event=event, target=target, retry=retry, validated=validated):
                condition = expression
                for key, value in {
                    "github.event.inputs.retry_only": retry,
                    "github.event.inputs.target_url": target,
                    "github.event_name": event,
                }.items():
                    condition = condition.replace(key, repr(value))
                condition = condition.replace("&&", " and ").replace("||", " or ")
                # always() 없는 종속 작업은 Actions의 기본 success() 경계도 적용한다.
                actual = validated == "success" and eval(condition, {"__builtins__": {}}, {})
                self.assertEqual(actual, expected)

    def test_ready_job_is_bounded_and_runs_only_for_scheduled_crawls(self):
        workflow = (SCRIPTS.parent / ".github" / "workflows" / "scraper.yml").read_text(encoding="utf-8")
        self.assertIn("crawl:", workflow)
        self.assertIn("cron: '0 */3 * * *'", workflow)
        self.assertIn("reprocess-ready:", workflow)
        self.assertIn("github.event_name == 'schedule'", workflow)
        self.assertIn("--limit 4", workflow)


if __name__ == "__main__":
    unittest.main()
