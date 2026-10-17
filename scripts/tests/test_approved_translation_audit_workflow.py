"""운영 작업과 읽기 전용 원본 감사의 분리 계약을 검증한다."""

import pathlib
import re
import unittest


WORKFLOW = (pathlib.Path(__file__).resolve().parents[2]
            / ".github/workflows/scraper.yml").read_text(encoding="utf-8")
JOBS = {
    match.group(1): match.group(2)
    for match in re.finditer(
        r"^  ([a-z][a-z-]+):\n(.*?)(?=^  [a-z][a-z-]+:|\Z)",
        WORKFLOW.split("jobs:\n", 1)[1], re.MULTILINE | re.DOTALL,
    )
}
MUTATIONS = ("drain-patcher-revalidation-outbox", "crawl",
             "reprocess-ready", "integrity-recovery")


def job_enabled(name, event="workflow_dispatch", audit="", target="", retry="",
                valid="success", crawl="success", reprocess="success",
                ref="refs/heads/main"):
    """GitHub의 빈 입력과 의존 결과를 치환해 기존 조건별 실행 여부를 확인한다."""
    condition = re.search(r"^    if: \$\{\{ (.*?) \}\}$", JOBS[name], re.MULTILINE).group(1)
    values = {
        "github.event.inputs.audit_approved_trainer": audit,
        "github.event.inputs.target_url": target,
        "github.event.inputs.retry_only": retry,
        "github.event_name": event,
        "github.ref": ref,
        "needs.validate-inputs.result": valid,
        "needs.crawl.result": crawl,
        "needs.reprocess-ready.result": reprocess,
    }
    for key, value in values.items():
        condition = condition.replace(key, repr(value))
    condition = condition.replace("always()", "True").replace("!cancelled()", "True")
    condition = condition.replace("&&", " and ").replace("||", " or ")
    return bool(eval(condition, {"__builtins__": {}}, {}))


