import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const workflowUrl = new URL('../.github/workflows/scraper.yml', import.meta.url);

async function readWorkflow() {
  return readFile(workflowUrl, 'utf8');
}

test('정기 및 일반 수동 실행은 공식 발견 큐를 소량 처리한다', async () => {
  const workflow = await readWorkflow();

  assert.match(workflow, /cron:\s*'0 \*\/3 \* \* \*'/);
  assert.match(workflow, /python scripts\/scraper\.py --provider gemini --discovery-limit 3/);
  assert.match(workflow, /if \[ -n "\$\{\{ github\.event\.inputs\.target_url \}\}" \]; then[\s\S]*?python scripts\/scraper\.py --provider gemini --url "\$\{\{ github\.event\.inputs\.target_url \}\}"[\s\S]*?else[\s\S]*?--discovery-limit 3/s);
  assert.doesNotMatch(workflow, /archive_scraper\.py/);
});

test('동시 실행을 취소하지 않고, 후속 재시도 처리를 유지한다', async () => {
  const workflow = await readWorkflow();

  assert.match(workflow, /group:\s*fling-trainer-scraper-production/);
  assert.match(workflow, /cancel-in-progress:\s*false/);
  // 입력 검증과 crawl의 완료를 함께 기다리되 crawl 실패 후 due 재시도는 유지한다.
  const retryJob = workflow.match(/  reprocess-ready:([\s\S]*?)(?=\n  [a-z][a-z-]*:|$)/)?.[1];
  assert.ok(retryJob, '재처리 job이 있어야 한다');
  assert.match(retryJob, /needs:\s*\[validate-inputs,\s*crawl\]/);
  assert.match(retryJob, /needs\.validate-inputs\.result == 'success'/);
  assert.match(retryJob, /always\(\) && !cancelled\(\)/);
  assert.match(workflow, /always\(\) && !cancelled\(\)/);
  assert.match(workflow, /python scripts\/reprocess_pending_translations\.py --apply --provider gemini --limit 4/);
});

test('운영 시크릿은 참조만 하고 값은 워크플로에 넣지 않는다', async () => {
  const workflow = await readWorkflow();

  assert.match(workflow, /GEMINI_API_KEY:\s*\$\{\{ secrets\.GEMINI_API_KEY \}\}/);
  assert.match(workflow, /OPENAI_API_KEY:\s*\$\{\{ secrets\.OPENAI_API_KEY \}\}/);
  assert.match(workflow, /SUPABASE_SERVICE_ROLE_KEY:\s*\$\{\{ secrets\.SUPABASE_SERVICE_ROLE_KEY \}\}/);
});
