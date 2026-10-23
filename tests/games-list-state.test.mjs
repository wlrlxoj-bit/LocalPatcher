import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { inspect } from 'node:util';
import vm from 'node:vm';
import test from 'node:test';

const require = createRequire(import.meta.url);
const ts = require('typescript');

// 실제 모듈을 실행하되 허용한 메모리 의존성 외에는 로드하지 않는다.
async function load(file, dependencies, globals = {}) {
  const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  vm.runInNewContext(output, {
    exports,
    Error,
    process: { env: {} },
    console: { error() {}, warn() {}, log() {} },
    ...globals,
    require(name) {
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      throw new Error(`허용하지 않은 의존성: ${name}`);
    },
  }, { filename: file, timeout: 1000 });
  return exports;
}

const games = Array.from({ length: 46 }, (_, index) => {
  const id = index + 1;
  return {
    id,
    title_en: `Galaxy Expedition ${id}`,
    title_ko: `은하 원정 ${id}`,
    title_ja: '', title_de: '', title_es: '',
    slug: `synthetic-game-${id}`,
    cover_image_url: '',
    anti_cheat: '',
    is_popular: id === 3 || id === 7,
    popularity_index: id === 7 ? 1 : id === 3 ? 2 : undefined,
  };
});
Object.assign(games[40], { title_en: 'Starlight Voyage', title_ko: '별빛 여행' });
Object.assign(games[41], { title_en: 'Quantum Zebra Quest', title_ko: '양자 얼룩말' });
Object.assign(games[42], { title_en: 'Dragon Tale', title_ko: '용 이야기', title_ja: 'ドラゴン' });
Object.assign(games[43], { title_en: 'Street Hunter', title_ko: '거리 사냥꾼', title_de: 'Straße Jäger' });
Object.assign(games[44], { title_en: 'Blue Ocean', title_ko: '푸른 바다', title_es: 'Océano Azul' });
Object.assign(games[45], { title_en: 'Monster Hunter', title_ko: '괴물 사냥꾼' });
const recentIds = games.map(game => game.id);
const searchIds = [7, 3, ...Array.from({ length: 40 }, (_, index) => index + 1).filter(id => id !== 7 && id !== 3)];

// 상태는 { query: string, visibleCount: number } 전이를 화면의 카드와 입력값으로 관찰한다.
async function gamesFixture(locale = 'ko', fixtureGames = games) {
  const hooks = [];
  let cursor = 0;
  let dirty = false;
  let effects = [];
  let tree;
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = typeof initial === 'function' ? initial() : initial;
      return [hooks[index], value => {
        const next = typeof value === 'function' ? value(hooks[index]) : value;
        if (!Object.is(next, hooks[index])) { hooks[index] = next; dirty = true; }
      }];
    },
    useRef(initial) {
      const index = cursor++;
      return hooks[index] ??= { current: initial };
    },
    useEffect(effect, dependencies) {
      const index = cursor++;
      const previous = hooks[index];
      if (!previous || !dependencies || dependencies.some((value, i) => !Object.is(value, previous.dependencies?.[i])) || dependencies.length !== previous.dependencies?.length) {
        effects.push(() => {
          previous?.cleanup?.();
          hooks[index] = { dependencies, cleanup: effect() };
        });
      }
    },
  };
  const jsx = (type, props, key) => ({ type, props, key });
  const component = await load('components/GamesListClient.tsx', {
    react: { ...react, default: react },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    '@/components/SearchBar': { default: 'SearchBar' },
    '@/components/GameCard': { default: 'GameCard' },
    '@/lib/i18n': {
      getCommonDict: () => ({}),
      getPatcherDict: () => ({ optionsCount: '옵션' }),
      getGamesDict: () => ({ loadMore: '더 보기', noGamesFound: '검색 결과 없음' }),
      getGameTitle: (game, language) => game[`title_${language}`] || game.title_en,
    },
    'lucide-react': Object.fromEntries(['Info', 'ShieldCheck', 'Zap', 'ChevronDown'].map(name => [name, name])),
  });
  const render = () => {
    let passes = 0;
    do {
      assert.ok(++passes < 25, '렌더가 유한 횟수 안에 안정화되어야 한다');
      cursor = 0;
      dirty = false;
      effects = [];
      tree = component.default({ games: fixtureGames, trainers: [], locale });
      effects.forEach(effect => effect());
    } while (dirty);
  };
  const walk = node => Array.isArray(node) ? node.flatMap(walk) : node && typeof node === 'object' ? [node, ...walk(node.props?.children)] : [];
  const nodes = () => walk(tree);
  const text = node => Array.isArray(node) ? node.map(text).join(' ') : node && typeof node === 'object' ? text(node.props?.children) : node == null || typeof node === 'boolean' ? '' : String(node);
  const search = () => nodes().find(node => node.type === 'SearchBar');
  const more = () => nodes().find(node => node.type === 'button' && text(node).trim() === '더 보기');
  render();
  return {
    cards: () => nodes().filter(node => node.type === 'GameCard'),
    ids: () => nodes().filter(node => node.type === 'GameCard').map(node => node.props.game.id),
    query: () => search().props.value,
    text: () => text(tree),
    hasMore: () => Boolean(more()),
    change(query) { assert.ok(search()); search().props.onChange(query); render(); },
    more() { assert.ok(more(), '더 보기 버튼이 있어야 한다'); more().props.onClick(); render(); },
  };
}

