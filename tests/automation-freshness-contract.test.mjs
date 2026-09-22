import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = process.cwd();
const read = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('일반 수동 동기화는 수집 뒤 재시도 큐를 처리하고, 단일 URL 수집은 섞지 않는다', async () => {
  const workflow = await read('.github/workflows/scraper.yml');
  assert.match(workflow, /github\.event_name == 'schedule'/);
  assert.match(workflow, /github\.event_name == 'workflow_dispatch'/);
  assert.match(workflow, /github\.event\.inputs\.target_url == ''/);
  assert.match(workflow, /python scripts\/reprocess_pending_translations\.py --apply --provider gemini --limit 4/);
  assert.match(workflow, /concurrency:\s*[\s\S]*?cancel-in-progress: false/);
});

test('자동 저장 성공은 비밀 인증된 내부 ISR 웹훅을 한 번만 요청한다', async () => {
  const [scraper, workflow, route] = await Promise.all([
    read('scripts/scraper.py'),
    read('.github/workflows/scraper.yml'),
    read('app/api/internal/revalidate-patcher/route.ts'),
  ]);
  assert.match(scraper, /def revalidate_patcher_after_automation\(trainer_id\)/);
  assert.match(scraper, /Authorization.*Bearer \{PATCHER_REVALIDATE_SECRET\}/);
  assert.match(scraper, /if trainer_ok:\s*\n\s*revalidate_patcher_after_automation\(trainer_id\)/);
  assert.match(workflow, /PATCHER_REVALIDATE_URL: https:\/\/localpatcher\.com\/api\/internal\/revalidate-patcher/);
  assert.equal((workflow.match(/PATCHER_REVALIDATE_SECRET: \$\{\{ secrets\.PATCHER_REVALIDATE_SECRET \}\}/g) || []).length, 2);
  assert.match(route, /timingSafeEqual/);
  assert.match(route, /authorization\?\.startsWith\('Bearer '\)/);
  assert.match(route, /typeof trainerId !== 'number' \|\| !Number\.isSafeInteger\(trainerId\) \|\| trainerId <= 0/);
  assert.match(route, /revalidatePatcherForTrainer/);
  assert.match(route, /private, no-store/);
});

test('작업 번역 승인도 반환된 trainer id를 사용해 ISR을 즉시 무효화한다', async () => {
  const route = await read('app/api/admin/translations/approve/route.ts');
  assert.match(route, /requireTranslationAdmin\(request\)/);
  assert.match(route, /approve_translation_job/);
  assert.match(route, /Number\.isSafeInteger\(trainerId\) && trainerId > 0/);
  assert.match(route, /await revalidatePatcherForTrainer\(client, trainerId\)/);
  assert.match(route, /try \{\s*await revalidatePatcherForTrainer\(client, trainerId\);\s*\} catch \{/s);
  assert.match(route, /console\.error\('Patcher ISR revalidation failed after translation approval'\)/);
  assert.doesNotMatch(route, /console\.error\([^)]*error/);
  assert.ok(route.indexOf('return NextResponse.json(data)') > route.indexOf("console.error('Patcher ISR revalidation failed after translation approval')"));
});
