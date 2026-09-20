import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), 'utf8');

test('관리자 CRUD는 브라우저 Supabase 클라이언트 대신 인증된 서버 API만 사용한다', async () => {
  const [dictionary, games, translations] = await Promise.all([
    read('app/[locale]/admin/dictionary/page.tsx'),
    read('app/[locale]/admin/games/page.tsx'),
    read('app/[locale]/admin/translations/page.tsx'),
  ]);
  for (const source of [dictionary, games, translations]) {
    assert.doesNotMatch(source, /from ['"]@\/lib\/supabase['"]/);
    assert.match(source, /fetch\('\/api\/admin\//);
  }
});

test('관리자 API는 세션 검사와 서버 전용 서비스 역할 클라이언트를 함께 요구한다', async () => {
  const [access, dictionary, game, mapping] = await Promise.all([
    read('lib/server/admin/access.ts'),
    read('app/api/admin/dictionary/route.ts'),
    read('app/api/admin/games/[id]/route.ts'),
    read('app/api/admin/translations/mappings/[id]/route.ts'),
  ]);
  assert.match(access, /import 'server-only'/);
  assert.match(access, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(access, /requireTranslationAdmin/);
  for (const source of [dictionary, game, mapping]) {
    assert.match(source, /requireAdmin\(request\)/);
    assert.match(source, /getAdminClient\(\)/);
  }
});

test('수동 번역 저장도 DB 슬롯의 인코딩과 바이트 한도를 확인한 후에만 수정한다', async () => {
  const mapping = await read('app/api/admin/translations/mappings/[id]/route.ts');
  assert.match(mapping, /select\('id,trainer_id,encoding,max_char_len,translated_text'\)/);
  assert.match(mapping, /SUPPORTED_ENCODINGS/);
  assert.match(mapping, /Buffer\.byteLength\(translatedText, bufferEncoding\)/);
  assert.match(mapping, /mapping_slot_constraint_failed/);
  assert.match(mapping, /supportedEncoding === 'UTF-16LE' \? slotLength \* 2 : slotLength/);
});

test('수동 수정된 mapping은 검증 전 공개·색인되지 않도록 다시 승인 대기 상태가 된다', async () => {
  const mapping = await read('app/api/admin/translations/mappings/[id]/route.ts');
  assert.match(mapping, /save_manual_translation_mapping/);
  assert.match(mapping, /p_expected_translated_text: existing\.translated_text/);
  assert.match(mapping, /requiresApproval: true/);
  assert.match(mapping, /review_status: 'pending'/);
});

test('사전 공개 읽기는 하나만 유지하고 실제 감사 baseline 정책으로 되돌리는 마이그레이션을 제공한다', async () => {
  const [migration, rollback] = await Promise.all([
    read('supabase/migrations/202609200001_admin_dictionary_write_hardening.sql'),
    read('supabase/rollback/202609200001_admin_dictionary_write_hardening.rollback.sql'),
  ]);
  assert.match(migration, /drop policy if exists "Allow public insert"/);
  assert.match(migration, /drop policy if exists "Allow public update"/);
  assert.match(migration, /create policy "Allow public read"[\s\S]*for select[\s\S]*to public[\s\S]*using \(true\)/);
  assert.match(migration, /revoke insert, update, delete on table public\.common_dictionary from public, anon, authenticated/i);
  assert.match(migration, /grant select, insert, update, delete on table public\.common_dictionary to service_role/i);
  assert.match(rollback, /create policy "Allow public insert"[\s\S]*for insert[\s\S]*with check \(true\)/);
  assert.match(rollback, /create policy "Allow public read access on common_dictionary"/);
  assert.match(rollback, /create policy "Allow public update"[\s\S]*for update[\s\S]*using \(true\)[\s\S]*with check \(true\)/);
  for (const source of [migration, rollback]) {
    assert.match(source, /enable row level security/);
    assert.match(source, /no force row level security/);
  }
});
