"""자동 재시도 폭주를 막는 외부 호출 없는 계약 테스트."""

import argparse
import ast
import os
import pathlib
import subprocess
import sys
import unittest
from types import SimpleNamespace
from urllib.parse import urlparse
from unittest import mock


TESTS_DIR = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(TESTS_DIR))
from test_translation_pipeline_contracts import load_functions


class ReprocessQueueSafetyTests(unittest.TestCase):
    def test_time_slots_do_not_rotate_pending_urls_automatically(self):
        select, = load_functions("reprocess_pending_translations.py", ["select_target_batch"])
        targets = list(range(45))
        self.assertEqual(select(targets, 20, now=0), (targets[:20], 0))
        self.assertEqual(select(targets, 20, now=10_800), (targets[:20], 0))
        self.assertEqual(select(targets, 20, offset=20), (targets[20:40], 20))

    def test_quota_is_a_normal_deferred_outcome(self):
        classify, = load_functions("reprocess_pending_translations.py", ["classify_child_result"])
        self.assertEqual(classify(1, "[locale-failed] error=TranslationQuotaError"), "quota_deferred")
        self.assertEqual(classify(1, "unclassified failure"), "failed")
        self.assertEqual(classify(0, ""), "success")

    def test_due_claims_keep_each_trainer_locale_independent_and_separate_invalid_sources(self):
        class Db:
            def rpc(self, name, payload):
                self.name, self.payload = name, payload
                rows = [
                    {"trainer_id": 1, "language_code": "ko", "fling_url": "https://flingtrainer.com/a"},
                    {"trainer_id": 2, "language_code": "ja", "fling_url": "https://flingtrainer.com/a"},
                    {"trainer_id": 3, "language_code": "de", "fling_url": None},
                ]
                return SimpleNamespace(execute=lambda: SimpleNamespace(data=rows))

        claim, = load_functions("reprocess_pending_translations.py", ["claim_due_retry_targets"], {
            "urlparse": urlparse,
            "TARGET_LOCALES": ("ko", "ja", "de", "es"),
        })
        db = Db()
        targets, missing = claim(db, 4)
        self.assertEqual(db.name, "claim_due_translation_retries")
        self.assertEqual(db.payload, {"p_limit": 4})
        # 같은 FLiNG 게시물이라도 claim한 trainer/locale 한 건씩만 하위 작업에
        # 전달해야 한다. URL 단위로 합치면 한 작업이 다른 대기 항목까지 처리한다.
        self.assertEqual(targets, [
            ("https://flingtrainer.com/a", 1, "ko"),
            ("https://flingtrainer.com/a", 2, "ja"),
        ])
        self.assertEqual(missing, [(3, "de")])

    def test_main_starts_one_child_per_trainer_locale_for_same_url(self):
        """동일 URL claim도 trainer/locale별로 정확히 한 번씩만 실행한다."""
        script = pathlib.Path(__file__).resolve().parents[1] / "reprocess_pending_translations.py"
        module = ast.parse(script.read_text(encoding="utf-8"))
        functions = [node for node in module.body if isinstance(node, ast.FunctionDef)]
        commands = []
        fake_db = object()
        scope = {
            "argparse": argparse,
            "os": os,
            "subprocess": subprocess,
            "sys": sys,
            "__file__": str(script),
            "urlparse": urlparse,
            "TARGET_LOCALES": ("ko", "ja", "de", "es"),
            "create_client": lambda endpoint, key: fake_db,
        }
        exec(compile(ast.Module(body=functions, type_ignores=[]), str(script), "exec"), scope)
        scope["claim_due_retry_targets"] = lambda db, limit: ([
            ("https://flingtrainer.com/a", 1, "ko"),
            ("https://flingtrainer.com/a", 2, "ja"),
        ], [])

        def fake_run(command, **kwargs):
            commands.append((command, kwargs))
            return SimpleNamespace(returncode=0, stdout="")

        with mock.patch.dict(os.environ, {
            "NEXT_PUBLIC_SUPABASE_URL": "https://example.supabase.co",
            "SUPABASE_SERVICE_ROLE_KEY": "test-only",
        }, clear=True), mock.patch.object(
            sys, "argv", ["reprocess_pending_translations.py", "--apply", "--limit", "4"]
        ), mock.patch.object(subprocess, "run", side_effect=fake_run):
            self.assertEqual(scope["main"](), 0)

        self.assertEqual([command for command, _ in commands], [
            [sys.executable, str(script.parent / "scraper.py"), "--provider", "gemini",
             "--url", "https://flingtrainer.com/a", "--languages", "ko", "--trainer-id", "1"],
            [sys.executable, str(script.parent / "scraper.py"), "--provider", "gemini",
             "--url", "https://flingtrainer.com/a", "--languages", "ja", "--trainer-id", "2"],
        ])
        self.assertTrue(all(kwargs == {
            "check": False, "capture_output": True, "text": True
        } for _, kwargs in commands))

    def test_reprocessor_uses_all_four_locales_and_never_runs_on_schedule(self):
        scripts = pathlib.Path(__file__).resolve().parents[1]
        source = (scripts / "reprocess_pending_translations.py").read_text(encoding="utf-8")
        workflow = (scripts.parent / ".github" / "workflows" / "scraper.yml").read_text(encoding="utf-8")
        self.assertIn('TARGET_LOCALES = ("ko", "ja", "de", "es")', source)
        self.assertIn('claim_due_translation_retries', source)
        self.assertIn("reprocess-ready:", workflow)
        self.assertIn("github.event_name == 'schedule'", workflow)
        self.assertIn("reprocess_pending_translations.py --apply --provider gemini --limit 4", workflow)

    def test_scheduled_crawl_skips_existing_unapproved_trainers(self):
        scripts = pathlib.Path(__file__).resolve().parents[1]
        scraper = (scripts / "scraper.py").read_text(encoding="utf-8")
        self.assertIn("reprocess_existing_unapproved=False", scraper)
        self.assertIn("[SCHEDULED_EXISTING_PENDING_SKIPPED]", scraper)
        self.assertIn("VALIDATION_REJECTED", scraper)
        self.assertIn("TRANSLATION_QUOTA", scraper)


if __name__ == "__main__":
    unittest.main()
