import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const compile = async (path) => ts.transpileModule(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const helper = {};
vm.runInNewContext(await compile('lib/trainer-binary-patch.ts'), { exports: helper, TextEncoder, Uint8Array, DataView, ArrayBuffer });
const componentCode = await compile('components/DropZone.tsx');
const deferred = () => { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

// 브라우저·ZIP·해시 경계만 가짜로 격리하고 실제 TSX 콜백과 패치 헬퍼를 실행합니다.
function fixture({ mappings, trainers, selected, zipClose, digest, fileBuffer } = {}) {
  const hooks = []; let cursor = 0; let initialized = false; const cleanups = [];
  const calls = { urls: [], revoked: [], zip: 0, events: [], detected: [], digests: 0 };
  const react = {
    useState(initial) { const index = cursor++; if (!(index in hooks)) hooks[index] = initial; return [hooks[index], value => { hooks[index] = typeof value === 'function' ? value(hooks[index]) : value; }]; },
    useRef(initial) { const index = cursor++; if (!(index in hooks)) hooks[index] = { current: initial }; return hooks[index]; },
    useEffect(effect) { if (!initialized) cleanups.push(effect()); },
  };
  const dict = new Proxy({}, { get: (_target, name) => String(name) });
  const jsx = (type, props) => ({ type, props });
  const exports = {};
  const dependencies = {
    react,
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    'lucide-react': {},
    '@/lib/i18n/index': { getCommonDict: () => dict, getPatcherDict: () => dict, getLocaleSuffix: () => '_ko' },
    '@/lib/trainer-binary-patch': helper,
    '@/lib/supabase': { supabase: null },
    '@/lib/analytics': { trackAnalyticsEvent: (...args) => calls.events.push(args) },
    '@zip.js/zip.js': {
      BlobWriter: class {}, BlobReader: class {},
      ZipWriter: class { constructor() { calls.zip++; } async add() {} async close() { return zipClose ? zipClose() : new Blob(['zip']); } },
    },
  };
  vm.runInNewContext(componentCode, {
    exports, require(name) { if (!(name in dependencies)) throw new Error(`예상하지 않은 의존성: ${name}`); return dependencies[name]; },
    TextEncoder, Uint8Array, ArrayBuffer, DataView, Blob,
    crypto: { subtle: { digest: async () => { calls.digests++; return digest ? digest() : new Uint8Array(32).buffer; } } },
    URL: { createObjectURL() { const url = `blob:test-${calls.urls.length}`; calls.urls.push(url); return url; }, revokeObjectURL(url) { calls.revoked.push(url); } },
    process: { env: { NODE_ENV: 'test' } }, console: { log() {}, warn() {}, error() {} },
  });
  const trainer = selected ?? { id: 1, version_str: 'synthetic', original_file_size: 1024, original_file_hash: '00'.repeat(32) };
  const mapping = { offset_dec: 700, encoding: 'ASCII', original_text: 'abc', translated_text: 'hi', max_char_len: 8 };
  const props = { locale: 'ko', gameId: 1, trainer, allTrainers: trainers ?? [trainer], mappingsMap: mappings ?? { 1: [mapping] }, onTrainerDetected: id => calls.detected.push(id) };
  function render() { cursor = 0; const tree = exports.default(props); initialized = true; return tree; }
  function nodes(tree = render()) { return tree ? [tree, ...[tree.props?.children].flat(Infinity).filter(child => child && typeof child === 'object').flatMap(child => nodes(child))] : []; }
  const input = () => nodes().find(node => node.type === 'input' && node.props.type === 'file');
  const file = (options = {}) => ({ name: 'synthetic.exe', size: 1024, arrayBuffer: async () => fileBuffer ? fileBuffer() : pe(), ...options });
  return {
    calls, file,
    submit: (value = file()) => input().props.onChange({ target: { files: [value] } }),
    reset() { const button = nodes().find(node => node.type === 'button' && ['patchAnotherFileBtn', 'retryBtnText'].includes(node.props.children)); assert.ok(button); button.props.onClick(); },
    resetHandler() { const button = nodes().find(node => node.type === 'button' && ['patchAnotherFileBtn', 'retryBtnText'].includes(node.props.children)); assert.ok(button); return button.props.onClick; },
    unmount() { cleanups.forEach(cleanup => cleanup?.()); },
    href() { return nodes().find(node => node.type === 'a')?.props.href; },
    statusText() { return nodes().flatMap(node => [node.props?.children].flat(Infinity)).filter(value => typeof value === 'string'); },
  };
}
function pe() {
  const buffer = new ArrayBuffer(1024); const v = new DataView(buffer);
  v.setUint16(0, 0x5a4d, true); v.setUint32(60, 64, true); v.setUint32(64, 0x4550, true);
  v.setUint16(70, 1, true); v.setUint16(84, 224, true); v.setUint16(88, 0x10b, true); v.setUint32(148, 512, true);
  new Uint8Array(buffer).set(new TextEncoder().encode('.text'), 312);
  v.setUint32(328, 128, true); v.setUint32(332, 512, true); v.setUint32(348, 0x20000000, true);
  return buffer;
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('같은 크기 다른 버전은 정확한 해시의 매핑을 선택하고 ZIP 완료 후만 성공한다', async () => {
  const close = deferred();
  const selected = { id: 1, original_file_size: 1024, original_file_hash: 'ff'.repeat(32), version_str: 'new' };
  const old = { ...selected, id: 2, original_file_hash: '00'.repeat(32), version_str: 'old' };
  const f = fixture({ selected, trainers: [selected, old], mappings: { 1: [], 2: [{ offset_dec: 700, encoding: 'UTF-8', original_text: 'abc', translated_text: '가', max_char_len: 8 }] }, zipClose: () => close.promise });
  const pending = f.submit(); await tick();
  assert.equal(f.calls.zip, 1); assert.equal(f.calls.urls.length, 0); assert.equal(f.href(), undefined);
  assert.equal(f.statusText().includes('PATCH SUCCESS'), false);
  close.resolve(new Blob(['zip'])); await pending;
  assert.equal(f.href(), 'blob:test-0'); assert.deepEqual(f.calls.detected, [2]);
  assert.equal(f.statusText().includes('PATCH SUCCESS'), true);
});

test('빈 매핑과 뒤쪽 슬롯 실패는 ZIP·URL을 만들지 않고 원본도 보존한다', async () => {
  for (const mappings of [{ 1: [] }, { 1: [
    { offset_dec: 700, encoding: 'ASCII', original_text: 'a', translated_text: 'b', max_char_len: 8 },
    { offset_dec: 508, encoding: 'ASCII', original_text: 'a', translated_text: 'b', max_char_len: 8 },
  ] }]) {
    const original = pe(); const before = new Uint8Array(original).slice();
    const f = fixture({ mappings, fileBuffer: () => original }); await f.submit();
    assert.equal(f.calls.zip, 0); assert.equal(f.calls.urls.length, 0); assert.equal(f.href(), undefined);
    assert.deepEqual(new Uint8Array(original), before);
  }
});

test('새 시도 실패와 reset은 기존 URL을 폐기하고 늦은 ZIP은 확정하지 못한다', async () => {
  const close = deferred(); let count = 0;
  const f = fixture({ zipClose: () => ++count === 1 ? Promise.resolve(new Blob(['zip'])) : close.promise });
  await f.submit(); assert.equal(f.href(), 'blob:test-0');
  await f.submit(f.file({ name: 'invalid.txt' }));
  assert.deepEqual(f.calls.revoked, ['blob:test-0']); assert.equal(f.href(), undefined);
  f.reset();
  const pending = f.submit(); await tick();
  // 진행 중 요청은 중복 해시/ZIP 작업을 시작하지 않습니다.
  await f.submit(); assert.equal(f.calls.digests, 2); assert.equal(f.calls.zip, 2);
  f.unmount(); close.resolve(new Blob(['late'])); await pending;
  assert.equal(f.calls.urls.length, 1);
});

test('reset 이후 늦은 해시와 unmount 이후 URL 생성을 차단한다', async () => {
  const hash = deferred(); const f = fixture({ digest: () => hash.promise });
  const pending = f.submit(); await tick(); f.unmount();
  hash.resolve(new Uint8Array(32).buffer); await pending;
  assert.equal(f.calls.zip, 0); assert.equal(f.calls.urls.length, 0); assert.deepEqual(f.calls.detected, []);
  const complete = fixture(); await complete.submit(); complete.reset();
  assert.deepEqual(complete.calls.revoked, ['blob:test-0']); assert.equal(complete.href(), undefined);
});

test('reset 이후 새 시도가 실패해도 이전 ZIP의 늦은 완료가 URL을 되살리지 않는다', async () => {
  const close = deferred(); let count = 0;
  const f = fixture({ zipClose: () => ++count === 1 ? Promise.resolve(new Blob(['zip'])) : close.promise });
  await f.submit(); const reset = f.resetHandler(); reset();
  const pending = f.submit(); await tick(); reset();
  await f.submit(f.file({ name: 'invalid.txt' }));
  close.resolve(new Blob(['late'])); await pending;
  assert.equal(f.calls.urls.length, 1); assert.equal(f.href(), undefined);
  assert.deepEqual(f.calls.revoked, ['blob:test-0']);
  assert.equal(f.statusText().includes('PATCH SUCCESS'), false);
});

test('해시 불일치·ZIP 실패·늦은 파일 읽기는 결과물을 남기지 않는다', async () => {
  const wrong = fixture({ digest: () => new Uint8Array(32).fill(1).buffer }); await wrong.submit();
  assert.equal(wrong.calls.zip, 0); assert.equal(wrong.calls.urls.length, 0);
  const broken = fixture({ zipClose: () => Promise.reject(new Error('합성 ZIP 실패')) }); await broken.submit();
  assert.equal(broken.calls.urls.length, 0); assert.equal(broken.href(), undefined);
  const read = deferred(); const stale = fixture({ fileBuffer: () => read.promise });
  const pending = stale.submit(); stale.unmount(); read.resolve(pe()); await pending;
  assert.equal(stale.calls.digests, 0); assert.equal(stale.calls.zip, 0); assert.equal(stale.calls.urls.length, 0);
});
