"""실제 워크플로의 독립 무결성 복구 조건과 비용·실패 경계를 검증합니다."""

import ast
import itertools
import pathlib
import re
import unittest


WORKFLOW = pathlib.Path(__file__).resolve().parents[2] / ".github/workflows/scraper.yml"


def evaluate_condition(expression, context):
    """저장소 YAML 조건의 제한된 논리식만 해석하며 임의 코드는 실행하지 않습니다."""
    for key in sorted(context, key=len, reverse=True):
        expression = expression.replace(key, repr(context[key]))
    expression = expression.replace("always()", "True")
    expression = expression.replace("&&", " and ").replace("||", " or ")
    expression = re.sub(r"!(?!=)", " not ", expression).strip()

    def evaluate(node):
        if isinstance(node, ast.Constant) and isinstance(node.value, (str, bool)):
            return node.value
        if isinstance(node, ast.BoolOp):
            values = [evaluate(value) for value in node.values]
            if isinstance(node.op, ast.And):
                return all(values)
            if isinstance(node.op, ast.Or):
                return any(values)
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.Not):
            return not evaluate(node.operand)
        if isinstance(node, ast.Compare) and len(node.ops) == 1:
            left, right = evaluate(node.left), evaluate(node.comparators[0])
            if isinstance(node.ops[0], ast.Eq):
                return left == right
            if isinstance(node.ops[0], ast.NotEq):
                return left != right
        raise AssertionError("지원하지 않는 워크플로 조건식입니다.")

    return evaluate(ast.parse(expression, mode="eval").body)


class IntegrityWorkflowScopeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.workflow = WORKFLOW.read_text(encoding="utf-8")
        cls.job = cls.workflow.split("  integrity-recovery:\n", 1)[1]
        cls.job = re.split(r"\n  [a-z][a-z0-9-]*:\n", cls.job, maxsplit=1)[0]
        cls.expression = re.search(r"^    if: \$\{\{ (.+) \}\}$", cls.job, re.M).group(1)

    def allowed(self, **overrides):
        context = {
            "github.ref": "refs/heads/main",
            "github.event_name": "schedule",
            "github.event.inputs.target_url": "",
            "github.event.inputs.retry_only": "",
            "github.event.inputs.recover_internal_quota_trainer": "",
            "needs.validate-inputs.result": "success",
            "needs.crawl.result": "success",
            "needs.reprocess-ready.result": "success",
            "cancelled()": False,
        }
        context.update(overrides)
        return evaluate_condition(self.expression, context)

    def test_validated_normal_main_runs_allow_isolated_reprocess_failure(self):
        # 재처리 실패는 전체 실행의 실패로 남되 독립 복구 한 건까지 막지는 않습니다.
        for event, retry, reprocess in itertools.product(
            ("schedule", "workflow_dispatch"), ("", "false"), ("success", "failure")
        ):
            with self.subTest(event=event, retry=retry, reprocess=reprocess):
                self.assertTrue(self.allowed(**{
                    "github.event_name": event,
                    "github.event.inputs.retry_only": retry,
                    "needs.reprocess-ready.result": reprocess,
                }))

    def test_dependency_result_matrix_blocks_cancellation_skip_and_unknown_values(self):
        states = ("success", "failure", "cancelled", "skipped", "unexpected", "")
        for validated, crawl, reprocess in itertools.product(states, repeat=3):
            with self.subTest(validated=validated, crawl=crawl, reprocess=reprocess):
                expected = validated == crawl == "success" and reprocess in ("success", "failure")
                self.assertEqual(self.allowed(**{
                    "needs.validate-inputs.result": validated,
                    "needs.crawl.result": crawl,
                    "needs.reprocess-ready.result": reprocess,
                }), expected)
        self.assertFalse(self.allowed(**{"cancelled()": True}))

    def test_non_main_targeted_retry_and_legacy_recovery_runs_are_excluded(self):
        cases = [
            {"github.ref": "refs/heads/codex/example"},
            {"github.ref": "refs/tags/release"},
            {"github.event_name": "push"},
            {"github.event_name": "pull_request"},
            {"github.event_name": "unexpected"},
            {"github.event.inputs.target_url": "https://flingtrainer.com/trainer/example/"},
            {"github.event.inputs.retry_only": "true"},
            {"github.event.inputs.retry_only": "unexpected"},
            {"github.event.inputs.recover_internal_quota_trainer": "2730"},
            {"github.event.inputs.recover_internal_quota_trainer": "2731"},
            {"github.event.inputs.recover_internal_quota_trainer": "unexpected"},
        ]
        for event, overrides in itertools.product(("schedule", "workflow_dispatch"), cases):
            with self.subTest(event=event, overrides=overrides):
                self.assertFalse(self.allowed(**{"github.event_name": event, **overrides}))

    def test_explicit_dependencies_and_status_functions_prevent_implicit_success_gate(self):
        dependencies = re.search(r"^    needs: \[(.+)\]$", self.job, re.M).group(1)
        self.assertEqual([value.strip() for value in dependencies.split(",")],
                         ["validate-inputs", "crawl", "reprocess-ready"])
        self.assertIn("always()", self.expression)
        self.assertIn("!cancelled()", self.expression)

    def test_worker_bound_concurrency_and_upstream_failure_reporting_are_preserved(self):
        self.assertIn("run: python scripts/recover_translation_integrity.py --apply --provider gemini --limit 1", self.job)
        self.assertIn("group: translation-integrity-recovery-production", self.job)
        self.assertIn("cancel-in-progress: false", self.job)
        self.assertIn("group: fling-trainer-scraper-production", self.workflow)
        reprocess = self.workflow.split("  reprocess-ready:\n", 1)[1].split("\n  integrity-recovery:", 1)[0]
        self.assertIn("python scripts/reprocess_pending_translations.py --apply --provider gemini --limit 4", reprocess)
        self.assertNotRegex(self.workflow, r"continue-on-error\s*:")
        self.assertNotIn("|| true", reprocess + self.job)
        self.assertNotIn("--force", reprocess + self.job)

    def test_condition_interpreter_rejects_unknown_executable_syntax(self):
        for expression in ("unknown()", "True or unknown()", "a.b == 'x'", "__import__('os')"):
            with self.subTest(expression=expression):
                with self.assertRaises(AssertionError):
                    evaluate_condition(expression, {})


if __name__ == "__main__":
    unittest.main()
