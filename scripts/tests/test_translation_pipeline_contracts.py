import ast
import pathlib
import sys
import unittest


SCRIPTS = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))
from translation_validation import is_option_candidate, parse_option_line


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

    def test_malformed_option_fails_closed_but_header_is_preserved(self):
        import re
        source = (SCRIPTS / "scraper.py").read_text(encoding="utf-8")
        module = ast.parse(source)
        functions = [
            node for node in module.body
            if isinstance(node, ast.FunctionDef)
            and node.name == "translate_line"
        ]
        scope = {
            "re": re,
            "parse_option_line": parse_option_line,
            "is_option_candidate": is_option_candidate,
            "db_dictionary_ko": {},
            "COMMON_TRANSLATIONS": {},
        }
        exec(compile(ast.Module(body=functions, type_ignores=[]), "scraper.py", "exec"), scope)
        with self.assertRaises(RuntimeError):
            scope["translate_line"]("Ctrl + Shift + F12 = Infinite Health")
        self.assertEqual(scope["translate_line"]("Trainer Options"), "Trainer Options")


class FakeQuery:
    def __init__(self, pages):
        self.pages = pages
        self.cursor = 0
    def select(self, _): return self
    def in_(self, *_): return self
    def gt(self, _, value): self.cursor = value; return self
    def order(self, _): return self
    def limit(self, _): return self
    def execute(self):
        rows = [row for row in self.pages if row["id"] > self.cursor][:20]
        return type("R", (), {"data": rows})()


class FakeDb:
    def __init__(self, rows): self.query = FakeQuery(rows)
    def table(self, _): return self.query


class PendingPaginationTests(unittest.TestCase):
    def test_more_than_30_rows_are_paginated_and_deduplicated(self):
        discover, = load_functions("reprocess_pending_translations.py", ["discover_pending_urls"])
        rows = [
            {
                "id": index,
                "trainers": {"games": {"fling_url": f"https://example/{index % 31}"}},
            }
            for index in range(1, 46)
        ]
        urls, missing = discover(FakeDb(rows), ["pending"], page_size=20)
        self.assertEqual(len(urls), 31)
        self.assertEqual(missing, 0)


class WorkflowContractTests(unittest.TestCase):
    def test_pending_job_runs_after_crawl_failure(self):
        workflow = (SCRIPTS.parent / ".github" / "workflows" / "scraper.yml").read_text(encoding="utf-8")
        self.assertIn("crawl:", workflow)
        self.assertIn("reprocess-pending:", workflow)
        self.assertIn("needs: crawl", workflow)
        self.assertIn("if: ${{ !cancelled() }}", workflow)


if __name__ == "__main__":
    unittest.main()
