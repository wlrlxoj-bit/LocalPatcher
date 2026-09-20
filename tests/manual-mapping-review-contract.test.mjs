import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), 'utf8');

test('수동 mapping 저장·승인은 서버 세션과 단일 mapping id만 신뢰한다', async () => {
  const [save, approve] = await Promise.all([
    read('app/api/admin/translations/mappings/[id]/route.ts'),
    read('app/api/admin/translations/mappings/[id]/approve/route.ts'),
  ]);
  for (const source of [save, approve]) {
    assert.match(source, /requireAdmin\(request\)/);
    assert.match(source, /getAdminClient\(\)/);
    assert.match(source, /Number\.isSafeInteger\(id\) \|\| id <= 0/);
  }
  assert.match(save, /save_manual_translation_mapping/);
  assert.match(save, /translatedText\.trim\(\)\.length === 0/);
  assert.match(save, /translatedText\.includes\('\\0'\)/);
  assert.match(save, /revalidatePatcherForTrainer/);
  assert.match(save, /mapping_changed_refresh_required/);
  assert.match(approve, /approve_manual_translation_mapping/);
  assert.match(approve, /revalidatePatcherForTrainer/);
  assert.match(approve, /already_approved/);
  assert.doesNotMatch(approve, /request\.json\(/);
});

test('수동 상태 변경은 패처와 sitemap ISR을 즉시 무효화한다', async () => {
  const source = await read('lib/server/admin/revalidate-patcher.ts');
  assert.match(source, /revalidatePath\(`\/\$\{locale\}\/patcher\/\$\{game\.slug\}`\)/);
  assert.match(source, /revalidatePath\('\/sitemap\.xml'\)/);
  assert.match(source, /revalidatePath\('\/\[locale\]\/patcher\/\[game_slug\]', 'page'\)/);
});

test('DB 수동 저장 RPC도 공백·NUL 본문을 자체 거절하고, API 우회 저장을 허용하지 않는다', async () => {
  const migration = await read('supabase/migrations/202609200002_manual_mapping_review_lock.sql');
  const saveStart = migration.indexOf('create or replace function public.save_manual_translation_mapping');
  const saveEnd = migration.indexOf('create or replace function public.approve_manual_translation_mapping');
  const save = migration.slice(saveStart, saveEnd);
  assert.ok(saveStart >= 0 && saveEnd > saveStart, '수동 저장 RPC 원문을 찾을 수 있어야 합니다.');
  assert.match(save, /p_translated_text is null/);
  assert.match(save, /nullif\(btrim\(p_translated_text\), ''\) is null/);
  assert.match(save, /position\(decode\('00', 'hex'\) in convert_to\(p_translated_text, 'UTF8'\)\) > 0/);
  assert.match(save, /return jsonb_build_object\('outcome', 'invalid_input'\)/);
});

test('수동 저장은 pending을 유지하지만 자동 retry와 초안 덮어쓰기를 차단한다', async () => {
  const [migration, scraper] = await Promise.all([
    read('supabase/migrations/202609200002_manual_mapping_review_lock.sql'),
    read('scripts/scraper.py'),
  ]);
  assert.match(migration, /translation_provider.*'manual'/s);
  assert.match(migration, /translation_status = 'pending'/);
  assert.match(migration, /delete from public\.translation_retry_queue/);
  assert.match(migration, /translation_provider is distinct from 'manual'/);
  assert.match(migration, /mapping\.translation_provider is distinct from 'manual'/);
  assert.match(migration, /approve_manual_translation_mapping/);
  assert.match(migration, /translation_status = 'approved'/);
  assert.match(migration, /target\.translation_provider = 'manual' and target\.translation_status = 'pending'/);
  assert.match(migration, /manual_review_preserved/);
  assert.match(migration, /if auth\.role\(\) <> 'service_role' then return; end if/);
  assert.match(scraper, /manual_review_locales/);
  assert.match(scraper, /effective_force = force and not manual_review_locales/);
});

test('수동 검수와 충돌하는 SECURITY DEFINER workflow RPC는 service_role만 실행한다', async () => {
  const [migration, rollback] = await Promise.all([
    read('supabase/migrations/202609200002_manual_mapping_review_lock.sql'),
    read('supabase/rollback/202609200002_manual_mapping_review_lock.rollback.sql'),
  ]);
  for (const signature of [
    'upsert_translation_drafts(jsonb)',
    'upsert_translation_draft(jsonb)',
    'finalize_translation_draft(bigint, text, integer, text, text)',
    'list_pending_translation_sources(bigint, integer, boolean)',
  ]) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${signature.replace(/[()]/g, '\\$&').replace(/,/g, ',')} from public, anon, authenticated`, 'i'));
    assert.match(migration, new RegExp(`grant execute on function public\\.${signature.replace(/[()]/g, '\\$&').replace(/,/g, ',')} to service_role`, 'i'));
  }
  assert.match(rollback, /grant execute on function public\.finalize_translation_draft\(bigint, text, integer, text, text\) to service_role/i);
  assert.match(rollback, /grant execute on function public\.list_pending_translation_sources\(bigint, integer, boolean\) to service_role/i);
  assert.doesNotMatch(rollback, /finalize_translation_draft\(bigint, text, integer, text, text\) to anon, authenticated, service_role/i);
  assert.doesNotMatch(rollback, /list_pending_translation_sources\(bigint, integer, boolean\) to anon, authenticated, service_role/i);
  assert.match(rollback, /if auth\.role\(\) <> 'service_role' then return; end if/);
  assert.match(rollback, /return jsonb_build_object\('outcome', 'db_error', 'reason', 'forbidden'\)/);
});

test('legacy 초안 RPC도 고정 검색 경로에서 manual pending을 보존하며 batch 경로만 사용한다', async () => {
  const [migration, rollback] = await Promise.all([
    read('supabase/migrations/202609200002_manual_mapping_review_lock.sql'),
    read('supabase/rollback/202609200002_manual_mapping_review_lock.rollback.sql'),
  ]);

  for (const source of [migration, rollback]) {
    const batchStart = source.indexOf('create or replace function public.upsert_translation_drafts');
    const wrapperStart = source.indexOf('create or replace function public.upsert_translation_draft', batchStart + 1);
    const batch = source.slice(batchStart, wrapperStart);
    const wrapperEnd = source.indexOf('$$;', wrapperStart) + 3;
    const wrapper = source.slice(wrapperStart, wrapperEnd);
    assert.ok(batchStart >= 0 && wrapperStart > batchStart && wrapperEnd > wrapperStart, 'batch와 legacy wrapper 정의를 찾을 수 있어야 합니다.');
    assert.match(batch, /security definer set search_path = ''/i);
    assert.match(batch, /pg_catalog\.pg_advisory_xact_lock\(pg_catalog\.hashtextextended/);
    assert.match(batch, /from pg_catalog\.jsonb_array_elements/);
    assert.match(batch, /public\.translation_mappings\.translation_provider is distinct from 'manual'/);
    assert.match(wrapper, /security definer set search_path = ''/i);
    assert.match(wrapper, /public\.upsert_translation_drafts\(pg_catalog\.jsonb_build_array\(p_mapping\)\)/);
    assert.doesNotMatch(wrapper, /insert into public\.translation_mappings/i);
  }
});

test('이전 작업 승인도 수동 pending 슬롯을 잠근 뒤 명시적 충돌로 중단한다', async () => {
  const migration = await read('supabase/migrations/202609200002_manual_mapping_review_lock.sql');
  const approveStart = migration.lastIndexOf('create or replace function public.approve_translation_job');
  const grantsStart = migration.indexOf('revoke all on function public.save_manual_translation_mapping');
  const approve = migration.slice(approveStart, grantsStart);
  assert.ok(approveStart >= 0 && grantsStart > approveStart, '보호된 작업 승인 RPC 원문을 찾을 수 있어야 합니다.');
  assert.match(approve, /select \* into target_row[\s\S]*?for update;/);
  assert.match(approve, /target_row\.translation_provider = 'manual' and target_row\.translation_status = 'pending'/);
  assert.match(approve, /raise exception 'manual review conflict';/);
  assert.ok(
    approve.indexOf("raise exception 'manual review conflict';") < approve.indexOf('on conflict (trainer_id, language_code, offset_dec) do update set'),
    '수동 검수 충돌은 ON CONFLICT UPDATE 전에 발생해야 합니다.',
  );
});

test('관리자 편집기는 검수 대기와 승인 완료를 명확히 표시하고 승인 경로를 호출한다', async () => {
  const page = await read('app/[locale]/admin/translations/page.tsx');
  assert.match(page, /검수 대기 중/);
  assert.match(page, /승인 완료/);
  assert.match(page, /mappings\/\$\{id\}\/approve/);
  assert.match(page, /저장 후 검수 대기/);
});

test('rollback은 manual 기록을 발견하면 상태 제약을 되돌리지 않는다', async () => {
  const rollback = await read('supabase/rollback/202609200002_manual_mapping_review_lock.rollback.sql');
  assert.match(rollback, /translation_provider = 'manual'/);
  assert.match(rollback, /before rollback/i);
  assert.match(rollback, /drop function if exists public\.save_manual_translation_mapping/);
});

test('수동 저장 RPC는 DB에서도 슬롯 인코딩과 정확한 바이트 용량을 검증한다', async () => {
  const migration = await read('supabase/migrations/202609200002_manual_mapping_review_lock.sql');
  const start = migration.indexOf('create or replace function public.save_manual_translation_mapping');
  const end = migration.indexOf('create or replace function public.approve_manual_translation_mapping');
  const save = migration.slice(start, end);
  assert.match(save, /target\.encoding not in \('ASCII', 'UTF-8', 'UTF-16LE'\)/);
  assert.match(save, /pg_catalog\.convert_to\(p_translated_text, 'UTF8'\)/);
  assert.match(save, /pg_catalog\.convert_to\(p_translated_text, 'UTF16'\)\) - 2/);
  assert.match(
    save,
    /encoded_length\s*>\s*\(\s*target\.max_char_len::bigint\s*\*\s*\(case when target\.encoding = 'UTF-16LE' then 2 else 1 end\)\s*\) then/,
  );
  assert.match(save, /encoded_length <> pg_catalog\.char_length\(p_translated_text\)/);
});

test('작업 승인 RPC와 그 rollback 복구본은 고정 검색 경로·명시 권한으로 동작한다', async () => {
  const [migration, rollback] = await Promise.all([
    read('supabase/migrations/202609200002_manual_mapping_review_lock.sql'),
    read('supabase/rollback/202609200002_manual_mapping_review_lock.rollback.sql'),
  ]);
  const forwardStart = migration.lastIndexOf('create or replace function public.approve_translation_job');
  const forwardEnd = migration.indexOf('revoke all on function public.save_manual_translation_mapping', forwardStart);
  const rollbackStart = rollback.indexOf('create or replace function public.approve_translation_job');
  const rollbackEnd = rollback.indexOf('-- rollback 뒤에도 SECURITY DEFINER RPC는 service_role에서만 호출한다.', rollbackStart);
  assert.ok(forwardStart >= 0 && forwardEnd > forwardStart, 'forward 작업 승인 RPC 원문을 찾을 수 있어야 합니다.');
  assert.ok(rollbackStart >= 0 && rollbackEnd > rollbackStart, 'rollback 작업 승인 RPC 복구본을 찾을 수 있어야 합니다.');

  for (const source of [migration.slice(forwardStart, forwardEnd), rollback.slice(rollbackStart, rollbackEnd)]) {
    assert.match(source, /security definer\s*set search_path = ''/i);
    assert.match(source, /from public\.translation_jobs/);
    assert.match(source, /public\.translation_mappings/);
    assert.match(source, /public\.translation_memory/);
    assert.match(source, /pg_catalog\.pg_advisory_xact_lock\(pg_catalog\.hashtextextended/);
    assert.match(source, /pg_catalog\.encode\(public\.digest\(/);
  }
  for (const source of [migration, rollback]) {
    assert.match(source, /revoke all on function public\.approve_translation_job\(uuid, jsonb\) from public, anon, authenticated/i);
    assert.match(source, /grant execute on function public\.approve_translation_job\(uuid, jsonb\) to service_role/i);
    assert.doesNotMatch(source, /approve_translation_job\(uuid, jsonb\) to anon, authenticated, service_role/i);
  }
  assert.doesNotMatch(rollback.slice(rollbackStart, rollbackEnd), /manual review conflict/i);
});
