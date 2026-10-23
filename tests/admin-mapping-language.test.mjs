import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const code = ts.transpileModule(await readFile(new URL('../app/api/admin/translations/mappings/route.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

// 실제 목록 라우트를 실행하고 인증과 DB만 합성 경계로 대체합니다.
function fixture({ authorized = true, configured = true, failed = false } = {}) {
  const calls = [];
  const rows = [
    { id: 1, trainer_id: 7, language_code: 'ko', offset_dec: 700, encoding: 'UTF-8', original_text: 'synthetic', translated_text: '합성', max_char_len: 20, is_approved: true, translation_status: 'approved', translation_provider: 'manual' },
    { id: 2, trainer_id: 7, language_code: 'ja', offset_dec: 700, encoding: 'UTF-8', original_text: 'synthetic', translated_text: '合成', max_char_len: 20, is_approved: false, translation_status: 'pending', translation_provider: 'manual' },
  ];
  const client = { from(table) {
    calls.push(['from', table]); let columns = []; let trainerId;
    return {
      select(value) { calls.push(['select', value]); columns = value.split(','); return this; },
      eq(key, value) { calls.push(['eq', key, value]); trainerId = value; return this; },
      async order(key, options) {
        calls.push(['order', key, options]);
        return { error: failed ? { message: '합성 조회 실패' } : null, data: rows.filter(row => row.trainer_id === trainerId).map(row => Object.fromEntries(columns.map(column => [column, row[column]]))) };
      },
    };
  } };
  const exports = {};
  vm.runInNewContext(code, {
    exports, URL,
    require(name) {
      if (name === 'next/server') return { NextResponse: { json: (body, options) => Response.json(body, options) } };
      if (name === '@/lib/server/admin/access') return {
        requireAdmin() { calls.push(['auth']); return authorized; },
        getAdminClient() { calls.push(['client']); return configured ? client : null; },
      };
      throw new Error(`예상하지 않은 의존성: ${name}`);
    },
  });
  return { calls, get: (query = '?trainerId=7') => exports.GET(new Request(`https://synthetic.test/api/admin/translations/mappings${query}`)) };
}

test('미인증 관리 목록은 DB 클라이언트 생성 없이 401로 종료한다', async () => {
  const f = fixture({ authorized: false }); const response = await f.get();
  assert.equal(response.status, 401); assert.deepEqual(await response.json(), { error: 'unauthorized' });
  assert.deepEqual(f.calls, [['auth']]);
});

test('같은 offset의 한국어·일본어 행과 검수 상태를 구분하여 반환한다', async () => {
  const f = fixture(); const response = await f.get(); const body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(body.mappings.map(row => [row.id, row.offset_dec, row.language_code, row.is_approved, row.translation_status]), [
    [1, 700, 'ko', true, 'approved'], [2, 700, 'ja', false, 'pending'],
  ]);
  assert.deepEqual(f.calls.find(call => call[0] === 'eq'), ['eq', 'trainer_id', 7]);
  const order = f.calls.find(call => call[0] === 'order');
  assert.equal(order[1], 'offset_dec'); assert.equal(order[2].ascending, true);
});

test('기존 ID 검증과 설정·DB 실패 응답을 유지한다', async () => {
  for (const value of ['0', '-1', '1.5', '9007199254740992', 'invalid']) {
    const f = fixture(); assert.equal((await f.get(`?trainerId=${value}`)).status, 400);
    assert.equal(f.calls.some(call => call[0] === 'client'), false);
  }
  assert.equal((await fixture({ configured: false }).get()).status, 503);
  const response = await fixture({ failed: true }).get();
  assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: 'mappings_read_failed' });
});
