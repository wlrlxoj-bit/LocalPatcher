import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const workflowUrl = new URL('../.github/workflows/scraper.yml', import.meta.url);

async function readWorkflow() {
  return (await readFile(workflowUrl, 'utf8')).replace(/\r\n/g, '\n');
}

test('정기 및 일반 수동 실행은 공식 발견 큐를 소량 처리한다', async () => {
  const workflow = await readWorkflow();

  assert.match(workflow, /cron:\s*'0 \*\/3 \* \* \*'/);
  assert.match(workflow, /python scripts\/scraper\.py --provider gemini --discovery-limit 3/);
  assert.match(workflow, /if \[ -n "\$TARGET_URL" \]; then[\s\S]*?python scripts\/scraper\.py --provider gemini --url "\$TARGET_URL"[\s\S]*?else[\s\S]*?--discovery-limit 3/s);
  assert.doesNotMatch(workflow, /archive_scraper\.py/);
});

test('수동 URL은 환경 변수로 전달하며 shell 코드에 직접 삽입하지 않는다', async () => {
  const workflow = await readWorkflow();
  const crawler = workflow.split('    - name: Run Crawler & Auto-Translation Pipeline\n')[1]
    ?.split('\n  reprocess-ready:')[0];
  assert.ok(crawler, '수집 실행 단계가 있어야 한다');
  assert.match(crawler, /TARGET_URL:\s*\$\{\{ github\.event\.inputs\.target_url \}\}/);
  const script = crawler.split('      run: |\n')[1];
  assert.ok(script, '수집 shell 본문이 있어야 한다');
  assert.doesNotMatch(script, /\$\{\{/);
  assert.match(script, /--url "\$TARGET_URL"/);
});

test('Linux bash는 메타문자가 든 수동 URL을 재해석하지 않고 단일 인자로 전달한다', {
  // Windows에서는 WSL/패키지를 실행하거나 설치하지 않는다. 운영과 같은 Linux에서만 검증한다.
  skip: process.platform !== 'linux' ? 'Linux bash 전용 격리 검증' : false,
}, async (t) => {
  const workflow = await readWorkflow();
  const crawler = workflow.split('    - name: Run Crawler & Auto-Translation Pipeline\n')[1]
    .split('\n  reprocess-ready:')[0];
  const script = crawler.split('      run: |\n')[1].replace(/^        /gm, '');
  const payload = 'https://fixture.invalid/"; printf INJECTED; # $(printf EXECUTED) `printf BACKTICK`\n* ? & token=URL_SENTINEL';
  // 실제 Python·스크레이퍼는 호출하지 않고, 함수가 받은 인자만 NUL로 구분한다.
  const result = spawnSync('/bin/bash', ['--noprofile', '--norc', '-c',
    `python() { printf '%s\\0' "$@"; }\n${script}`], {
    encoding: 'utf8', env: { TARGET_URL: payload }, timeout: 5000,
  });
  if (result.error?.code === 'ENOENT') {
    t.skip('bash가 없어 격리 shell 검증을 실행하지 않음');
    return;
  }
  assert.ifError(result.error);
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.deepEqual(result.stdout.split('\0'), [
    'scripts/scraper.py', '--provider', 'gemini', '--url', payload, '',
  ]);
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
