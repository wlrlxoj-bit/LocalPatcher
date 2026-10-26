import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const jsx = (type, props) => ({ type, props });
const runtime = { jsx, jsxs: jsx, Fragment: 'fragment' };
const plain = (value) => JSON.parse(JSON.stringify(value));

function load(file, dependencies) {
  const exports = {};
  const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  vm.runInNewContext(compiled, {
    exports,
    process: { env: {} },
    require(name) {
      if (name === 'react/jsx-runtime') return runtime;
      if (name in dependencies) return dependencies[name];
      throw Error(`예상하지 않은 의존성 ${name}`);
    },
  }, { filename: file });
  return exports;
}

function elements(tree, type) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap((child) => elements(child, type));
  return [...(tree.type === type ? [tree] : []), ...elements(tree.props?.children, type)];
}

const i18n = load('lib/i18n/utils.ts', {});
const Card = load('components/GameCard.tsx', {
  react: {},
  'next/link': { default: 'card-link' },
  'next/image': { default: 'card-image' },
  'lucide-react': { ArrowRight: 'arrow', Lock: 'lock' },
  '@/lib/i18n/index': i18n,
}).default;

function candidate(id) {
  return {
    id, slug: `game-${id}`, title_en: `English ${id}`, title_ko: `한국어 ${id}`,
    title_ja: `日本語 ${id}`, title_de: `Deutsch ${id}`, title_es: `Español ${id}`,
    cover_image_url: `https://example.invalid/${id}.jpg`, anti_cheat: id % 2 ? 'EAC' : 'none',
    description_en: `합성 카드 설명 ${'X'.repeat(30000)}`, genres: ['합성 장르'], tags: ['합성 태그'],
    fling_url: 'https://example.invalid/source', internal_note: '합성 비공개 필드',
    trainers: [
      { id: id * 10, version_str: 'v2.0', option_count: 7, internal_note: '합성 트레이너 필드' },
      { id: id * 10 + 1, version_str: 'v1.0', option_count: 3 },
    ],
  };
}

async function renderPage(popular, related, eligible, locale = 'ko', mainOverrides = {}, indexEligible = true) {
  const main = { ...candidate(1000), slug: 'main-game', ...mainOverrides };
  const trainers = [
    { id: 10001, version_str: 'v3.0', original_file_hash: 'synthetic-hash-latest', original_file_size: 321, option_count: 1 },
    { id: 10002, version_str: 'v2.0', original_file_hash: 'synthetic-hash-older', original_file_size: 123, option_count: 2 },
  ];
  const originalMain = plain(main);
  const originalTrainers = plain(trainers);
  const mappings = { 10001: [] };
  const statuses = { 10001: null };
  const eligibilityCalls = [];
  const components = Object.fromEntries([
    'PatcherClient', 'SteamNews', 'SteamPlayerCount', 'SystemRequirements', 'PatcherUniqueContent',
    'AdsterraBanner', 'PatcherVerificationProvenance',
  ].map((name) => [`@/components/${name}`, { default: name }]));
  const page = load('app/[locale]/patcher/[game_slug]/page.tsx', {
    ...components,
    react: { default: { Suspense: 'suspense' } },
    'next/navigation': { notFound: () => assert.fail('기본 페이지가 사라졌습니다.'), permanentRedirect: () => assert.fail('기본 페이지가 이동했습니다.') },
    '@/lib/supabase': {
      resolveGameSlugAlias: async () => null,
      getGameBySlug: async () => main,
      getTrainersForGame: async () => trainers,
      getMappingsForTrainers: async () => mappings,
      getLatestUnapprovedStatusesForTrainers: async () => statuses,
      getPopularGamesWithTrainers: async () => popular,
      getRelatedGames: async () => related,
    },
    '@/lib/i18n/index': { ...i18n, getPatcherDict: () => ({ jsonLdDescription: '{gameTitleEn}' }) },
    '@/lib/i18n/genres': { translateGenre: (tag) => tag },
    '@/lib/site': { SITE_URL: 'https://example.invalid' },
    '@/lib/steam': { extractSteamAppId: () => null },
    '@/lib/content-eligibility': {
      ELDEN_RING_CANONICAL_SLUG: 'elden-ring', AUTO_LOCALIZATION_LOCALES: ['ko', 'en', 'ja', 'de', 'es'],
      getPatcherIndexEligibilityByGameIds: async (ids, language) => {
        eligibilityCalls.push({ ids: Array.from(ids), locale: language });
        return new Map(ids.map((id) => [id, id === main.id ? indexEligible : eligible.has(id)]));
      },
    },
    '@/lib/trainer-option-summary': { getTrainerOptionSummary: () => null },
    '@/lib/trainer-option-table': { getTrainerOptionTable: () => null },
    '@/lib/trainer-provenance': { getTrainerProvenance: () => null },
  });
  const tree = await page.default({ params: Promise.resolve({ locale, game_slug: main.slug }) });
  const props = elements(tree, 'PatcherClient')[0].props;
  assert.deepEqual(Object.keys(props.game).sort(), [
    'id', 'title_en', 'title_ko', 'title_ja', 'title_de', 'title_es', 'slug',
    'cover_image_url', 'anti_cheat', 'fling_url',
  ].sort());
  for (const key of Object.keys(props.game)) assert.equal(props.game[key], main[key]);
  const info = elements(props.gameInfoSlot, 'PatcherUniqueContent')[0].props;
  const localizedDescription = main[`description_${locale}`];
  assert.equal(info.description, typeof localizedDescription === 'string' && localizedDescription.trim()
    ? localizedDescription : main.description_en);
  assert.equal(info.gameTitle, locale !== 'en' && main[`title_${locale}`] ? main[`title_${locale}`] : main.title_en);
  assert.equal(info.gameTitleEn, main.title_en);
  if (Array.isArray(main.genres)) assert.equal(info.genres, main.genres);
  assert.deepEqual(plain(info.genres), Array.isArray(main.genres) ? main.genres : []);
  if (Array.isArray(main.tags)) assert.equal(info.tags, main.tags);
  assert.deepEqual(plain(info.tags), Array.isArray(main.tags) ? main.tags : []);
  assert.equal(info.sourceUrl, main.fling_url);
  assert.deepEqual(plain(main), originalMain);
  assert.deepEqual(plain(trainers), originalTrainers);
  assert.equal(props.mappingsMap, mappings);
  if (locale === 'en') assert.deepEqual(plain(props.unapprovedStatusMap), {});
  else assert.equal(props.unapprovedStatusMap, statuses);
  assert.deepEqual(plain(props.trainers), trainers);
  assert.equal(props.showAds, indexEligible);
  assert.deepEqual(eligibilityCalls, [{ ids: [main.id, ...popular.map((game) => game.id), ...related.map((game) => game.id)], locale }]);
  return props;
}

