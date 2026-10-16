import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';

const require = createRequire(import.meta.url);
const ts = require('typescript');

async function loadTs(file, dependencies = {}, globals = {}) {
  const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports,
    process: { env: {} },
    console: { error() {}, warn() {} },
    require(name) {
      if (name === 'server-only') return {};
      if (name in dependencies) return dependencies[name];
      throw new Error(`예상하지 않은 의존성: ${name}`);
    },
    ...globals,
  }, { filename: file });
  return exports;
}

// outbox의 canonical ID와 별개인 실제 trainer 소속 조회를 흉내 냅니다.
function trainerGameLookup(gameId, expectedTrainerId, result = null) {
  return (table) => {
    assert.equal(table, 'trainers');
    return { select: (columns) => {
      assert.equal(columns, 'game_id');
      return { eq: (column, id) => {
        assert.equal(column, 'id');
        assert.equal(id, expectedTrainerId);
        return { maybeSingle: async () => result ?? ({ data: { game_id: gameId }, error: null }) };
      } };
    } };
  };
}

test('trainer·언어 태그는 유효한 범위만 허용하고 실제 batch 조회에 각각 연결된다', async () => {
  const tags = await loadTs('lib/patcher-cache-tags.ts');
  assert.equal(tags.getPatcherMappingCacheTag(42, 'ko'), 'patcher:trainer:42:locale:ko');
  assert.equal(tags.getPatcherTrainerListCacheTag(7), 'patcher:game:7:trainers');
  for (const id of [0, -1, 1.5, NaN, Infinity]) {
    assert.throws(() => tags.getPatcherMappingCacheTag(id, 'ko'));
    assert.throws(() => tags.getPatcherTrainerListCacheTag(id));
  }
  for (const locale of ['', 'xx', 'ko:all', 'KO']) {
    assert.throws(() => tags.getPatcherMappingCacheTag(42, locale));
  }

  const cacheCalls = [];
  const query = await loadTs('lib/supabase.ts', {
    '@supabase/supabase-js': { createClient: () => ({ from: () => {
      const chain = {
        select: () => chain, in: () => chain, eq: () => chain,
        then: (resolve) => Promise.resolve({ data: [], error: null }).then(resolve),
      };
      return chain;
    } }) },
    'next/cache': { unstable_cache: (fn, keys, options) => {
      cacheCalls.push({ keys, options });
      return fn;
    } },
    '@/lib/game-slug-aliases': {},
    '@/lib/patcher-cache-tags': tags,
  }, { process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://test.invalid', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test' } } });
  await query.getMappingsForTrainers([42, 43], 'ko');
  await query.getLatestUnapprovedStatusesForTrainers([42, 43], 'ko');
  await query.getTrainersForGame(7);
  await query.getTrainersForGame(8);
  const trainerCaches = cacheCalls.filter(({ keys }) => keys.includes('trainers-for-game'));
  assert.deepEqual(trainerCaches.map(({ keys }) => Array.from(keys)), [
    ['trainers-for-game', '7'], ['trainers-for-game', '8'],
  ]);
  assert.deepEqual(trainerCaches.map(({ options }) => Array.from(options.tags)), [
    [tags.getPatcherTrainerListCacheTag(7)], [tags.getPatcherTrainerListCacheTag(8)],
  ]);
  const mappingCache = cacheCalls.find(({ keys }) => keys.includes('mappings-for-trainers'));
  const statusCache = cacheCalls.find(({ keys }) => keys.includes('unapproved-statuses'));
  assert.ok(mappingCache);
  assert.ok(statusCache);
  assert.equal(mappingCache.options.revalidate, 3600);
  assert.deepEqual(Array.from(mappingCache.options.tags), [
    tags.getPatcherMappingCacheTag(42, 'ko'), tags.getPatcherMappingCacheTag(43, 'ko'),
  ]);
  assert.deepEqual(Array.from(statusCache.options.tags), Array.from(mappingCache.options.tags));
});

test('설치된 Next 문서는 Route Handler의 정확한 태그 즉시 만료를 지원한다', async () => {
  const docs = await readFile(new URL('../node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidateTag.md', import.meta.url), 'utf8');
  assert.match(docs, /called in Server Functions and Route Handlers/);
  assert.match(docs, /revalidateTag\(tag, \{ expire: 0 \}\)/);
});

test('신규 버전의 즉시·outbox 무효화는 해당 게임의 최신 목록만 다시 읽는다', async () => {
  const tags = await loadTs('lib/patcher-cache-tags.ts');
  const cached = new Map();
  const rows = new Map([
    [7, [{ id: 42, version_str: 'v1.0' }]],
    [8, [{ id: 80, version_str: 'v1.0' }]],
    [9, [{ id: 90, version_str: 'v1.0' }]],
  ]);
  const reads = new Map();
  const cache = {
    unstable_cache: (fn, keys, options) => async (...args) => {
      const key = JSON.stringify([keys, args]);
      if (!cached.has(key)) cached.set(key, { value: await fn(...args), tags: options?.tags ?? [] });
      return cached.get(key).value;
    },
    revalidateTag: (tag, profile) => {
      assert.equal(profile.expire, 0);
      for (const [key, entry] of cached) if (entry.tags.includes(tag)) cached.delete(key);
    },
    revalidatePath() {},
  };
  const queries = await loadTs('lib/supabase.ts', {
    '@supabase/supabase-js': { createClient: () => ({ from: () => {
      let gameId;
      const query = {
        select: () => query,
        eq: (column, value) => { assert.equal(column, 'game_id'); gameId = value; return query; },
        then: (resolve) => {
          reads.set(gameId, (reads.get(gameId) ?? 0) + 1);
          return Promise.resolve({ data: rows.get(gameId), error: null }).then(resolve);
        },
      };
      return query;
    } }) },
    'next/cache': cache, '@/lib/game-slug-aliases': {}, '@/lib/patcher-cache-tags': tags,
  }, { process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://test.invalid', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test' } } });
  assert.equal((await queries.getTrainersForGame(7))[0].id, 42);
  await queries.getTrainersForGame(8);
  rows.set(7, [...rows.get(7), { id: 43, version_str: 'v2.0' }]);
  assert.equal((await queries.getTrainersForGame(7))[0].id, 42, '무효화 전의 오래된 목록을 fixture에서 재현합니다.');
  const dependencies = { 'next/cache': cache, '@/lib/patcher-cache-tags': tags };
  const immediate = await loadTs('lib/server/admin/revalidate-patcher.ts', dependencies);
  await immediate.revalidatePatcherForTrainer({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { game_id: 7, games: { slug: 'game' } }, error: null }) }) }) }),
    rpc: async (name) => ({ data: name === 'get_patcher_revalidation_target' ? [{ canonical_slug: 'game' }] : 1, error: null }),
  }, 43);
  assert.equal((await queries.getTrainersForGame(7))[0].id, 43);
  await queries.getTrainersForGame(9);
  rows.set(7, [...rows.get(7), { id: 44, version_str: 'v3.0' }]);
  rows.set(9, [...rows.get(9), { id: 44, version_str: 'v3.0' }]);
  const worker = await loadTs('lib/server/admin/patcher-revalidation-outbox.ts', dependencies);
  const result = await worker.drainPatcherRevalidationOutbox({ from: trainerGameLookup(9, 44), rpc: async (name) => ({
    data: name === 'claim_patcher_revalidation_outbox' ? [{
      id: 1, trainer_id: 44, game_id: 7, locale_codes: ['ko'], reason: 'content_changed',
      canonical_slug: 'game', lease_token: 'lease', attempt_count: 1,
    }] : name === 'finish_patcher_revalidation_outbox' ? true : 0,
    error: null,
  }) });
  assert.equal(result.completed, 1);
  assert.equal((await queries.getTrainersForGame(7))[0].id, 44);
  assert.equal((await queries.getTrainersForGame(9))[0].id, 44, 'canonical 7과 다른 실제 source 9의 목록도 갱신합니다.');
  assert.equal((await queries.getTrainersForGame(8))[0].id, 80);
  assert.equal(reads.get(7), 3);
  assert.equal(reads.get(8), 1, '다른 게임의 목록은 무효화하지 않습니다.');
  assert.equal(reads.get(9), 2);
});

