import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import * as reactJsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';

const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');
const node = (type, props) => ({ type, props: props ?? {} });
const jsx = { jsx: node, jsxs: node, Fragment: 'Fragment' };
const dictionary = new Proxy({ metaKeywords: [], metaDescApproved: 'approved {versionsStr}' }, { get: (target, key) => target[key] ?? String(key) });
const i18n = { getGameTitle: (game, locale) => game[`title_${locale}`] || game.title_en,
  getPatcherDict: () => dictionary, getCommonDict: () => dictionary, getGamesDict: () => dictionary };
const children = value => Array.isArray(value) ? value.flatMap(children) : value && typeof value === 'object'
  ? [value, ...children(value.props?.children)] : [];
const find = (tree, type) => children(tree).filter(value => value.type === type);

/** 실제 렌더러 TSX를 실행하고 DB 및 브라우저 효과만 격리합니다. */
async function load(file, dependencies, react = { default: { Suspense: 'Suspense' } }, runtime = jsx) {
  const record = { exports: {} };
  vm.runInNewContext(ts.transpileModule(await read(file), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { exports: record.exports, module: record, process: { env: {} }, console,
    require(name) {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return runtime;
      if (name in dependencies) return dependencies[name];
      if (name.startsWith('@/components/')) return { default: name.split('/').at(-1) };
      throw new Error(`허용되지 않은 소비자 의존성: ${name}`);
    },
  }, { filename: file });
  return record.exports;
}

const game = { id: 7, slug: 'synthetic-game', title_en: 'Synthetic', title_ko: '합성', cover_image_url: 'cover' };

/** 기존 공개 페이지의 데이터 조회를 합성 응답으로 격리합니다. */
async function pageFixture(options = {}) {
  const trainer = { id: 20, version_str: options.version ?? 'v2', option_count: 1 };
  const loadedModule = await load('app/[locale]/patcher/[game_slug]/page.tsx', {
    'next/navigation': { notFound: () => { throw new Error('404'); }, permanentRedirect: path => { throw new Error(path); } },
    '@/lib/supabase': { getGameBySlug: async () => options.game ?? game, resolveGameSlugAlias: async () => null,
      getTrainersForGame: async () => [trainer], getMappingsForTrainers: async () => ({}),
      getLatestUnapprovedStatusesForTrainers: async () => ({}),
      getPopularGamesWithTrainers: async () => [], getRelatedGames: async () => [] },
    '@/lib/i18n/index': i18n, '@/lib/i18n/genres': { translateGenre: value => value },
    '@/lib/site': { SITE_URL: 'https://example.test' }, '@/lib/steam': { extractSteamAppId: () => null },
    '@/lib/content-eligibility': { AUTO_LOCALIZATION_LOCALES: ['ko', 'ja', 'de', 'es'], getEligiblePatcherSlugs: async () => [],
      ELDEN_RING_CANONICAL_SLUG: 'elden-ring', ELDEN_RING_SOURCE_SLUG: 'source',
      getPatcherIndexEligibilityByGameIds: async () => new Map([[7, true]]),
      getPatcherIndexEligibilityByLocales: async () => new Map([['ko', true]]),
      getPatcherTrainers: (_game, _games, rows) => rows },
    '@/lib/trainer-option-summary': { getTrainerOptionSummary: () => null },
    '@/lib/trainer-option-table': { getTrainerOptionTable: () => null },
    '@/lib/trainer-provenance': { getTrainerProvenance: () => null },
  });
  return { module: loadedModule, props: { params: Promise.resolve({ locale: 'ko', game_slug: 'synthetic-game' }) } };
}

test('JSON-LD는 script 종료·HTML·유니코드 입력을 데이터로 보존하고 HTML 파서를 탈출하지 않는다', async () => {
  const baseline = await pageFixture();
  const expected = JSON.parse(find(await baseline.module.default(baseline.props), 'script')[0].props.dangerouslySetInnerHTML.__html);
  const payload = '</script><script>globalThis.injected = true</script><img src=x onerror="alert(1)"> < & " 한글 日本語 😀 \u2028\u2029';
  const f = await pageFixture({ version: payload, game: { ...game, title_en: payload, cover_image_url: payload } });
  const script = find(await f.module.default(f.props), 'script')[0];
  const serialized = script.props.dangerouslySetInnerHTML.__html;
  assert.equal(script.props.type, 'application/ld+json');
  assert.equal(serialized.includes('<'), false);
  assert.equal(/<\/script/i.test(serialized), false);
  assert.ok(serialized.includes('\\u003c'));
  assert.deepEqual(JSON.parse(serialized), { ...expected, name: `${payload} Trainer Local Patcher`,
    screenshot: payload, softwareVersion: payload });
});

test('Steam 요구사항의 br·목록 구분은 텍스트 줄바꿈으로 보존하고 악성 HTML은 실행하지 않는다', async () => {
  const calls = [];
  const component = await load('components/SystemRequirements.tsx', {
    '@/lib/steam': { getSteamAppDetails: async (...args) => {
      calls.push(args);
      return { pc_requirements: {
        minimum: '<strong>Minimum:</strong><br><ul><li><strong>OS:</strong> Windows 10</li><li>CPU: 4 cores<br/>RAM: 8 GB</li></ul>',
        recommended: '<strong>Recommended:</strong><br><img src=x onerror="alert(1)"><script>globalThis.injected = true</script>'
          + '<svg onload="alert(1)"></svg><a href="javascript:alert(1)">링크</a><br>한글 日本語 😀 &lt;img src=x&gt;',
      } };
    } }, '@/lib/i18n/index': i18n,
  }, undefined, reactJsx);
  const tree = await component.default({ steamAppId: 7, locale: 'ko' });
  assert.deepEqual(calls, [[7, 'ko']]);
  assert.equal(children(tree).some(value => 'dangerouslySetInnerHTML' in value.props), false);
  const blocks = children(tree).filter(value => value.props.className?.includes('whitespace-pre-line'));
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].props.children, 'OS: Windows 10\nCPU: 4 cores\nRAM: 8 GB');
  assert.match(blocks[1].props.children, /링크\n한글 日本語 😀/);
  const markup = renderToStaticMarkup(tree);
  assert.doesNotMatch(markup, /<(?:script|img|svg|a)\b/i);
  assert.doesNotMatch(markup, /\b(?:onerror|onload|href)=/i);
  assert.ok(markup.includes('&amp;lt;img src=x&amp;gt;'));
});

