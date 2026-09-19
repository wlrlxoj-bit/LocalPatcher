import ast
import hashlib
import pathlib
import sys
import unittest


SCRIPTS = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))
from translation_validation import is_option_candidate, parse_option_line, validate_translation


def load_functions(filename, names, namespace=None):
    source = (SCRIPTS / filename).read_text(encoding="utf-8")
    module = ast.parse(source)
    selected = [
        node for node in module.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name in names
    ]
    scope = dict(namespace or {})
    exec(compile(ast.Module(body=selected, type_ignores=[]), filename, "exec"), scope)
    return [scope[name] for name in names]


class TranslationChunkTests(unittest.TestCase):
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
    def test_ready_job_is_bounded_and_runs_only_for_scheduled_crawls(self):
        workflow = (SCRIPTS.parent / ".github" / "workflows" / "scraper.yml").read_text(encoding="utf-8")
        self.assertIn("crawl:", workflow)
        self.assertIn("cron: '0 */3 * * *'", workflow)
        self.assertIn("reprocess-ready:", workflow)
        self.assertIn("github.event_name == 'schedule'", workflow)
        self.assertIn("--limit 4", workflow)


if __name__ == "__main__":
    unittest.main()