test('outbox RPC의 실제 반환 계약에는 trainer와 game ID가 모두 포함된다', async () => {
  const sql = await readFile(new URL('../supabase/migrations/202610050001_patcher_sitemap_snapshot_and_revalidation_outbox.sql', import.meta.url), 'utf8');
  assert.match(sql, /claim_patcher_revalidation_outbox\(p_limit integer default 10\)\s*returns table\(id bigint, dedupe_key text, trainer_id bigint, game_id bigint,/);
  assert.match(sql, /select claimed\.id, claimed\.dedupe_key, claimed\.trainer_id, claimed\.game_id,/);
});

test('즉시 처리와 outbox 재시도는 동일한 trainer·언어 태그만 만료시키고 canonical 경로만 갱신한다', async () => {
  const tags = await loadTs('lib/patcher-cache-tags.ts');
  const calls = [];
  const nextCache = {
    revalidateTag: (...args) => calls.push(['tag', ...args]),
    revalidatePath: (path) => calls.push(['path', path]),
  };
  const dependencies = { 'next/cache': nextCache, '@/lib/patcher-cache-tags': tags };
  const immediate = await loadTs('lib/server/admin/revalidate-patcher.ts', dependencies);
  const client = {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { game_id: 7, games: { slug: 'alias' } }, error: null }) }) }) }),
    rpc: async (name) => ({ data: name === 'get_patcher_revalidation_target' ? [{ canonical_slug: 'canonical' }] : 1, error: null }),
  };
  const result = await immediate.revalidatePatcherForTrainer(client, 42);
  assert.equal(result.revalidated, true);
  assert.equal(result.paths, 4);
  const locales = ['ko', 'ja', 'de', 'es'];
  const expected = [
    ['tag', tags.getPatcherTrainerListCacheTag(7), { expire: 0 }],
    ...locales.map((locale) => ['tag', tags.getPatcherMappingCacheTag(42, locale), { expire: 0 }]),
    ...locales.map((locale) => ['path', `/${locale}/patcher/canonical`]),
  ];
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), expected);

  calls.length = 0;
  const worker = await loadTs('lib/server/admin/patcher-revalidation-outbox.ts', dependencies);
  const outboxClient = { from: trainerGameLookup(9, 42), rpc: async (name) => {
    if (name === 'claim_patcher_revalidation_outbox') return { data: [{
      id: 1, trainer_id: 42, game_id: 7, locale_codes: ['ko', 'de'], reason: 'content_changed',
      canonical_slug: 'canonical', lease_token: 'lease', attempt_count: 1,
    }], error: null };
    return { data: name === 'finish_patcher_revalidation_outbox' ? true : 0, error: null };
  } };
  const drain = await worker.drainPatcherRevalidationOutbox(outboxClient);
  assert.equal(drain.completed, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    ['tag', tags.getPatcherTrainerListCacheTag(9), { expire: 0 }],
    ['tag', tags.getPatcherTrainerListCacheTag(7), { expire: 0 }],
    ['tag', tags.getPatcherMappingCacheTag(42, 'ko'), { expire: 0 }],
    ['tag', tags.getPatcherMappingCacheTag(42, 'de'), { expire: 0 }],
    ['path', '/ko/patcher/canonical'], ['path', '/de/patcher/canonical'],
  ]);
});

