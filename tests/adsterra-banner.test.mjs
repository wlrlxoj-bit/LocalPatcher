import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../components/AdsterraBanner.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;

// 실제 컴포넌트를 실행하고 hook·저장소·프레임 타이밍만 격리합니다. 광고 네트워크는 호출하지 않습니다.
function harness({ saved = false, blocked = false } = {}) {
  const state = [];
  const effects = [];
  let index = 0;
  let mounted = false;
  const storage = new Map(saved ? [['localpatcher:adsterra-consent:v1', 'allowed']] : []);
  const exports = {};
  const jsx = (type, props) => ({ type, props });
  vm.runInNewContext(compiled, {
    exports,
    requestAnimationFrame: callback => { callback(); return 1; }, cancelAnimationFrame() {},
    sessionStorage: {
      getItem: key => { if (blocked) throw Error('blocked'); return storage.get(key); },
      setItem: (key, value) => { if (blocked) throw Error('blocked'); storage.set(key, value); },
      removeItem: key => { if (blocked) throw Error('blocked'); storage.delete(key); },
    },
    require(name) {
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (name === 'react') return {
        useState(initial) { const key = index++; if (!(key in state)) state[key] = initial; return [state[key], value => { state[key] = value; }]; },
        useRef: () => ({ current: null }),
        useEffect: callback => { if (!mounted) effects.push(callback); },
      };
      throw Error(name);
    },
  });
  return {
    storage,
    render(locale = 'ko') { index = 0; return exports.default({ locale }); },
    mount() { effects.splice(0).forEach(effect => effect()); mounted = true; },
  };
}

function elements(tree, type) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(child => elements(child, type));
  return [...(tree.type === type ? [tree] : []), ...elements(tree.props?.children, type)];
}

test('기본 렌더링은 모든 언어에서 외부 리소스 없이 허용 설정만 제공한다', () => {
  for (const locale of ['ko', 'en', 'ja', 'de', 'es']) {
    const h = harness();
    const tree = h.render(locale);
    assert.equal(elements(tree, 'iframe').length, 0);
    assert.equal(elements(tree, 'script').length, 0);
    assert.equal(elements(tree, 'link').length, 0);
    assert.equal(elements(tree, 'a')[0].props.href, `/${locale}/privacy`);
    assert.equal(elements(tree, 'button').length, 1);
  }
});

test('허용 후 발급 배너 하나만 생성하고 철회하면 iframe과 세션 동의를 제거한다', () => {
  const h = harness();
  let tree = h.render();
  h.mount();
  elements(tree, 'button')[0].props.onClick();
  tree = h.render();
  const frames = elements(tree, 'iframe');
  assert.equal(frames.length, 1);
  // 공식 코드가 사용하는 저장소 및 일반 링크 동작을 별도 sandbox로 막지 않습니다.
  assert.equal(frames[0].props.sandbox, undefined);
  assert.equal(frames[0].props.referrerPolicy, undefined);
  assert.equal(frames[0].props.width, '300');
  assert.equal(frames[0].props.height, '250');
  assert.match(frames[0].props.srcDoc, /https:\/\/www.highrevenueformat.com\/a5c2200df69026fe35b21b2a9ec505c1\/invoke.js/);
  assert.equal(h.storage.size, 1);
  elements(tree, 'button')[0].props.onClick();
  assert.equal(elements(h.render(), 'iframe').length, 0);
  assert.equal(h.storage.size, 0);
});

test('동의한 세션은 mount 후 복구되며 저장소 차단 시에도 허용·철회가 동작한다', () => {
  const existing = harness({ saved: true });
  assert.equal(elements(existing.render(), 'iframe').length, 0);
  existing.mount();
  assert.equal(elements(existing.render(), 'iframe').length, 1);
  const h = harness({ blocked: true });
  let tree = h.render();
  h.mount();
  elements(tree, 'button')[0].props.onClick();
  tree = h.render();
  assert.equal(elements(tree, 'iframe').length, 1);
  elements(tree, 'button')[0].props.onClick();
  assert.equal(elements(h.render(), 'iframe').length, 0);
});

test('패처 페이지는 색인 자격이 있는 경우에만 고유 정보 뒤에 배너 하나를 넣는다', () => {
  const page = readFileSync(new URL('../app/[locale]/patcher/[game_slug]/page.tsx', import.meta.url), 'utf8');
  assert.equal((page.match(/<AdsterraBanner\s/g) || []).length, 1);
  assert.ok(page.indexOf('<PatcherUniqueContent') < page.indexOf('<AdsterraBanner'));
  assert.match(page, /\{indexEligible && <AdsterraBanner locale=\{currentLocale as Locale\} \/>\}/);
});