class ApprovedTranslationAuditWorkflowTests(unittest.TestCase):
    def test_audit_choices_and_validation_guards(self):
        inputs = WORKFLOW.split("# 예약 실행", 1)[0]
        audit_input = inputs.split("      audit_approved_trainer:", 1)[1]
        self.assertIn("type: choice", audit_input)
        self.assertIn("options: ['', '2730', '2731']", audit_input)
        validation = JOBS["validate-inputs"]
        self.assertIn('if [ -n "$AUDIT_TRAINER" ]; then', validation)
        self.assertIn('if [ "$EVENT_NAME" != "workflow_dispatch" ]; then', validation)
        self.assertIn('2730|2731) ;;', validation)
        self.assertIn('*) echo \'[AUDIT_TRAINER_NOT_ALLOWED]\'; exit 1 ;;', validation)
        self.assertIn('if [ -n "$TARGET_URL" ] || [ "$RETRY_ONLY" = "true" ] || [ -n "$RECOVERY_TRAINER" ]; then', validation)
        self.assertIn("[AUDIT_INPUT_CONFLICT]", validation)
        self.assertIn('if [ "$WORKFLOW_REF" != "refs/heads/main" ] && [ -z "$AUDIT_TRAINER" ]; then', validation)
        self.assertIn("[NON_MAIN_REQUIRES_READ_ONLY_AUDIT]", validation)
        self.assertNotIn("${{", validation.split("        run: |", 1)[1])

    def test_only_audit_runs_for_fixed_ids(self):
        for trainer in ("2730", "2731"):
            with self.subTest(trainer=trainer):
                self.assertTrue(job_enabled("audit-approved-source", audit=trainer))
                for name in MUTATIONS:
                    self.assertFalse(job_enabled(name, audit=trainer))
                self.assertFalse(job_enabled("audit-approved-source", audit=trainer, valid="failure"))
                self.assertFalse(job_enabled("audit-approved-source", event="schedule", audit=trainer))

    def test_unknown_and_missing_events_cannot_audit(self):
        for trainer in ("", "1", "2732", "$(touch /tmp/unwanted)"):
            self.assertFalse(job_enabled("audit-approved-source", audit=trainer))
        self.assertFalse(job_enabled("audit-approved-source", event="", audit="2730"))
        for name in MUTATIONS:
            self.assertFalse(job_enabled(name, audit="unknown"))

    def test_feature_branch_never_runs_mutations_when_audit_input_is_lost(self):
        for audit in ("", "unknown", "2730", "2731"):
            for name in MUTATIONS:
                with self.subTest(audit=audit, job=name):
                    self.assertIn("github.ref == 'refs/heads/main'", JOBS[name])
                    self.assertFalse(job_enabled(name, audit=audit, ref="refs/heads/codex/read-only-audit"))
            self.assertEqual(
                job_enabled("audit-approved-source", audit=audit, ref="refs/heads/codex/read-only-audit"),
                audit in ("2730", "2731"),
            )

    def test_failed_validation_blocks_always_mutation_jobs(self):
        for name in ("reprocess-ready", "integrity-recovery"):
            self.assertFalse(job_enabled(name, audit="2730", valid="failure"))
        self.assertIn("needs: validate-inputs", JOBS["audit-approved-source"])
        for name in ("crawl", "drain-patcher-revalidation-outbox"):
            self.assertIn("needs: validate-inputs", JOBS[name])

    def test_prior_operation_branches_are_preserved(self):
        for event in ("schedule", "workflow_dispatch"):
            self.assertEqual(
                [job_enabled(name, event=event) for name in MUTATIONS],
                [True, True, True, True],
            )
            self.assertFalse(job_enabled("audit-approved-source", event=event))
        self.assertEqual(
            [job_enabled(name, target="https://flingtrainer.com/trainer/example/") for name in MUTATIONS],
            [False, True, False, False],
        )
        # 번역 재시도와 과거 내부 상한 복구는 같은 기존 재처리 작업을 이용한다.
        self.assertEqual([job_enabled(name, retry="true") for name in MUTATIONS],
                         [False, False, True, False])
        self.assertIn('--recover-internal-quota-trainer "$RECOVERY_TRAINER"', JOBS["reprocess-ready"])
        self.assertTrue(job_enabled("reprocess-ready", crawl="failure"))
        self.assertFalse(job_enabled("integrity-recovery", crawl="failure"))

    def test_audit_has_no_operational_credentials_or_mutation_commands(self):
        audit = JOBS["audit-approved-source"]
        self.assertIn("permissions:\n      contents: read", audit)
        self.assertIn("persist-credentials: false", audit)
        self.assertIn("timeout-minutes: 10", audit)
        self.assertIn('if [ -e .env.local ]; then', audit)
        for forbidden in ("secrets.", "SUPABASE", "GEMINI_API_KEY", "OPENAI_API_KEY",
                          "AZURE_TRANSLATOR", "PATCHER_REVALIDATE", "--apply",
                          "scripts/scraper.py", "reprocess_pending_translations.py"):
            self.assertNotIn(forbidden, audit)
        self.assertIn('AUDIT_TRAINER: ${{ github.event.inputs.audit_approved_trainer }}', audit)
        self.assertIn('--trainer-id "$AUDIT_TRAINER"', audit)
        self.assertIn('--trainer-id "$AUDIT_TRAINER" >&3', audit)
        self.assertIn('exec 3> "$RUNNER_TEMP/approved-source-audit.json"', audit)
        self.assertIn("echo 'report_created=true' >> \"$GITHUB_OUTPUT\"", audit)
        self.assertNotIn('--manifest', audit)
        self.assertNotIn('--report', audit)
        run_block = audit.split("      - name: Audit one approved trainer", 1)[1].split("      #", 1)[0]
        self.assertIn("          set -C\n", run_block)
        self.assertNotIn("cat ", run_block)
        self.assertNotIn("${{", run_block.split("        run: |", 1)[1])

    def test_only_sanitized_json_artifact_is_uploaded_even_on_failure(self):
        artifact = JOBS["audit-approved-source"].split("      - name: Preserve sanitized", 1)[1]
        self.assertIn("if: ${{ always() && !cancelled() && steps.audit-source.outputs.report_created == 'true' }}", artifact)
        self.assertIn("path: ${{ runner.temp }}/approved-source-audit.json\n", artifact)
        self.assertIn("retention-days: 1\n", artifact)
        self.assertIn("if-no-files-found: ignore", artifact)
        self.assertNotIn("*", artifact)
        for forbidden in (".zip", ".exe", "include-hidden-files", "working-directory"):
            self.assertNotIn(forbidden, artifact)

    def test_audit_actions_are_sha_pinned_and_share_production_lock(self):
        audit = JOBS["audit-approved-source"]
        actions = re.findall(r"uses: ([^\s]+)", audit)
        self.assertEqual(len(actions), 3)
        for action in actions:
            self.assertRegex(action, r"^actions/[a-z-]+@[a-f0-9]{40}$")
        self.assertIn("group: fling-trainer-scraper-production\n  cancel-in-progress: false", WORKFLOW)
        self.assertNotIn("    concurrency:", audit)


if __name__ == "__main__":
    unittest.main()
