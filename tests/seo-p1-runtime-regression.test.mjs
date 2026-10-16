import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import test from 'node:test';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const read = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8');
const migrationFile = 'supabase/migrations/202610050001_patcher_sitemap_snapshot_and_revalidation_outbox.sql';

function redactPostgresUrl(value, url) {
  return value.replaceAll(url, '[PostgreSQL URL 숨김]');
}

function runPostgresFixture({ url, fixture, migration, psql = 'psql', spawn = spawnSync, env = process.env }) {
  return spawn(psql, ['-X', '-v', 'ON_ERROR_STOP=1', '-d', url], {
    input: fixture.replace('-- __SEO_MIGRATION__', () => migration),
    encoding: 'utf8',
    env,
    timeout: 60000,
  });
}

// 실제 TS 본문을 실행하고 DB/cache 경계만 대체한다. 제품 로직을 fixture에 복제하지 않는다.
async function loadTs(file, dependencies = {}) {
  const exports = {};
  const output = ts.transpileModule(await read(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(output, {
    exports,
    require: (name) => {
      if (name === 'server-only') return {};
      if (name in dependencies) return dependencies[name];
      throw new Error(`예상하지 않은 의존성: ${name}`);
    },
    console: { warn() {} },
  }, { filename: file });
  return exports;
}

function immediateClient(rawSlug, target, hooks = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      assert.equal(table, 'trainers');
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({
        data: { game_id: 7, games: { slug: rawSlug } }, error: null,
      }) }) }) };
    },
    async rpc(name, args) {
      calls.push({ name, args });
      if (hooks[name]) return hooks[name](args);
      if (name === 'refresh_patcher_index_and_enqueue') return { data: 4, error: null };
      if (name === 'get_patcher_revalidation_target') return { data: target, error: null };
      throw new Error(`즉시 호출이 소유하지 않은 작업을 완료했습니다: ${name}`);
    },
  };
}

test('세 정적 Elden alias 및 숫자형 alias의 즉시 무효화는 snapshot canonical만 사용하고 outbox를 완료하지 않는다', async () => {
  const aliases = await loadTs('lib/game-slug-aliases.ts');
  const rawSlugs = [
    'elden-ring-shadow-of-the-erdtree',
    'elden-ring-shadow-of-the-erdtree-1768067282',
    'elden-ring-shadow-of-the-erdtree-trainer-1768067282',
    'same-game-trainer-123456',
  ];
  for (const rawSlug of rawSlugs) {
    const canonicalSlug = rawSlug.startsWith('elden-') ? 'elden-ring' : 'same-game';
    if (rawSlug.startsWith('elden-')) assert.equal(aliases.resolveStaticGameSlugAlias(rawSlug), canonicalSlug);
    const paths = [];
    const module = await loadTs('lib/server/admin/revalidate-patcher.ts', {
      'next/cache': { revalidatePath: (path) => paths.push(path), revalidateTag() {} },
      '@/lib/patcher-cache-tags': await loadTs('lib/patcher-cache-tags.ts'),
    });
    const client = immediateClient(rawSlug, [{ canonical_slug: canonicalSlug }]);
    const result = await module.revalidatePatcherForTrainer(client, 123);
    assert.equal(result.revalidated, true);
    assert.deepEqual(paths, ['ko', 'ja', 'de', 'es'].map((locale) => `/${locale}/patcher/${canonicalSlug}`));
    assert.deepEqual(client.calls.map(({ name }) => name), [
      'refresh_patcher_index_and_enqueue', 'get_patcher_revalidation_target',
    ]);
  }
});

test('snapshot 경로 누락·복수·조회 실패는 raw slug fallback이나 작업 완료 없이 재시도한다', async () => {
  for (const target of [null, [], [{ canonical_slug: '' }], [{ canonical_slug: 'one' }, { canonical_slug: 'two' }]]) {
    const paths = [];
    const module = await loadTs('lib/server/admin/revalidate-patcher.ts', {
      'next/cache': { revalidatePath: (path) => paths.push(path), revalidateTag() {} },
      '@/lib/patcher-cache-tags': await loadTs('lib/patcher-cache-tags.ts'),
    });
    const result = await module.revalidatePatcherForTrainer(immediateClient('raw-alias', target), 123);
    assert.equal(result.reason, 'canonical_snapshot_unavailable');
    assert.deepEqual(paths, []);
  }
  const module = await loadTs('lib/server/admin/revalidate-patcher.ts', {
    'next/cache': { revalidatePath: () => assert.fail('실패한 snapshot 조회 뒤 무효화할 수 없습니다.'), revalidateTag: () => assert.fail('실패한 snapshot 조회 뒤 태그를 무효화할 수 없습니다.') },
    '@/lib/patcher-cache-tags': await loadTs('lib/patcher-cache-tags.ts'),
  });
  const client = immediateClient('raw-alias', null, {
    get_patcher_revalidation_target: () => ({ data: null, error: new Error('조회 실패') }),
  });
  assert.equal((await module.revalidatePatcherForTrainer(client, 123)).revalidated, false);
});

