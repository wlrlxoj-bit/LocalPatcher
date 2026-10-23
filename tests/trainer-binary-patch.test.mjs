import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = await readFile(new URL('../lib/trainer-binary-patch.ts', import.meta.url), 'utf8');
const exports = {};
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
  { exports, TextEncoder, Uint8Array, DataView, ArrayBuffer });
const { patchTrainerBinary: patch } = exports;

// 전부 합성된 PE이며 사용자 파일이나 매핑을 읽지 않습니다.
function pe(plus = false) {
  const buffer = new ArrayBuffer(1024);
  const v = new DataView(buffer);
  v.setUint16(0, 0x5a4d, true); v.setUint32(60, 64, true); v.setUint32(64, 0x4550, true);
  v.setUint16(70, 2, true); v.setUint16(84, plus ? 240 : 224, true);
  v.setUint16(88, plus ? 0x20b : 0x10b, true); v.setUint32(148, 512, true);
  const table = 88 + (plus ? 240 : 224);
  new Uint8Array(buffer).set(new TextEncoder().encode('.text'), table);
  v.setUint32(table + 16, 128, true); v.setUint32(table + 20, 512, true); v.setUint32(table + 36, 0x20000000, true);
  v.setUint32(table + 56, 256, true); v.setUint32(table + 60, 640, true);
  return buffer;
}
const slot = (overrides = {}) => ({ offset_dec: 700, encoding: 'ASCII', original_text: 'abc', translated_text: 'hi', max_char_len: 8, ...overrides });

test('PE32/PE32+의 ASCII·UTF-8·UTF-16LE를 별도 복제본에만 적용한다', () => {
  for (const plus of [false, true]) for (const encoding of ['ASCII', 'UTF-8', 'UTF-16LE']) {
    const input = pe(plus); const before = new Uint8Array(input).slice();
    const output = patch(input, [slot({ encoding, translated_text: encoding === 'ASCII' ? 'hi' : '가😀' })]);
    assert.equal(output.byteLength, input.byteLength);
    assert.deepEqual(new Uint8Array(input), before);
    assert.notEqual(output.buffer, input);
    assert.notDeepEqual(output, before);
  }
});

test('슬롯 전체 반개구간·헤더·별명 실행 섹션·중복과 정수 경계를 거절한다', () => {
  const crossing = pe(); new DataView(crossing).setUint32(148, 480, true);
  assert.throws(() => patch(crossing, [slot({ offset_dec: 508 })]));
  for (const mapping of [slot({ offset_dec: 508 }), slot({ offset_dec: 100 }), slot({ offset_dec: 639 }), slot({ offset_dec: -1 }), slot({ offset_dec: 700.5 }), slot({ offset_dec: Number.MAX_SAFE_INTEGER }), slot({ max_char_len: Number.MAX_SAFE_INTEGER }), slot({ max_char_len: 0 }), slot({ max_char_len: 1.5 }), slot({ offset_dec: 1020 }), slot({ encoding: 'unknown' })]) {
    assert.throws(() => patch(pe(), [mapping]));
  }
  const alias = pe(); const v = new DataView(alias); const table = 312;
  new Uint8Array(alias).fill(0, table, table + 8);
  assert.throws(() => patch(alias, [slot({ offset_dec: 520 })]));
  v.setUint32(table + 36, 0, true);
  new Uint8Array(alias).set(new TextEncoder().encode('.text'), table);
  assert.throws(() => patch(alias, [slot({ offset_dec: 520 })]));
  assert.throws(() => patch(pe(), [slot(), slot()]));
  assert.throws(() => patch(pe(), [slot(), slot({ offset_dec: 707 })]));
  assert.doesNotThrow(() => patch(pe(), [slot(), slot({ offset_dec: 708 })]));
});

test('잘린 PE·선택 헤더·섹션 테이블·잘못된 raw 범위를 거절한다', () => {
  for (const limit of [63, 87, 100, 320, 380]) assert.throws(() => patch(pe().slice(0, limit), [slot()]));
  for (const mutate of [v => v.setUint16(84, 2, true), v => v.setUint16(88, 0x999, true), v => v.setUint32(148, 200, true), v => v.setUint32(148, 2000, true), v => v.setUint32(332, 100, true), v => v.setUint32(328, 0xffffffff, true), v => v.setUint32(180, 100, true)]) {
    const input = pe(); mutate(new DataView(input)); assert.throws(() => patch(input, [slot()]));
  }
});

test('용량·인코딩·여러 줄 손실과 빈 매핑은 원본을 바꾸지 않고 실패한다', () => {
  for (const bad of [slot({ translated_text: '123456789' }), slot({ translated_text: '가' }), slot({ encoding: 'UTF-8', translated_text: '가가가' }), slot({ encoding: 'UTF-16LE', max_char_len: 1, translated_text: '😀' }), slot({ encoding: 'UTF-8', translated_text: '\ud800' }), slot({ original_text: 'a\nb', translated_text: 'ab\nc' }), slot({ original_text: 'a\nb', translated_text: 'a\nb\nc' })]) {
    const input = pe(); const before = new Uint8Array(input).slice();
    assert.throws(() => patch(input, [slot({ offset_dec: 680 }), bad]));
    assert.deepEqual(new Uint8Array(input), before);
  }
  assert.throws(() => patch(pe(), []));
  const result = patch(pe(), [slot({ original_text: 'abc\ndef', translated_text: 'a\nb' })]);
  assert.equal(new TextDecoder().decode(result.slice(700, 707)), 'a  \nb  ');
});
