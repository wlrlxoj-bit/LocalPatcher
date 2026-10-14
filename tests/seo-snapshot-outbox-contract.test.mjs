import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), 'utf8');
const migrationPath = 'supabase/migrations/202610050001_patcher_sitemap_snapshot_and_revalidation_outbox.sql';

test('sitemap은 전체 번역 테이블이 아니라 검증 snapshot과 데이터 시각을 사용한다', async () => {
  const [sitemap, eligibility] = await Promise.all([
    read('app/sitemap.ts'),
    read('lib/content-eligibility.ts'),
  ]);
  assert.match(sitemap, /getPatcherSitemapSnapshotEntries\(locales\)/);
  assert.match(sitemap, /lastModified:\s*entry\.contentUpdatedAt/);
  assert.doesNotMatch(sitemap, /getEligiblePatcherSlugsByLocale/);
  assert.match(eligibility, /list_patcher_indexable_sitemap_entries/);
  const snapshotStart = eligibility.indexOf('export async function getPatcherSitemapSnapshotEntries');
  const snapshot = eligibility.slice(snapshotStart);
  assert.ok(snapshotStart >= 0);
  assert.match(snapshot, /if \(error\) throw error;/);
  assert.match(snapshot, /if \(!Array\.isArray\(data\)[\s\S]*?throw new Error\('사이트맵 색인 자격 snapshot 페이지 정보가 올바르지 않습니다\.'/);
  assert.match(snapshot, /if \(data\.length !== expectedPageLength\)[\s\S]*?throw new Error\('사이트맵 색인 자격 snapshot 페이지가 완전하지 않습니다\.'/);
  assert.match(snapshot, /100 \* PAGE_SIZE|PAGE_SIZE \* MAX_PAGES/);
  assert.doesNotMatch(snapshot, /빈 목록으로 처리합니다/);
});

test('snapshot refresh는 수동/승인 mapping 본문을 수정하지 않고 서비스 역할만 실행한다', async () => {
  const sql = await read(migrationPath);
  const refreshStart = sql.indexOf('create or replace function public.refresh_patcher_index_eligibility_snapshot');
  const enqueueStart = sql.indexOf('create or replace function public.refresh_patcher_index_and_enqueue');
  const refresh = sql.slice(refreshStart, enqueueStart);
  assert.ok(refreshStart >= 0 && enqueueStart > refreshStart);
  assert.match(refresh, /auth\.role\(\) <> 'service_role'/);
  assert.match(refresh, /elden-ring-shadow-of-the-erdtree-trainer-1768067282/);
  assert.match(refresh, /option_count > 0 and mapping_count > 0 and invalid_mapping_count = 0 and approved_option_count >= option_count/);
  assert.match(refresh, /on conflict \(game_id, language_code\) do update/i);
  assert.doesNotMatch(refresh, /update public\.translation_mappings/i);
  assert.doesNotMatch(refresh, /delete from public\.translation_mappings/i);
});

test('재검증 outbox는 dedupe, lease, 재시도와 sitemap debounce 계약을 가진다', async () => {
  const [sql, revalidator] = await Promise.all([
    read(migrationPath),
    read('lib/server/admin/revalidate-patcher.ts'),
  ]);
  assert.match(sql, /dedupe_key text not null unique/);
  assert.match(sql, /'sitemap:indexability'/);
  assert.match(sql, /for update skip locked/i);
  assert.match(sql, /lease_expires_at=clock_timestamp\(\)\+interval '15 minutes'/);
  assert.match(sql, /finish_patcher_revalidation_outbox/);
  assert.match(sql, /lease_expires_at>clock_timestamp\(\)/);
  assert.match(sql, /grant execute on function public\.claim_patcher_revalidation_outbox\(integer\) to service_role/i);
  assert.match(sql, /grant execute on function public\.list_patcher_indexable_sitemap_entries\(text\[\]\) to anon, authenticated, service_role/i);
  assert.match(revalidator, /refresh_patcher_index_and_enqueue/);
  assert.match(revalidator, /get_patcher_revalidation_target/);
  assert.doesNotMatch(revalidator, /complete_patcher_revalidation_for_trainer/);
  assert.match(revalidator, /snapshot_enqueue_unavailable/);
  assert.doesNotMatch(revalidator, /sitemap\.xml/);
});