test('즉시 cache 오류는 전파되고 worker용 durable 작업을 닫지 않는다', async () => {
  const failure = new Error('cache unavailable');
  const module = await loadTs('lib/server/admin/revalidate-patcher.ts', {
    'next/cache': { revalidatePath: () => { throw failure; }, revalidateTag() {} },
    '@/lib/patcher-cache-tags': await loadTs('lib/patcher-cache-tags.ts'),
  });
  const client = immediateClient('raw-alias', [{ canonical_slug: 'canonical' }]);
  await assert.rejects(module.revalidatePatcherForTrainer(client, 123), (error) => error === failure);
  assert.equal(client.calls.length, 2);
});

test('worker는 새 세대 fence의 finish false를 완료로 세지 않고 자기 lease만 사용한다', async () => {
  const paths = [];
  const calls = [];
  const module = await loadTs('lib/server/admin/patcher-revalidation-outbox.ts', {
    'next/cache': { revalidatePath: (path) => paths.push(path), revalidateTag() {} },
    '@/lib/patcher-cache-tags': await loadTs('lib/patcher-cache-tags.ts'),
  });
  const client = {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { game_id: 7 }, error: null }) }) }) }),
    async rpc(name, args) {
    calls.push({ name, args });
    if (name === 'bootstrap_patcher_index_eligibility_snapshot') return { data: 0, error: null };
    if (name === 'claim_patcher_revalidation_outbox') return { data: [{
      id: 1, trainer_id: 123, game_id: 7, locale_codes: ['ko', 'de'], reason: 'content_changed',
      lease_token: 'original-lease', canonical_slug: 'canonical', attempt_count: 1,
    }], error: null };
    return { data: false, error: null };
  } };
  const result = await module.drainPatcherRevalidationOutbox(client);
  assert.equal(result.completed, 0);
  assert.deepEqual(paths, ['/ko/patcher/canonical', '/de/patcher/canonical']);
  const finishes = calls.filter(({ name }) => name === 'finish_patcher_revalidation_outbox');
  assert.equal(finishes.length, 2);
  assert.ok(finishes.every(({ args }) => args.p_lease_token === 'original-lease'));
});

test('SQL literal의 단어 경계·hotkey escape와 전체 alias/세대 fence 계약을 보호한다', async () => {
  const sql = await read(migrationFile);
  assert.ok(sql.includes(String.raw`'\mtrainer\M'`));
  assert.ok(sql.includes(String.raw`'\mversion[[:space:]]*v?[0-9]+([.][0-9]+)*\M|\mv[0-9]+([.][0-9]+)*\M'`));
  const hotkeyLiteral = sql.split(/\r?\n/).find((line) => line.includes("'^[ "));
  assert.ok(hotkeyLiteral);
  assert.ok(hotkeyLiteral.includes(String.raw`[ \t]*`));
  assert.ok(!hotkeyLiteral.includes('[[:space:]]*'), '단축키 토큰/구분자 간 공백은 줄바꿈을 허용하지 않습니다.');
  assert.ok(!sql.includes('\\\\'), 'standard_conforming_strings SQL에 이중 backslash가 없어야 합니다.');
  for (const slug of ['elden-ring-shadow-of-the-erdtree', 'elden-ring-shadow-of-the-erdtree-1768067282', 'elden-ring-shadow-of-the-erdtree-trainer-1768067282']) {
    assert.equal(sql.split(`'${slug}'`).length - 1 >= 2, true);
  }
  assert.match(sql, /outbox\.state = 'claimed' and outbox\.lease_expires_at <= clock_timestamp\(\)/);
  assert.equal((sql.match(/generation = outbox\.generation \+ 1/g) || []).length, 3);
  assert.match(sql, /claimed_generation=outbox\.generation/);
  assert.match(sql, /outbox\.generation <> outbox\.claimed_generation then 'ready'/);
  assert.doesNotMatch(sql, /complete_patcher_revalidation_for_trainer/);
});

