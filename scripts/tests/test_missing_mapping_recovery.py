"""외부 API 호출 없이 누락 발견과 일괄 실패 전달을 검증한다."""

import unittest
import pathlib
import sys
from types import SimpleNamespace
from urllib.parse import urlparse

# `python -m unittest scripts.tests...`로 실행해도 공통 테스트 도우미를 찾는다.
TESTS_DIR = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(TESTS_DIR))
from test_translation_pipeline_contracts import load_functions


class RecentDb:
    def __init__(self, rows):
        self.rows = rows
        self.scan_limit = None

    def table(self, name):
        assert name == "trainers"
        return self

    def select(self, fields):
        return self

    def order(self, field, desc=False):
        assert field == "id" and desc
        return self

    def limit(self, count):
        self.scan_limit = count
        return self

    def execute(self):
        return SimpleNamespace(data=self.rows[:self.scan_limit])


class MissingMappingRecoveryTests(unittest.TestCase):
    def test_explicit_batches_do_not_rotate_by_time(self):
        select, = load_functions("reprocess_pending_translations.py", ["select_target_batch"])
        targets = list(range(45))
        self.assertEqual(select(targets, 20, now=0)[0], list(range(20)))
        self.assertEqual(select(targets, 20, now=10_800)[0], list(range(20)))
        self.assertEqual(select(targets, 20, offset=20)[0], list(range(20, 40)))

    def discover(self, rows, scan_limit=100):
        discover, = load_functions("reprocess_pending_translations.py",
                                  ["discover_missing_mapping_urls"], {
                                      "urlparse": urlparse,
                                      "TARGET_LOCALES": ("ko", "ja", "de", "es"),
                                  })
        return discover(RecentDb(rows), scan_limit)

    def test_zero_rows_and_single_missing_locale_are_found_for_all_target_locales(self):
        rows = [
            {"id": 3, "games": {"slug": "zero", "fling_url": "https://flingtrainer.com/a"},
             "translation_mappings": []},
            {"id": 2, "games": {"slug": "partial", "fling_url": "https://flingtrainer.com/b"},
             "translation_mappings": [{"language_code": "ko"}]},
            {"id": 1, "games": {"slug": "complete", "fling_url": "https://flingtrainer.com/c"},
             "translation_mappings": [{"language_code": "ko"}, {"language_code": "ja"}]},
        ]
        urls, failures, details = self.discover(rows)
        self.assertEqual(len(urls), 3)
        self.assertEqual(failures, 0)
        self.assertEqual(details[0]["missing"], ["de", "es", "ja", "ko"])
        self.assertEqual(details[1]["missing"], ["de", "es", "ja"])
        self.assertEqual(details[2]["missing"], ["de", "es"])
        self.assertEqual(len(details), 3)

    def test_duplicate_game_is_one_target_and_missing_source_is_counted(self):
        rows = [{"id": i, "games": {"slug": "same", "fling_url": "https://flingtrainer.com/a"},
                 "translation_mappings": []} for i in range(25, 0, -1)]
        rows.append({"id": 0, "games": None, "translation_mappings": []})
        urls, failures, details = self.discover(rows)
        self.assertEqual(len(urls), 1)
        self.assertEqual(len(details), 26)
        self.assertEqual(failures, 1)
        self.assertEqual(len(self.discover(rows, scan_limit=10)[2]), 10)

    def test_batch_failure_returns_nonzero(self):
        class DictionaryDb:
            def table(self, name):
                return self
            def select(self, fields):
                return self
            def range(self, start, end):
                return self
            def execute(self):
                return SimpleNamespace(data=[])

        fake_parser = SimpleNamespace(
            add_argument=lambda *a, **k: None,
            parse_args=lambda: SimpleNamespace(provider="azure", confirm_paid=False,
                                              force=False, url=None, languages=["ko", "ja"]),
        )
        outcomes = iter([True, False, True])
        calls = []
        main, = load_functions("scraper.py", ["main"], {
            "argparse": SimpleNamespace(ArgumentParser=lambda **k: fake_parser),
            "SUPABASE_URL": "test", "SUPABASE_KEY": "test",
            "create_client": lambda *a: DictionaryDb(), "Client": object,
            "db_dictionary_ko": {}, "db_dictionary_ja": {},
            "fetch_recent_trainers": lambda: [{}, {}, {}],
            "scrape_and_patch_trainer": lambda *a, **k: (calls.append(k), next(outcomes))[1],
            "sync_popular_fling_trainers": lambda db: None,
        })
        self.assertEqual(main(), 1)
        self.assertEqual(len(calls), 3)
        self.assertTrue(all(call["reprocess_existing_unapproved"] is False for call in calls))


if __name__ == "__main__":
    unittest.main()