function expectedCard(game) {
  const result = Object.fromEntries([
    'id', 'title_en', 'title_ko', 'title_ja', 'title_de', 'title_es', 'slug', 'cover_image_url', 'anti_cheat',
  ].filter((key) => game[key] !== undefined).map((key) => [key, game[key]]));
  if (game.trainers) result.trainers = game.trainers.slice(0, 1).map(({ version_str, option_count }) => ({ version_str, option_count }));
  return result;
}

test('인기 카드는 0·1·6·20개 입력에서 승인 후 최대 6개만 실제 페이지 props로 전달한다', async () => {
  for (const count of [0, 1, 6, 20]) {
    const popular = Array.from({ length: count }, (_, index) => candidate(index + 1));
    const props = await renderPage(popular, [], new Set(popular.map((game) => game.id)));
    assert.deepEqual(plain(props.popularGames), popular.slice(0, 6).map(expectedCard));
    assert.deepEqual(plain(props.relatedGames), []);
  }
});

test('20개 혼합 후보의 선두 미승인은 슬롯을 소비하지 않고 관련 카드 순서·수량과 합성 JSON 축소를 확인한다', async () => {
  const popular = Array.from({ length: 20 }, (_, index) => candidate(index + 1));
  const related = [candidate(31), candidate(32), candidate(33), candidate(34), candidate(35), candidate(36), candidate(37)];
  delete related[0].trainers;
  related[2].trainers = [];
  const eligible = new Set([3, 5, 6, 8, 9, 10, 11, 13, 31, 33, 34, 35, 36, 37]);
  const props = await renderPage(popular, related, eligible);
  assert.deepEqual(plain(props.popularGames), [3, 5, 6, 8, 9, 10].map((id) => expectedCard(popular[id - 1])));
  assert.deepEqual(plain(props.relatedGames), related.filter((game) => game.id !== 32).map(expectedCard));
  assert.equal(props.relatedGames[0].trainers, undefined);
  const serialized = JSON.stringify([props.popularGames, props.relatedGames]);
  for (const field of ['description_en', 'genres', 'tags', 'fling_url', 'internal_note']) assert.equal(serialized.includes(field), false);
  assert.ok(Buffer.byteLength(serialized) < Buffer.byteLength(JSON.stringify([popular, related])));
});

test('5개 언어의 카드 제목·fallback·링크·이미지·anti-cheat와 첫 트레이너 요약을 보존한다', async () => {
  for (const locale of ['en', 'ko', 'ja', 'de', 'es']) {
    const localized = candidate(1);
    const fallback = candidate(2);
    for (const language of ['ko', 'ja', 'de', 'es']) delete fallback[`title_${language}`];
    const props = await renderPage([localized, fallback], [localized, fallback], new Set([1, 2]), locale);
    for (const cards of [props.popularGames, props.relatedGames]) {
      for (const [index, card] of cards.entries()) {
        const tree = Card({ game: card, locale, trainerVersion: card.trainers[0].version_str,
          optionCount: card.trainers[0].option_count, optionsLabel: 'Options' });
        assert.equal(elements(tree, 'card-link')[0].props.href, `/${locale}/patcher/game-${index + 1}`);
        assert.equal(elements(tree, 'card-image')[0].props.src, card.cover_image_url);
        assert.equal(elements(tree, 'card-image')[0].props.alt, card.title_en);
        assert.equal(elements(tree, 'h4')[0].props.children, index === 1 ? fallback.title_en : localized[`title_${locale}`]);
        assert.equal(elements(tree, 'lock').length, index === 0 ? 1 : 0);
        assert.equal(elements(tree, 'p')[0].props.children.join(''), 'Version: v2.0');
        assert.deepEqual(plain(card.trainers), [{ version_str: 'v2.0', option_count: 7 }]);
      }
    }
  }
});