test('실제 JS 제목 정규화는 Trainer·버전 제거 및 다른 제목 보존을 수행한다', async () => {
  const module = await loadTs('lib/game-slug-aliases.ts');
  assert.equal(module.normalizeLegacyGameTitle('Same Game Trainer Version v1.2 v3.4'), 'same game');
  assert.equal(module.normalizeLegacyGameTitle('Same Game Trainer Versionv1.2'), 'same game');
  assert.equal(module.normalizeLegacyGameTitle('Trainerverse v12beta'), 'trainerverse v12beta');
  const slugs = new Set(['same-game', 'same-game-trainer-123456']);
  const titles = new Map([['same-game', 'Same Game'], ['same-game-trainer-123456', 'Same Game Trainer Version v1.2']]);
  assert.equal(module.canonicalizeListedGameSlug('same-game-trainer-123456', slugs, titles), 'same-game');
  titles.set('same-game-trainer-123456', 'Same Game Trainer Versionv1.2');
  assert.equal(module.canonicalizeListedGameSlug('same-game-trainer-123456', slugs, titles), 'same-game');
  titles.set('same-game-trainer-123456', 'Another Game Trainer');
  assert.equal(module.canonicalizeListedGameSlug('same-game-trainer-123456', slugs, titles), 'same-game-trainer-123456');
});

test('실제 화면 옵션 자격은 줄바꿈으로 분리된 Num 특수키 및 설명을 옵션으로 세지 않는다', async () => {
  const aliases = await loadTs('lib/game-slug-aliases.ts');
  const module = await loadTs('lib/content-eligibility.ts', {
    react: { cache: (fn) => fn },
    '@/lib/supabase': { supabase: null, sortTrainersLatestFirst: (trainers) => trainers },
    '@/lib/game-slug-aliases': aliases,
    '@/lib/site': { PUBLIC_LOCALIZATION_LOCALES: ['ko', 'ja', 'de', 'es'] },
  });
  for (const original_text of ['Num 1 -\nHealth', 'Num\nMultiply - Damage']) {
    assert.equal(module.hasCompleteApprovedMappings([{ original_text, translated_text: '검증 번역', is_approved: true }], 1), false);
  }
  assert.equal(module.hasCompleteApprovedMappings([{
    original_text: 'Num\t1 - Health', translated_text: '검증 번역', is_approved: true,
  }], 1), true);
});

// Validator만 명시적으로 지정한 폐기용 DB에서 실행한다. URL을 명령행/로그에 출력하지 않는다.
test('PostgreSQL fixture guard rejects SQL-wildcard near-miss database names', async () => {
  const fixture = await read('tests/seo-p1-postgres-regression.sql');
  assert.match(fixture, /left\(current_database\(\),\s*8\)\s*<>\s*'seo_test'/);
  assert.notEqual('seox test'.slice(0, 8), 'seo_test');
  assert.match(fixture, /from pg_namespace n[\s\S]*from pg_class c join pg_namespace n/);
  assert.match(fixture, /refclassid = 'pg_extension'::regclass and d\.deptype = 'e'/);
});

test('폐기용 PostgreSQL에서 실제 migration/lease/재enqueue/alias/regex 회귀를 실행한다', {
  skip: !process.env.SEO_TEST_POSTGRES_URL,
}, async () => {
  const fixture = await read('tests/seo-p1-postgres-regression.sql');
  const migration = (await read(migrationFile)).replace(/^begin;\s*$/mi, '').replace(/^commit;\s*$/mi, '');
  const url = process.env.SEO_TEST_POSTGRES_URL;
  const result = runPostgresFixture({
    url,
    fixture,
    migration,
    psql: process.env.SEO_TEST_PSQL || 'psql',
    env: process.env,
  });
  assert.ifError(result.error && new Error(redactPostgresUrl(result.error.message, url)));
  assert.equal(result.status, 0, redactPostgresUrl(result.stderr || '', url));
});

test('PostgreSQL fixture wrapper passes the URI explicitly and masks it in failures', async () => {
  const url = 'postgresql://synthetic-user:synthetic-password@127.0.0.1:55432/seo_test_safe';
  const fixture = 'select 1;\n-- __SEO_MIGRATION__\nselect 2;';
  const migration = 'create function synthetic() returns void as $$ begin null; end $$ language plpgsql;';
  let call;
  const result = runPostgresFixture({
    url,
    fixture,
    migration,
    psql: 'psql-test-double',
    env: { SEO_TEST_POSTGRES_URL: url },
    spawn: (...args) => {
      call = args;
      return { status: 1, stderr: `connection failed: ${url}`, error: null };
    },
  });

  assert.equal(call[0], 'psql-test-double');
  assert.deepEqual(call[1], ['-X', '-v', 'ON_ERROR_STOP=1', '-d', url]);
  assert.equal(call[2].input, `select 1;\n${migration}\nselect 2;`);
  assert.equal(call[2].timeout, 60000);
  assert.equal(redactPostgresUrl(result.stderr, url), 'connection failed: [PostgreSQL URL 숨김]');
  assert.ok(!redactPostgresUrl(result.stderr, url).includes('synthetic-password'));
});