test('최근 목록과 검색 목록은 각각 18개에서 더 보며 검색 변경과 지우기는 18개로 되돌린다', async () => {
  const f = await gamesFixture();
  assert.equal(f.query(), '');
  assert.deepEqual(f.ids(), recentIds.slice(0, 18));
  f.more();
  assert.deepEqual(f.ids(), recentIds.slice(0, 36));
  f.change('Galaxy');
  assert.equal(f.query(), 'Galaxy');
  assert.deepEqual(f.ids(), searchIds.slice(0, 18));
  f.more();
  assert.deepEqual(f.ids(), searchIds.slice(0, 36));
  f.change('Expedition');
  assert.deepEqual(f.ids(), searchIds.slice(0, 18));
  f.more();
  assert.deepEqual(f.ids(), searchIds.slice(0, 36));
  f.change('');
  assert.equal(f.query(), '');
  assert.deepEqual(f.ids(), recentIds.slice(0, 18));
});

test('검색 정렬은 인기 순위 뒤 원래 순서를 보존하며 더 보기는 전체 일치 집합에서 끝난다', async () => {
  const f = await gamesFixture();
  f.change('Galaxy');
  f.more();
  f.more();
  assert.deepEqual(f.ids(), searchIds);
  assert.equal(new Set(f.ids()).size, 40);
  assert.equal(f.hasMore(), false);
  f.change('');
  f.more();
  f.more();
  assert.deepEqual(f.ids(), recentIds);
  assert.equal(f.hasMore(), false);
});

for (const [locale, query, id] of [
  ['ko', 'ㅂㅂ', 41],
  ['en', 'QZQ', 42],
  ['ja', 'どらごん', 43],
  ['de', 'strasse', 44],
  ['es', 'oceano', 45],
  ['es', 'monstruo', 46],
]) {
  test(`${locale} 화면에서 ${query} 검색은 다국어 일치 카드만 표시한다`, async () => {
    const f = await gamesFixture(locale);
    f.change(query);
    assert.deepEqual(f.ids(), [id]);
    assert.equal(f.cards()[0].props.locale, locale);
    assert.equal(f.hasMore(), false);
  });
}

const kanaCases = [
  { id: 101, katakana: 'ドラゴン', hiragana: 'どらごん' },
  { id: 102, katakana: 'トラコン', hiragana: 'とらこん' },
  { id: 103, katakana: 'パズル', hiragana: 'ぱずる' },
  { id: 104, katakana: 'バズル', hiragana: 'ばずる' },
  { id: 105, katakana: 'ハズル', hiragana: 'はずる' },
];