test('outbox 항목에 trainer ID가 없으면 전체 캐시 제거 없이 지연 처리한다', async () => {
  const tags = await loadTs('lib/patcher-cache-tags.ts');
  const touched = [];
  const worker = await loadTs('lib/server/admin/patcher-revalidation-outbox.ts', {
    'next/cache': {
      revalidateTag: () => touched.push('tag'),
      revalidatePath: () => touched.push('path'),
    },
    '@/lib/patcher-cache-tags': tags,
  });
  const finished = [];
  const client = { rpc: async (name, args) => {
    if (name === 'claim_patcher_revalidation_outbox') return { data: [{
      id: 1, trainer_id: null, locale_codes: ['ko'], reason: 'content_changed',
      canonical_slug: 'canonical', lease_token: 'lease', attempt_count: 1,
    }], error: null };
    if (name === 'finish_patcher_revalidation_outbox') finished.push(args);
    return { data: name === 'finish_patcher_revalidation_outbox' ? true : 0, error: null };
  } };
  const result = await worker.drainPatcherRevalidationOutbox(client);
  assert.equal(result.deferred, 1);
  assert.deepEqual(touched, []);
  assert.equal(finished[0].p_state, 'deferred');
});

test('게임 ID가 누락되거나 잘못되면 즉시 처리와 outbox 모두 성공으로 처리하지 않는다', async () => {
  const tags = await loadTs('lib/patcher-cache-tags.ts');
  const dependencies = {
    'next/cache': {
      revalidateTag: () => assert.fail('게임 ID 확인 실패 뒤 캐시를 제거할 수 없습니다.'),
      revalidatePath: () => assert.fail('게임 ID 확인 실패 뒤 경로를 제거할 수 없습니다.'),
    },
    '@/lib/patcher-cache-tags': tags,
  };
  const immediate = await loadTs('lib/server/admin/revalidate-patcher.ts', dependencies);
  const worker = await loadTs('lib/server/admin/patcher-revalidation-outbox.ts', dependencies);
  for (const gameId of [undefined, null, 0, -1, 1.5]) {
    const result = await immediate.revalidatePatcherForTrainer({
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { game_id: gameId, games: { slug: 'game' } }, error: null }) }) }) }),
      rpc: () => assert.fail('게임 ID 확인 실패 뒤 snapshot을 갱신할 수 없습니다.'),
    }, 42);
    assert.equal(result.revalidated, false);
    assert.equal(result.retryRequired, true);
    const finished = [];
    const drain = await worker.drainPatcherRevalidationOutbox({ rpc: async (name, args) => {
      if (name === 'claim_patcher_revalidation_outbox') return { data: [{
        id: 1, trainer_id: 42, game_id: gameId, locale_codes: ['ko'], reason: 'content_changed',
        canonical_slug: 'game', lease_token: 'lease', attempt_count: 1,
      }], error: null };
      if (name === 'finish_patcher_revalidation_outbox') finished.push(args);
      return { data: name === 'finish_patcher_revalidation_outbox' ? true : 0, error: null };
    } });
    assert.equal(drain.completed, 0);
    assert.equal(drain.deferred, 1);
    assert.equal(finished[0].p_failure_code, 'OUTBOX_PAYLOAD_INVALID');
  }
});

