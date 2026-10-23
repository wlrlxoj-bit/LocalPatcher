import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const games = [1, 2].map(id => ({ id, title_en: `Game ${id}`, title_ko: '' }));
const trainers = [11, 12].map(id => ({ id, version_str: `Trainer ${id}` }));
const mapping = (id, language_code = 'ko') => ({ id, language_code, offset_dec: 100, encoding: 'utf8', original_text: 'Original', translated_text: `Translation ${id}`, max_char_len: 80, is_approved: false, translation_status: 'pending', translation_provider: 'manual' });

// 실제 페이지의 훅과 JSX를 실행하고 네트워크만 보류 가능한 메모리 응답으로 대체한다.
async function fixture() {
  const hooks = [];
  const effects = [];
  const requests = [];
  const errors = [];
  let cursor = 0;
  let tree;
  let updates = 0;
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = initial;
      return [hooks[index], value => { updates++; hooks[index] = typeof value === 'function' ? value(hooks[index]) : value; }];
    },
    useRef(initial) { const index = cursor++; return hooks[index] ??= { current: initial }; },
    useEffect(effect, dependencies) {
      const index = cursor++;
      if (!(index in hooks)) { hooks[index] = dependencies; effects.push(effect); }
    },
  };
  const jsx = (type, props, key) => ({ type, props, key });
  const source = await readFile(new URL('../app/[locale]/admin/translations/page.tsx', import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  vm.runInNewContext(output, {
    exports, console: { error: error => errors.push(error) },
    fetch(url, options) {
      let resolve, reject;
      const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
      requests.push({ url, options, resolve: body => resolve({ ok: true, json: async () => body }), reject });
      return promise;
    },
    require(name) {
      if (name === 'react') return { ...react, default: react };
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' };
      if (name === 'lucide-react') return Object.fromEntries(['Languages', 'Search', 'Save', 'Loader2', 'Gamepad2', 'CheckCircle2'].map(icon => [icon, icon]));
      if (name === '@/components/admin/translation/TranslationJobPanel') return { default: 'TranslationJobPanel' };
      throw new Error(`예상하지 않은 의존성: ${name}`);
    },
  });
  const render = () => { cursor = 0; tree = exports.default(); return tree; };
  const walk = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(walk) : [node, ...walk(node.props?.children)];
  const nodes = (node = tree) => walk(node);
  const text = node => typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(text).join(' ') : node ? text(node.props?.children) : '';
  const button = label => nodes().find(node => node.type === 'button' && text(node).trim() === label);
  const click = label => { const node = button(label); assert.ok(node, `버튼 없음: ${label}`); const promise = node.props.onClick(); render(); return promise; };
  const settle = async (request, body, failure = false) => {
    if (failure) request.reject(new Error('지연 오류'));
    else request.resolve(body);
    await new Promise(resolve => setImmediate(resolve));
    render();
  };
  render();
  const cleanups = effects.map(effect => effect());
  await settle(requests[0], { games });
  return { render, nodes, text: () => text(tree), button, click, settle, requests, errors, updates: () => updates, unmount: () => cleanups.forEach(cleanup => cleanup?.()) };
}

async function selected() {
  const f = await fixture();
  f.click('Game 1');
  await f.settle(f.requests.at(-1), { trainers });
  f.click('Trainer 11');
  await f.settle(f.requests.at(-1), { mappings: [mapping(101), mapping(102, 'ja')] });
  return f;
}

for (const failure of [false, true]) {
  test(`새 조회 완료 후 도착한 게임·트레이너 ${failure ? '오류' : '응답'}는 현재 데이터를 유지한다`, async () => {
    const f = await selected();
    f.click('Game 1');
    const oldGame = f.requests.at(-1);
    f.click('Game 2');
    await f.settle(f.requests.at(-1), { trainers });
    await f.settle(oldGame, { trainers: [{ id: 99, version_str: 'Stale trainer' }] }, failure);
    assert.ok(f.button('Trainer 11'));
    assert.equal(f.button('Stale trainer'), undefined);
    f.click('Trainer 11');
    const oldTrainer = f.requests.at(-1);
    f.click('Trainer 12');
    await f.settle(f.requests.at(-1), { mappings: [mapping(202)] });
    await f.settle(oldTrainer, { mappings: [mapping(999)] }, failure);
    assert.equal(f.nodes().find(node => node.type === 'textarea').props.value, 'Translation 202');
    assert.equal(f.errors.length, 0);
  });

  test(`이전 게임 조회 ${failure ? '실패' : '성공'}는 새 게임의 목록과 로딩을 변경하지 않는다`, async () => {
    const f = await selected();
    f.click('Game 1');
    const old = f.requests.at(-1);
    assert.equal(f.nodes().filter(node => node.type === 'textarea').length, 0);
    f.click('Game 2');
    const current = f.requests.at(-1);
    await f.settle(old, { trainers: [{ id: 99, version_str: 'Stale trainer' }] }, failure);
    assert.equal(f.button('Stale trainer'), undefined);
    assert.ok(f.nodes().some(node => node.type === 'Loader2'));
    assert.equal(f.errors.length, 0);
    await f.settle(current, { trainers: [{ id: 22, version_str: 'Current trainer' }] });
    assert.ok(f.button('Current trainer'));
    assert.equal(f.nodes().some(node => node.type === 'Loader2'), false);
  });

  test(`이전 트레이너 조회 ${failure ? '실패' : '성공'}와 finally는 새 조회를 덮지 않는다`, async () => {
    const f = await selected();
    f.click('Trainer 11');
    const old = f.requests.at(-1);
    f.click('Trainer 12');
    const current = f.requests.at(-1);
    await f.settle(old, { mappings: [mapping(999)] }, failure);
    assert.ok(f.nodes().some(node => node.type === 'Loader2'));
    assert.equal(f.nodes().filter(node => node.type === 'textarea').length, 0);
    assert.equal(f.errors.length, 0);
    await f.settle(current, { mappings: [mapping(202)] });
    assert.equal(f.nodes().find(node => node.type === 'textarea').props.value, 'Translation 202');
    assert.equal(f.nodes().some(node => node.type === 'Loader2'), false);
  });
}

for (const action of ['저장 후 검수 대기', '승인']) {
  test(`${action} RPC가 언어를 생략해도 ko·ja 배지와 대상 행 ID를 보존한다`, async () => {
    const f = await selected();
    for (const id of [101, 102]) {
      const icon = action === '승인' ? 'CheckCircle2' : 'Save';
      const row = f.nodes().find(node => node.type === 'div' && node.key === id);
      const button = f.nodes(row).find(node => node.type === 'button' && f.nodes(node).some(child => child.type === icon));
      button.props.onClick();
      const request = f.requests.at(-1);
      assert.equal(request.url, `/api/admin/translations/mappings/${id}${action === '승인' ? '/approve' : ''}`);
      // 현재 SQL jsonb_build_object의 필드만 사용하며 language_code는 보내지 않는다.
      const result = { id, offset_dec: 100, encoding: 'utf8', original_text: 'Original', translated_text: `수정된 행 ${id}`, max_char_len: 80, is_approved: action === '승인', translation_status: action === '승인' ? 'approved' : 'pending', translation_provider: 'manual' };
      await f.settle(request, { mapping: result });
      assert.match(f.text(), /ko/);
      assert.match(f.text(), /ja/);
      assert.ok(f.nodes().find(node => node.type === 'div' && node.key === id));
      const otherId = id === 101 ? 102 : 101;
      assert.ok(f.nodes().find(node => node.type === 'div' && node.key === otherId));
    }
  });

  for (const failure of [false, true]) {
    test(`이전 ${action} ${failure ? '오류' : '완료'}는 재선택한 동일 행의 편집·메시지·busy를 변경하지 않는다`, async () => {
      const f = await selected();
      f.click(action);
      const old = f.requests.at(-1);
      f.click('Trainer 12');
      await f.settle(f.requests.at(-1), { mappings: [mapping(101)] });
      const textarea = f.nodes().find(node => node.type === 'textarea');
      textarea.props.onChange({ target: { value: '새 선택 편집값' } });
      f.render();
      f.click(action);
      const current = f.requests.at(-1);
      await f.settle(old, { mapping: { ...mapping(101), translated_text: '오래된 저장값' } }, failure);
      assert.equal(f.nodes().find(node => node.type === 'textarea').props.value, '새 선택 편집값');
      assert.equal(f.nodes().filter(node => node.props?.role === 'status').length, 0);
      assert.ok(f.nodes().filter(node => node.type === 'button' && node.props.disabled).length > 0);
      assert.equal(f.errors.length, 0);
      await f.settle(current, { mapping: { ...mapping(101), translated_text: '현재 저장값' } });
      assert.equal(f.nodes().some(node => node.type === 'button' && node.props.disabled), false);
    });
  }
}

test('같은 offset의 언어를 구분하며 각 행의 저장과 승인은 mapping ID를 전송한다', async () => {
  const f = await selected();
  assert.match(f.text(), /ko/);
  assert.match(f.text(), /ja/);
  const saves = f.nodes().filter(node => node.type === 'button' && f.nodes(node).some(child => child.type === 'Save'));
  const approvals = f.nodes().filter(node => node.type === 'button' && f.nodes(node).some(child => child.type === 'CheckCircle2'));
  saves[1].props.onClick();
  assert.equal(f.requests.at(-1).url, '/api/admin/translations/mappings/102');
  assert.equal(JSON.parse(f.requests.at(-1).options.body).translatedText, 'Translation 102');
  approvals[0].props.onClick();
  assert.equal(f.requests.at(-1).url, '/api/admin/translations/mappings/101/approve');
});

test('트레이너 변경은 작업 패널 key를 변경하고 게임 변경은 이전 매핑 조회를 무효화한다', async () => {
  const f = await selected();
  assert.equal(f.nodes().find(node => node.type === 'TranslationJobPanel').key, 11);
  f.click('Trainer 12');
  const old = f.requests.at(-1);
  assert.equal(f.nodes().find(node => node.type === 'TranslationJobPanel').key, 12);
  f.click('Game 2');
  await f.settle(old, { mappings: [mapping(999)] });
  assert.equal(f.nodes().filter(node => node.type === 'textarea').length, 0);
  assert.equal(f.nodes().filter(node => node.type === 'TranslationJobPanel').length, 0);
});

test('unmount 후 조회와 쓰기 후속 처리는 상태와 오류를 갱신하지 않는다', async () => {
  const f = await selected();
  f.click('저장 후 검수 대기');
  const old = f.requests.at(-1);
  f.click('Trainer 12');
  const query = f.requests.at(-1);
  f.unmount();
  const updates = f.updates();
  await f.settle(old, {}, true);
  await f.settle(query, { mappings: [mapping(999)] });
  assert.equal(f.updates(), updates);
  assert.equal(f.errors.length, 0);
  assert.equal(f.nodes().filter(node => node.props?.role === 'status').length, 0);
});

test('동일 선택에서 겹친 행 쓰기는 최신 요청만 상태를 반영한다', async () => {
  const f = await selected();
  const save = f.button('저장 후 검수 대기');
  save.props.onClick();
  const old = f.requests.at(-1);
  save.props.onClick();
  const current = f.requests.at(-1);
  await f.settle(current, { mapping: { ...mapping(101), translated_text: '최신 결과' } });
  const updates = f.updates();
  await f.settle(old, { mapping: { ...mapping(101), translated_text: '오래된 결과' } });
  assert.equal(f.nodes().find(node => node.type === 'textarea').props.value, '최신 결과');
  assert.equal(f.updates(), updates);
});

for (const action of ['저장 후 검수 대기', '승인']) {
  for (const failure of [false, true]) {
    test(`${action} 대기 중 입력을 잠그고 ${failure ? '실패' : '성공'} 후 편집값을 보존하며 다시 활성화한다`, async () => {
      const f = await selected();
      f.nodes().find(node => node.type === 'textarea').props.onChange({ target: { value: '보존할 편집값' } });
      f.render();
      f.click(action);
      const request = f.requests.at(-1);
      const locked = f.nodes().find(node => node.type === 'textarea');
      assert.equal(locked.props.disabled, true);
      // DOM의 disabled 외에도 현재 렌더의 콜백은 대기 중 입력을 무시해야 한다.
      locked.props.onChange({ target: { value: '대기 중 입력' } });
      f.render();
      assert.equal(f.nodes().find(node => node.type === 'textarea').props.value, '보존할 편집값');
      await f.settle(request, { mapping: { ...mapping(101), translated_text: '보존할 편집값' } }, failure);
      const editable = f.nodes().find(node => node.type === 'textarea');
      assert.equal(Boolean(editable.props.disabled), false);
      assert.equal(editable.props.value, '보존할 편집값');
      editable.props.onChange({ target: { value: '완료 후 입력' } });
      f.render();
      assert.equal(f.nodes().find(node => node.type === 'textarea').props.value, '완료 후 입력');
    });
  }
}