for (const titleForm of ['NFC', 'NFD']) {
  for (const queryForm of ['NFC', 'NFD']) {
    for (const script of ['katakana', 'hiragana']) {
      for (const { id, ...kana } of kanaCases) {
        test(`${titleForm} 일본어 제목은 ${queryForm} ${script} ${kana[script]} 검색에서 탁점과 반탁점이 같은 카드만 표시한다`, async () => {
          const fixtureGames = kanaCases.map(entry => ({
            ...games[0],
            id: entry.id,
            title_en: `Synthetic Entry ${entry.id}`,
            title_ja: entry.katakana.normalize(titleForm),
          }));
          const f = await gamesFixture('ja', fixtureGames);
          f.change(kana[script].normalize(queryForm));
          assert.deepEqual(f.ids(), [id]);
          assert.equal(f.hasMore(), false);
        });
      }
    }
  }
}

test('일치하지 않는 검색은 빈 결과와 더 보기 없음으로 표시하고 지우면 복구한다', async () => {
  const f = await gamesFixture();
  f.more();
  f.change('unmatchable987654321');
  assert.deepEqual(f.ids(), []);
  assert.match(f.text(), /검색 결과 없음/);
  assert.equal(f.hasMore(), false);
  f.change('');
  assert.deepEqual(f.ids(), recentIds.slice(0, 18));
  assert.doesNotMatch(f.text(), /검색 결과 없음/);
});

async function purgeFixture({ authorized = true, failure } = {}) {
  const calls = [];
  const logs = [];
  const route = await load('app/api/admin/system/purge/route.ts', {
    'next/server': { NextResponse: { json: (body, options = {}) => ({ body, status: options.status ?? 200 }) } },
    'next/cache': { revalidatePath(...args) { calls.push(args); if (failure !== undefined) throw failure; } },
    'next/headers': { cookies: async () => ({ get: () => authorized ? { value: 'synthetic-session' } : undefined }) },
    '@/lib/admin-session': { ADMIN_SESSION_COOKIE: 'synthetic-cookie', isValidAdminSession: value => authorized && value === 'synthetic-session' },
  }, { console: Object.fromEntries(['error', 'warn', 'log', 'info', 'debug'].map(level => [level, (...args) => logs.push(args)])) });
  return { response: await route.POST({}), calls, logs };
}

test('미인증 캐시 초기화는 401을 반환하고 캐시에 접근하지 않는다', async () => {
  const f = await purgeFixture({ authorized: false });
  assert.equal(f.response.status, 401);
  assert.equal(f.response.body.error, 'Unauthorized');
  assert.deepEqual(f.calls, []);
  assert.deepEqual(f.logs, []);
});

test('인증된 캐시 초기화는 루트 layout을 정확히 한 번 갱신한다', async () => {
  const f = await purgeFixture();
  assert.equal(f.response.status, 200);
  assert.equal(f.response.body.success, true);
  assert.deepEqual(f.calls, [['/', 'layout']]);
  assert.deepEqual(f.logs, []);
});

for (const [kind, failure] of [['Error', new Error('synthetic-private-error-471')], ['문자열', 'synthetic-private-string-472']]) {
  test(`캐시 갱신의 ${kind} 예외는 고정 500 오류만 반환하고 원문을 출력하지 않는다`, async () => {
    const f = await purgeFixture({ failure });
    assert.equal(f.response.status, 500);
    assert.deepEqual(Object.keys(f.response.body), ['error']);
    assert.equal(f.response.body.error, 'cache_purge_failed');
    assert.deepEqual(f.calls, [['/', 'layout']]);
    assert.equal(f.logs.length, 1);
    assert.equal(f.logs[0][0], '[CACHE_PURGE_FAILED]');
    assert.equal(f.logs[0][1].category, kind === 'Error' ? 'exception' : 'non_error');
    assert.doesNotMatch(inspect({ response: f.response, logs: f.logs }, { depth: null }), /synthetic-private/);
  });
}
