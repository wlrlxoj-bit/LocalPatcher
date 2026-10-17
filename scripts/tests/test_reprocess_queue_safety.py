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
from test_integrity_workflow_scope import evaluate_condition


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
            return SimpleNamespace(returncode=0, stdout=(
                f"[save-outcome] trainer={command[-1]} locale={command[-3]} status=approved"
            ))

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

    def test_safe_noindex_requeue_is_explicit_chunked_and_aggregate_only(self):
        class Db:
            def __init__(self):
                self.calls = 0

            def rpc(self, name, payload):
                self.calls += 1
                self.name, self.payload = name, payload
                rows = [{"queued_count": 2, "preserved_count": 1}] if self.calls == 1 else [
                    {"queued_count": 0, "preserved_count": 0}
                ]
                return SimpleNamespace(execute=lambda: SimpleNamespace(data=rows))

        requeue, = load_functions(
            "reprocess_pending_translations.py",
            ["requeue_safe_noindex_candidates"],
        )
        db = Db()
        self.assertEqual(requeue(db, chunk_limit=500, chunks=20), (2, 1))
        self.assertEqual(db.name, "requeue_safe_noindex_translation_candidates")
        self.assertEqual(db.payload, {"p_limit": 500})
        self.assertEqual(db.calls, 2)

    def test_safe_noindex_requeue_does_not_join_the_scheduled_workflow(self):
        scripts = pathlib.Path(__file__).resolve().parents[1]
        source = (scripts / "reprocess_pending_translations.py").read_text(encoding="utf-8")
        workflow = (scripts.parent / ".github" / "workflows" / "scraper.yml").read_text(encoding="utf-8")
        self.assertIn("--requeue-safe-noindex", source)
        self.assertIn("--apply와 함께 단독", source)
        self.assertNotIn("requeue-safe-noindex", workflow)

    def test_child_outcomes_require_exact_trainer_locale_and_never_print_originals(self):
        details, = load_functions("reprocess_pending_translations.py", ["child_result_details"])
        cases = [
            (0, "[save-outcome] trainer=2730 locale=ko status=approved", "approved", "NONE"),
            (0, "[save-outcome] trainer=2730 locale=ko status=preserved", "preserved", "NONE"),
            (0, "[RETRY_PROTECTED] trainer=2730 locale=ko", "preserved", "EXISTING_MAPPING_PROTECTED"),
            (1, "[RETRY_QUEUED] trainer=2730 locale=ko state=deferred code=TRANSLATION_QUOTA", "deferred", "TRANSLATION_QUOTA"),
            (1, "[RETRY_QUEUED] trainer=2730 locale=ko state=blocked code=VALIDATION_FAILED", "blocked", "VALIDATION_FAILED"),
            (0, "[ARCHIVE_ONLY_PAGE_SKIPPED] neutral", "skipped", "ARCHIVE_RAR_ONLY"),
            (0, "", "unconfirmed", "CHILD_RESULT_UNCONFIRMED"),
            (1, "ModuleNotFoundError: secret module body", "failed", "CHILD_DEPENDENCY_MISSING"),
            (1, "Authorization: Bearer secret-key\nhttps://secret.example/private", "failed", "REPROCESS_CHILD_FAILED"),
            (0, "[save-outcome] trainer=2731 locale=ko status=approved", "unconfirmed", "CHILD_RESULT_UNCONFIRMED"),
            (0, "[save-outcome] trainer=2730 locale=ja status=approved", "unconfirmed", "CHILD_RESULT_UNCONFIRMED"),
            (1, "[RETRY_QUEUED] trainer=2730 locale=ko state=deferred code=PRIVATE_SECRET", "failed", "REPROCESS_CHILD_FAILED"),
        ]
        for rc, output, outcome, code in cases:
            with self.subTest(output=output):
                result = details(rc, output, 2730, "ko")
                self.assertEqual((result["outcome"], result["code"]), (outcome, code))
                self.assertNotIn("secret", str(result).lower())

    def test_provider_diagnostics_do_not_turn_successful_fallback_into_failure(self):
        details, = load_functions("reprocess_pending_translations.py", ["child_result_details"])
        result = details(0, (
            "[TRANSLATION_PROVIDER_FAILED] provider=GEMINI code=TRANSLATION_PERMANENT status=402\n"
            "[save-outcome] trainer=2730 locale=ko status=approved\n"
            "[TRANSLATION_PROVIDER_FAILED] provider=secret code=TRANSLATION_PERMANENT status=402"
        ), 2730, "ko")
        self.assertEqual(result["outcome"], "approved")
        self.assertEqual(result["providers"], [("GEMINI", "TRANSLATION_PERMANENT", "NONE", "402")])

    def test_legacy_recovery_claim_is_explicit_and_not_the_default(self):
        class Db:
            def rpc(self, name, payload):
                self.name, self.payload = name, payload
                return SimpleNamespace(execute=lambda: SimpleNamespace(data=[]))

        claim, = load_functions("reprocess_pending_translations.py", ["claim_due_retry_targets"], {
            "urlparse": urlparse, "TARGET_LOCALES": ("ko", "ja", "de", "es"),
        })
        db = Db()
        claim(db, 4, [2730])
        self.assertEqual(db.name, "claim_legacy_internal_quota_recovery")
        self.assertEqual(db.payload, {"p_limit": 4, "p_trainer_ids": [2730]})
        claim(db, 4)
        self.assertEqual(db.name, "claim_due_translation_retries")

    def test_retry_only_workflow_preserves_scheduled_batch_and_is_shell_safe(self):
        scripts = pathlib.Path(__file__).resolve().parents[1]
        workflow = (scripts.parent / ".github/workflows/scraper.yml").read_text(encoding="utf-8")
        self.assertIn("retry_only:", workflow)
        self.assertIn("recover_internal_quota_trainer:", workflow)
        # 기존 두 작업의 차단 조건은 유지한다. 무결성 복구는 새 허용 목록을 실제 식으로 검증한다.
        self.assertEqual(workflow.count("github.event.inputs.retry_only != 'true'"), 2)
        for job_name, next_job in (("drain-patcher-revalidation-outbox", "crawl"),
                                   ("crawl", "reprocess-ready")):
            job = workflow.split(f"  {job_name}:\n", 1)[1].split(f"\n  {next_job}:\n", 1)[0]
            condition_line = next(line for line in job.splitlines() if line.startswith("    if: "))
            self.assertIn("github.event.inputs.retry_only != 'true'", condition_line)
        integrity = workflow.split("  integrity-recovery:\n", 1)[1]
        condition_line = next(line for line in integrity.splitlines() if line.startswith("    if: "))
        expression = condition_line.split("${{ ", 1)[1].rsplit(" }}", 1)[0]
        context = {
            "github.ref": "refs/heads/main",
            "github.event_name": "workflow_dispatch",
            "github.event.inputs.target_url": "",
            "github.event.inputs.recover_internal_quota_trainer": "",
            "needs.validate-inputs.result": "success",
            "needs.crawl.result": "success",
            "needs.reprocess-ready.result": "failure",
            "cancelled()": False,
        }
        for retry, expected in (("", True), ("false", True), ("true", False), ("unexpected", False)):
            with self.subTest(retry=retry):
                self.assertEqual(evaluate_condition(expression, {
                    **context, "github.event.inputs.retry_only": retry,
                }), expected)
        self.assertIn('2730|2731)', workflow)
        self.assertIn('--recover-internal-quota-trainer "$RECOVERY_TRAINER"', workflow)
        self.assertNotIn('--recover-internal-quota-trainer "${{', workflow)
        self.assertIn("--discovery-limit 3", workflow)
        self.assertIn("recover_translation_integrity.py --apply --provider gemini --limit 1", workflow)
        self.assertIn("validate-inputs:", workflow)
        self.assertIn("needs: [validate-inputs, crawl]", workflow)
        self.assertIn("needs.validate-inputs.result == 'success'", workflow)
        self.assertIn("[RETRY_ONLY_TARGET_URL_CONFLICT]", workflow)

    def test_retry_target_mismatch_cannot_insert_or_translate(self):
        """제품의 실제 early-continue 블록을 실행하여 미등록/다른 해시의 외부 쓰기를 막는다."""
        script = pathlib.Path(__file__).resolve().parents[1] / "scraper.py"
        tree = ast.parse(script.read_text(encoding="utf-8"))
        fn = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == "scrape_and_patch_trainer")
        guard = next(node for node in ast.walk(fn) if isinstance(node, ast.If)
                     and "retry_identity_mismatch = True" in ast.unparse(node)
                     and "not any(" in ast.unparse(node.test))
        guard_line = guard.lineno
        inserts = [node.lineno for node in ast.walk(fn) if isinstance(node, ast.Call)
                   and isinstance(node.func, ast.Attribute) and node.func.attr == "insert"]
        self.assertTrue(inserts and all(line > guard_line for line in inserts))
        # 실제 guard 뒤에 등록/번역 호출을 배치한 격리 루프이다.
        module = ast.Module(body=[ast.For(
            target=ast.Name(id="_", ctx=ast.Store()), iter=ast.Tuple(elts=[ast.Constant(1)], ctx=ast.Load()),
            body=[guard, ast.Expr(value=ast.Call(func=ast.Name(id="insert", ctx=ast.Load()), args=[], keywords=[])),
                  ast.Expr(value=ast.Call(func=ast.Name(id="translate", ctx=ast.Load()), args=[], keywords=[]))],
            orelse=[],
        )], type_ignores=[])
        ast.fix_missing_locations(module)
        for target, rows, calls in [(2730, [], 0), (2730, [{"id": 2731}], 0),
                                    (2730, [{"id": 2730}], 1), (None, [], 1)]:
            insert, translate = mock.Mock(), mock.Mock()
            namespace = {"target_trainer_id": target, "trainer_res": SimpleNamespace(data=rows),
                         "insert": insert, "translate": translate, "print": lambda *args: None}
            exec(compile(module, str(script), "exec"), namespace)
            self.assertEqual(insert.call_count, calls)
            self.assertEqual(translate.call_count, calls)

    def test_duplicate_hash_selects_exact_target_before_any_game_update(self):
        """조회 첫 행이 다른 trainer라도 claim 대상의 game_id만 선택한다."""
        script = pathlib.Path(__file__).resolve().parents[1] / "scraper.py"
        tree = ast.parse(script.read_text(encoding="utf-8"))
        fn = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == "scrape_and_patch_trainer")
        selection = next(node for node in ast.walk(fn) if isinstance(node, ast.Assign)
                         and any(isinstance(t, ast.Name) and t.id == "matched_trainer_rows" for t in node.targets))
        module = ast.fix_missing_locations(ast.Module(body=[selection], type_ignores=[]))
        for target, expected in [(2730, 30), (None, 31)]:
            namespace = {"target_trainer_id": target, "trainer_res": SimpleNamespace(data=[
                {"id": 2731, "game_id": 31}, {"id": 2730, "game_id": 30},
            ])}
            exec(compile(module, str(script), "exec"), namespace)
            self.assertEqual(namespace["matched_trainer_rows"][0]["game_id"], expected)
        source = ast.unparse(fn)
        self.assertIn("trainer_id = matched_trainer_rows[0]['id']", source)
        self.assertIn("game_id = matched_trainer_rows[0]['game_id']", source)
        self.assertNotIn("trainer_id = trainer_res.data[0]['id']", source)


if __name__ == "__main__":
    unittest.main()