function loadClient() {
  const { patcherDict } = load('lib/i18n/dictionaries/patcher.ts', {});
  return load('components/PatcherClient.tsx', {
    react: { useState: (initial) => [initial, () => {}], useEffect() {}, useRef: (current) => ({ current }) },
    'next/link': { default: 'client-link' },
    'next/image': { default: 'client-image' },
    'lucide-react': { ChevronLeft: 'back', ArrowRight: 'arrow', AlertTriangle: 'warning', Share2: 'share' },
    '@/lib/i18n': { ...i18n, getCommonDict: () => ({}), getGamesDict: () => ({}), getPatcherDict: (locale) => patcherDict[locale] },
    '@/components/DropZone': { default: 'drop-zone' },
    '@/components/GameCard': { default: 'client-card' },
    '@/components/AdSenseUnit': { default: 'ad-unit' },
    '@/lib/analytics': { trackAnalyticsEvent: () => assert.fail('렌더링 중 분석 이벤트를 전송했습니다.') },
  }).default;
}

test('관련 첫 트레이너의 옵션 수가 없으면 실제 PatcherClient가 카드에 숫자 0을 전달한다', async () => {
  const related = candidate(31);
  delete related.trainers[0].option_count;
  const props = await renderPage([], [related], new Set([31]));
  assert.deepEqual(plain(props.relatedGames[0].trainers), [{ version_str: 'v2.0' }]);
  const Client = loadClient();
  const cards = elements(Client(props), 'client-card');
  assert.equal(cards.length, 1);
  assert.equal(cards[0].props.game.id, 31);
  assert.equal(cards[0].props.trainerVersion, 'v2.0');
  assert.equal(cards[0].props.optionCount, 0);
});

test('본문 game은 10개 원값만 전달하고 5개 언어의 대형 설명·장르·태그는 서버 정보에 보존한다', async () => {
  const Client = loadClient();
  const descriptions = Object.fromEntries(['en', 'ko', 'ja', 'de', 'es'].map((locale) => [
    `description_${locale}`, `합성 본문 ${locale} ${'S'.repeat(30000)}`,
  ]));
  const main = { ...candidate(1000), ...descriptions, slug: 'main-game', is_popular: false, popularity_index: null,
    extra_payload: { nested: '합성 제외 필드' } };
  for (const locale of ['en', 'ko', 'ja', 'de', 'es']) {
    const props = await renderPage([], [], new Set(), locale, main);
    for (const key of [...Object.keys(descriptions), 'genres', 'tags', 'is_popular', 'popularity_index', 'internal_note', 'trainers', 'extra_payload']) {
      assert.equal(Object.hasOwn(props.game, key), false);
    }
    const clientTree = Client(props);
    assert.equal(elements(clientTree, 'h1')[0].props.children, main[`title_${locale}`]);
    assert.equal(elements(clientTree, 'client-image')[0].props.src, main.cover_image_url);
    assert.ok(Buffer.byteLength(JSON.stringify(props.game)) < Buffer.byteLength(JSON.stringify(main)));
  }
});

test('본문 5개 언어의 빈 제목·누락 제목·공백 설명·누락 설명은 영어로 fallback한다', async () => {
  const Client = loadClient();
  for (const locale of ['en', 'ko', 'ja', 'de', 'es']) {
    for (const missing of ['', undefined]) {
      const overrides = { title_ko: missing, title_ja: missing, title_de: missing, title_es: missing,
        description_en: '합성 영어 fallback', description_ko: missing === '' ? '  ' : undefined,
        description_ja: missing === '' ? '  ' : undefined, description_de: missing === '' ? '  ' : undefined,
        description_es: missing === '' ? '  ' : undefined };
      const props = await renderPage([], [], new Set(), locale, overrides);
      assert.equal(elements(Client(props), 'h1')[0].props.children, 'English 1000');
      assert.equal(elements(props.gameInfoSlot, 'PatcherUniqueContent')[0].props.description, '합성 영어 fallback');
    }
  }
});

test('본문 false·null·누락 필드는 기본값 없이 전달하고 미승인 광고 판정도 유지한다', async () => {
  for (const antiCheat of ['none', null, false]) {
    for (const flingUrl of ['https://example.invalid/source-main', null, undefined]) {
      const props = await renderPage([], [], new Set(), 'ko', {
        anti_cheat: antiCheat, fling_url: flingUrl, genres: null, tags: null,
      }, false);
      assert.equal(props.game.anti_cheat, antiCheat);
      assert.equal(props.game.fling_url, flingUrl);
      assert.equal(props.showAds, false);
    }
  }
});
