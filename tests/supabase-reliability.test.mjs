import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

// 실제 조회 함수를 실행하되 DB와 Next 캐시만 대체하여 장애·빈 결과를 구분합니다.
const source = readFileSync(new URL('../lib/supabase.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function loadQueries(respond, configured = true) {
  const calls = [];
  const client = {
    from(table) {
      const call = { table };
      calls.push(call);
      const query = {
        select(columns) { call.columns = columns; return query; },
        eq() { return query; },
        in() { return query; },
        order(column, options) { call.order = [column, options]; return query; },
        range(start, end) { call.range = [start, end]; return query; },
        maybeSingle() { call.single = true; return query; },
        then(resolve, reject) { return Promise.resolve().then(() => respond(call)).then(resolve, reject); },
      };
      return query;
    },
  };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    process: { env: configured ? { NEXT_PUBLIC_SUPABASE_URL: 'https://test.invalid', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test' } : {} },
    console: { error() {}, warn() {} },
    require(name) {
      if (name === '@supabase/supabase-js') return { createClient: () => client };
      if (name === 'next/cache') return { unstable_cache: fn => fn };
      if (name === '@/lib/game-slug-aliases') return {};
      throw new Error(`예상하지 못한 모듈: ${name}`);
    },
  });
  return { queries: exports, calls };
}

test('DB 오류를 게임 없음·빈 트레이너·빈 번역·데모 목록으로 위장하지 않는다', async () => {
  for (const configured of [true, false]) {
    const { queries } = loadQueries(() => ({ data: null, error: { message: 'DB unavailable' } }), configured);
    await assert.rejects(queries.getGamesWithTrainers());
    await assert.rejects(queries.getGameBySlug('missing'));
    await assert.rejects(queries.getTrainersForGame(1));
    await assert.rejects(queries.getMappingsForTrainer(1));
    await assert.rejects(queries.getMappingsForTrainers([1]));
  }
});

test('성공한 빈 조회는 실제 없는 게임 및 번역 없음으로 유지한다', async () => {
  const { queries } = loadQueries(call => ({ data: call.single ? null : [], error: null }));
  assert.equal(await queries.getGameBySlug('missing'), null);
  assert.equal((await queries.getTrainersForGame(1)).length, 0);
  assert.equal((await queries.getMappingsForTrainer(1)).length, 0);
  assert.equal((await queries.getMappingsForTrainers([1]))[1].length, 0);
  assert.equal((await queries.getGamesWithTrainers()).length, 0);
});

test('DB가 요청보다 짧은 페이지를 반환해도 전체 목록과 카드·검색 필드를 읽는다', async () => {
  // 운영 DB에는 title_de/title_es 같은 선택적 컬럼이 없을 수 있습니다.
  const rows = Array.from({ length: 1005 }, (_, i) => ({
    id: i + 1, slug: `game-${i}`, title_en: `Game ${i}`, title_ko: `게임 ${i}`,
    cover_image_url: '/cover.webp', anti_cheat: 'none', trainers: [],
    description_en: '목록에는 보내지 않을 긴 본문', fling_url: 'https://example.com',
  }));
  const { queries, calls } = loadQueries(call => {
    if (call.columns !== '*,trainers(id,version_str,option_count)') {
      return { data: null, error: { code: '42703', message: 'optional column does not exist' } };
    }
    return { data: rows.slice(call.range[0], call.range[0] + 300), error: null };
  });
  const result = await queries.getGamesWithTrainers();
  assert.equal(result.length, 1005);
  assert.equal(new Set(result.map(game => game.id)).size, 1005);
  assert.equal(result[0].id, 1005);
  assert.deepEqual(calls.map(call => call.range[0]), [0, 300, 600, 900, 1005]);
  assert.equal(result[0].title_en, 'Game 1004');
  assert.equal(result[0].title_ko, '게임 1004');
  assert.equal(result[0].cover_image_url, '/cover.webp');
  assert.equal(result[0].title_de, undefined);
  assert.equal(result[0].title_es, undefined);
  assert.equal(result[0].is_popular, undefined);
  assert.equal(result[0].popularity_index, undefined);
  assert.ok(!('description_en' in result[0]));
  assert.ok(!('fling_url' in result[0]));
});

test('선택적 언어·인기 필드가 존재하면 목록 반환에 보존한다', async () => {
  const { queries } = loadQueries(call => ({ data: call.range[0] === 0 ? [{
    id: 1, slug: 'game', title_de: 'Spiel', title_es: 'Juego', title_ja: 'ゲーム',
    is_popular: true, popularity_index: 2, trainers: [{ id: 4, version_str: '1.0', option_count: 12 }],
  }] : [], error: null }));
  const [game] = await queries.getGamesWithTrainers();
  assert.equal(game.title_de, 'Spiel');
  assert.equal(game.title_es, 'Juego');
  assert.equal(game.title_ja, 'ゲーム');
  assert.equal(game.is_popular, true);
  assert.equal(game.popularity_index, 2);
  assert.equal(game.trainers[0].option_count, 12);
});

test('목록 두 번째 페이지 실패도 일부 목록 성공으로 캐시하지 않는다', async () => {
  const { queries } = loadQueries(call => call.range[0] === 0
    ? { data: [{ id: 1, trainers: [] }], error: null }
    : { data: null, error: { message: 'timeout' } });
  await assert.rejects(queries.getGamesWithTrainers());
});
