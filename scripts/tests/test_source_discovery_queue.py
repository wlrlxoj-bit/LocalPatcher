import ast
from datetime import datetime, timezone
import pathlib
import unittest
import xml.etree.ElementTree as ElementTree
from types import SimpleNamespace
from urllib.parse import urlparse


SCRIPTS = pathlib.Path(__file__).resolve().parents[1]


def load_functions(names, namespace=None):
    """외부 DB·네트워크 초기화 없이 발견 큐의 작은 함수 계약만 불러온다."""
    source = (SCRIPTS / "scraper.py").read_text(encoding="utf-8")
    module = ast.parse(source)
    selected = [
        node for node in module.body
        if isinstance(node, ast.FunctionDef) and node.name in names
    ]
    scope = dict(namespace or {})
    exec(compile(ast.Module(body=selected, type_ignores=[]), "scraper.py", "exec"), scope)
    return [scope[name] for name in names]


class SourceDiscoveryQueueTests(unittest.TestCase):
    def test_official_sitemap_accepts_only_trainer_paths_and_preserves_lastmod(self):
        valid_url, normalize_lastmod, parse_sitemap = load_functions(
            [
                "is_official_fling_trainer_url", "normalize_fling_sitemap_lastmod",
                "parse_fling_post_sitemap",
            ],
            {
                "urlparse": urlparse, "re": __import__("re"), "ElementTree": ElementTree,
                "datetime": datetime, "timezone": timezone,
                "timedelta": __import__("datetime").timedelta,
            },
        )
        self.assertTrue(valid_url("https://flingtrainer.com/trainer/graveyard-keeper-2-trainer/"))
        self.assertFalse(valid_url("http://flingtrainer.com/trainer/example"))
        self.assertFalse(valid_url("https://flingtrainer.com/category/trainer/"))
        self.assertFalse(valid_url("https://other.example/trainer/example"))
        self.assertFalse(valid_url("https://flingtrainer.com/trainer/example?unsafe=1"))

        xml = """<?xml version='1.0'?>
        <urlset xmlns='http://www.sitemaps.org/schemas/sitemap/0.9'>
          <url><loc>https://flingtrainer.com/trainer/graveyard-keeper-2-trainer/</loc><lastmod>2026-09-27T01:02:03+00:00</lastmod></url>
          <url><loc>https://flingtrainer.com/trainer/graveyard-keeper-2-trainer/</loc><lastmod>2020-01-01</lastmod></url>
          <url><loc>https://flingtrainer.com/page/2/</loc></url>
        </urlset>"""
        self.assertEqual(parse_sitemap(xml), [{
            "source_url": "https://flingtrainer.com/trainer/graveyard-keeper-2-trainer",
            "source_lastmod": "2026-09-27T01:02:03+00:00",
        }])
        self.assertEqual(normalize_lastmod("2026-09-27T01:02:03+00:00")[1], "valid")

    def test_sitemap_invalid_or_future_lastmod_keeps_candidate_with_null_metadata(self):
        _valid_url, _normalize_lastmod, parse_sitemap = load_functions(
            [
                "is_official_fling_trainer_url", "normalize_fling_sitemap_lastmod",
                "parse_fling_post_sitemap",
            ],
            {
                "urlparse": urlparse, "re": __import__("re"), "ElementTree": ElementTree,
                "datetime": datetime, "timezone": timezone,
                "timedelta": __import__("datetime").timedelta,
            },
        )
        xml = """<urlset xmlns='http://www.sitemaps.org/schemas/sitemap/0.9'>
          <url><loc>https://flingtrainer.com/trainer/valid/</loc><lastmod>2026-09-27</lastmod></url>
          <url><loc>https://flingtrainer.com/trainer/bad-date/</loc><lastmod>not-a-date</lastmod></url>
          <url><loc>https://flingtrainer.com/trainer/future-date/</loc><lastmod>2999-01-01T00:00:00+00:00</lastmod></url>
        </urlset>"""
        candidates = parse_sitemap(xml)
        self.assertEqual([candidate["source_url"] for candidate in candidates], [
            "https://flingtrainer.com/trainer/valid",
            "https://flingtrainer.com/trainer/bad-date",
            "https://flingtrainer.com/trainer/future-date",
        ])
        self.assertEqual([candidate["source_lastmod"] for candidate in candidates], [
            "2026-09-27", None, None,
        ])

    def test_claim_limit_is_bounded_to_safe_small_batch(self):
        normalize_limit = load_functions(
            ["normalize_discovery_limit"],
            {"DISCOVERY_CLAIM_DEFAULT_LIMIT": 3, "DISCOVERY_CLAIM_MAX_LIMIT": 5},
        )[0]
        self.assertEqual(normalize_limit(None), 3)
        self.assertEqual(normalize_limit("0"), 1)
        self.assertEqual(normalize_limit("4"), 4)
        self.assertEqual(normalize_limit("999"), 5)
        self.assertEqual(normalize_limit("invalid"), 3)

    def test_bulk_upsert_and_lifecycle_writes_accept_only_explicit_true(self):
        valid_url, bulk_upsert, complete, defer, block = load_functions(
            [
                "is_official_fling_trainer_url", "upsert_fling_discovery_candidates",
                "complete_fling_discovery_candidate", "defer_fling_discovery_candidate",
                "block_fling_discovery_candidate",
            ],
            {
                "urlparse": urlparse, "re": __import__("re"),
                "DISCOVERY_UPSERT_BATCH_SIZE": 5_000,
            },
        )

        class Db:
            def __init__(self, result):
                self.result = result
                self.calls = []

            def rpc(self, name, params):
                self.calls.append((name, params))
                return self

            def execute(self):
                return SimpleNamespace(data=self.result)

        candidates = [{
            "source_url": "https://flingtrainer.com/trainer/graveyard-keeper-2-trainer",
            "source_lastmod": "2026-09-27T01:02:03+00:00",
        }]
        for result in (False, None, [], {}):
            self.assertIsNone(bulk_upsert(Db(result), candidates))
            self.assertFalse(complete(Db(result), candidates[0]["source_url"]))
            self.assertFalse(defer(Db(result), candidates[0]["source_url"], "UPSTREAM_HTTP_429", 10800))
            self.assertFalse(block(Db(result), candidates[0]["source_url"], "PROCESSING_FAILED"))

        db = Db(True)
        self.assertTrue(bulk_upsert(db, candidates))
        self.assertEqual(db.calls, [("upsert_fling_discovery_candidates", {"p_candidates": candidates})])
        complete_db = Db(True)
        self.assertTrue(complete(
            complete_db, candidates[0]["source_url"], failure_code="ARCHIVE_RAR_ONLY",
        ))
        self.assertEqual(complete_db.calls, [("complete_fling_discovery_candidate", {
            "p_source_url": candidates[0]["source_url"],
            "p_outcome": "completed",
            "p_failure_code": None,
        })])
        self.assertFalse(bulk_upsert(Db(True), [{"source_url": "https://evil.example/trainer/x"}]))
        self.assertTrue(valid_url(candidates[0]["source_url"]))

    def test_bulk_upsert_keeps_null_lastmod_candidates_in_same_batch(self):
        valid_url, bulk_upsert = load_functions(
            ["is_official_fling_trainer_url", "upsert_fling_discovery_candidates"],
            {"urlparse": urlparse, "re": __import__("re"), "DISCOVERY_UPSERT_BATCH_SIZE": 5_000},
        )

        class Db:
            def __init__(self):
                self.calls = []

            def rpc(self, name, params):
                self.calls.append((name, params))
                return self

            def execute(self):
                return SimpleNamespace(data=True)

        candidates = [
            {"source_url": "https://flingtrainer.com/trainer/valid", "source_lastmod": "2026-09-27"},
            {"source_url": "https://flingtrainer.com/trainer/bad-date", "source_lastmod": None},
        ]
        db = Db()
        self.assertTrue(bulk_upsert(db, candidates))
        self.assertEqual(db.calls[0][1]["p_candidates"], candidates)
        self.assertTrue(all(valid_url(candidate["source_url"]) for candidate in candidates))

    def test_large_sitemap_uses_at_most_five_thousand_candidates_per_upsert(self):
        batch_upsert = load_functions(
            ["upsert_fling_discovery_candidate_batches"],
            {
                "DISCOVERY_UPSERT_BATCH_SIZE": 5_000,
                "upsert_fling_discovery_candidates": lambda _db, batch: calls.append(batch) or True,
            },
        )[0]
        calls = []
        candidates = [{"source_url": f"https://flingtrainer.com/trainer/game-{index}"}
                      for index in range(5_001)]
        self.assertTrue(batch_upsert(SimpleNamespace(), candidates))
        self.assertEqual([len(batch) for batch in calls], [5_000, 1])

        failure_calls = []
        outcomes = iter([True, False])
        batch_upsert = load_functions(
            ["upsert_fling_discovery_candidate_batches"],
            {
                "DISCOVERY_UPSERT_BATCH_SIZE": 5_000,
                "upsert_fling_discovery_candidates": lambda _db, batch: (
                    failure_calls.append(batch) or next(outcomes)
                ),
            },
        )[0]
        self.assertFalse(batch_upsert(SimpleNamespace(), candidates))
        self.assertEqual([len(batch) for batch in failure_calls], [5_000, 1])

    def test_claimed_upstream_deferral_is_recorded_not_completed(self):
        calls = []

        def scrape(_post, _db, **kwargs):
            kwargs["outcome_reporter"]("deferred", "UPSTREAM_HTTP_403", 10800)
            return True

        process = load_functions(
            ["process_claimed_fling_discovery_candidate"],
            {
                "scrape_and_patch_trainer": scrape,
                "discovery_post_from_candidate": lambda candidate: {"link": candidate["source_url"]},
                "defer_fling_discovery_candidate": lambda _db, url, code, delay: calls.append((url, code, delay)) or True,
                "block_fling_discovery_candidate": lambda *_args: self.fail("upstream deferral must not block"),
                "complete_fling_discovery_candidate": lambda *_args, **_kwargs: self.fail("upstream deferral must not complete"),
            },
        )[0]
        self.assertTrue(process(SimpleNamespace(), {"source_url": "https://flingtrainer.com/trainer/example"}))
        self.assertEqual(calls, [("https://flingtrainer.com/trainer/example", "UPSTREAM_HTTP_403", 10800)])

    def test_claimed_rar_only_result_completes_neutrally(self):
        calls = []

        def scrape(_post, _db, **kwargs):
            kwargs["outcome_reporter"]("completed", "ARCHIVE_RAR_ONLY")
            return True

        process = load_functions(
            ["process_claimed_fling_discovery_candidate"],
            {
                "scrape_and_patch_trainer": scrape,
                "discovery_post_from_candidate": lambda candidate: {"link": candidate["source_url"]},
                "defer_fling_discovery_candidate": lambda *_args: self.fail("RAR-only must not defer"),
                "block_fling_discovery_candidate": lambda *_args: self.fail("RAR-only must not block"),
                "complete_fling_discovery_candidate": lambda _db, url, outcome, failure_code: calls.append((url, outcome, failure_code)) or True,
            },
        )[0]
        self.assertTrue(process(SimpleNamespace(), {"source_url": "https://flingtrainer.com/trainer/example/"}))
        self.assertEqual(calls, [("https://flingtrainer.com/trainer/example", "completed", None)])

    def test_scheduled_main_prefers_sitemap_queue_over_home_twenty_scan(self):
        source = (SCRIPTS / "scraper.py").read_text(encoding="utf-8")
        main_start = source.index("def main():")
        scheduled = source[main_start:source.index("def sync_popular_fling_trainers", main_start)]
        self.assertIn("run_sitemap_discovery_queue(", scheduled)
        self.assertIn("if discovery_result is None:", scheduled)
        self.assertIn("[DISCOVERY_HOME_FALLBACK]", scheduled)
        self.assertIn("posts[:20]", scheduled)


if __name__ == "__main__":
    unittest.main()
