import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), 'utf8');

test('최초 snapshot 미초기화는 sitemap reader가 거절하고 worker가 full bootstrap을 수행한다', async () => {
  const sql = await read('supabase/migrations/202610050001_patcher_sitemap_snapshot_and_revalidation_outbox.sql');
  const readerStart = sql.indexOf('create or replace function public.list_patcher_indexable_sitemap_entries');
  const reader = sql.slice(readerStart, sql.indexOf('create or replace function public.claim_patcher_revalidation_outbox'));
  assert.match(sql, /patcher_index_eligibility_snapshot_state/);
  assert.match(sql, /create or replace function public\.bootstrap_patcher_index_eligibility_snapshot/);
  assert.match(sql, /refresh_patcher_index_eligibility_snapshot\(null\)/);
  assert.match(reader, /snapshot is not initialized/);
  assert.match(sql, /last_full_refresh_at/);
});

test('snapshot 생성은 목록 canonical 규칙과 동일하게 alias를 병합하고 locale별 canonical 중복을 막는다', async () => {
  const sql = await read('supabase/migrations/202610050001_patcher_sitemap_snapshot_and_revalidation_outbox.sql');
  assert.match(sql, /elden-ring-shadow-of-the-erdtree-trainer-1768067282/);
  assert.match(sql, /source\.slug ~ '-trainer\(-\[0-9\]\{6,\}\)\?\$'/);
  assert.match(sql, /source\.normalized_title = base\.normalized_title/);
  assert.match(sql, /select distinct on \(canonical\.id\)/);
  assert.match(sql, /patcher_index_eligibility_snapshot_canonical_idx/);
});

test('outbox consumer는 claim lease를 완료하거나 지수 backoff로 defer하고 sitemap을 별도 처리한다', async () => {
  const [consumer, route, workflow, sql] = await Promise.all([
    read('lib/server/admin/patcher-revalidation-outbox.ts'),
    read('app/api/internal/drain-patcher-revalidation-outbox/route.ts'),
    read('.github/workflows/scraper.yml'),
    read('supabase/migrations/202610050001_patcher_sitemap_snapshot_and_revalidation_outbox.sql'),
  ]);
  assert.match(consumer, /bootstrap_patcher_index_eligibility_snapshot/);
  assert.match(consumer, /claim_patcher_revalidation_outbox/);
  assert.match(consumer, /finish_patcher_revalidation_outbox/);
  assert.match(consumer, /getPatcherOutboxRetryDelaySeconds/);
  assert.match(consumer, /revalidatePath\('\/sitemap\.xml'\)/);
  assert.match(consumer, /PATCHER_REVALIDATE_FAILED/);
  assert.match(route, /timingSafeEqual/);
  assert.match(route, /outbox_drain_unavailable/);
  assert.match(workflow, /drain-patcher-revalidation-outbox/);
  assert.match(workflow, /PATCHER_REVALIDATE_OUTBOX_URL/);
  assert.match(sql, /canonical_slug text, attempt_count integer/);
  assert.match(sql, /lease_token=p_lease_token/);
});