test('outbox의 실제 trainer 소속 조회 실패·삭제·잘못된 ID는 캐시 제거 없이 재시도한다', async () => {
  const tags = await loadTs('lib/patcher-cache-tags.ts');
  const worker = await loadTs('lib/server/admin/patcher-revalidation-outbox.ts', {
    'next/cache': {
      revalidateTag: () => assert.fail('소속 조회 실패 뒤 태그를 만료할 수 없습니다.'),
      revalidatePath: () => assert.fail('소속 조회 실패 뒤 경로를 만료할 수 없습니다.'),
    },
    '@/lib/patcher-cache-tags': tags,
  });
  for (const lookup of [
    { data: null, error: { message: 'DB unavailable' } },
    { data: null, error: null },
    { data: { game_id: null }, error: null },
    { data: { game_id: -1 }, error: null },
  ]) {
    const finished = [];
    const result = await worker.drainPatcherRevalidationOutbox({
      from: trainerGameLookup(null, 42, lookup),
      rpc: async (name, args) => {
        if (name === 'claim_patcher_revalidation_outbox') return { data: [{
          id: 1, trainer_id: 42, game_id: 7, locale_codes: ['ko'], reason: 'content_changed',
          canonical_slug: 'game', lease_token: 'lease', attempt_count: 1,
        }], error: null };
        if (name === 'finish_patcher_revalidation_outbox') finished.push(args);
        return { data: name === 'finish_patcher_revalidation_outbox' ? true : 0, error: null };
      },
    });
    assert.equal(result.completed, 0);
    assert.equal(result.deferred, 1);
    assert.equal(finished.length, 1);
    assert.equal(finished[0].p_state, 'deferred');
    assert.equal(finished[0].p_failure_code, 'OUTBOX_TRAINER_GAME_LOOKUP_FAILED');
  }
});
