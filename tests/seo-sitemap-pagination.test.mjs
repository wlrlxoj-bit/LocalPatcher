import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const sourcePath = path.join(process.cwd(), 'lib/content-eligibility.ts');
const source = await readFile(sourcePath, 'utf8');
const compiledModule = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

function loadSnapshotReader(supabase) {
  const exports = {};
  const moduleRecord = { exports };
  const context = {
    exports,
    module: moduleRecord,
    require(name) {
      if (name === 'react') return { cache: (fn) => fn };
      if (name === '@/lib/supabase') return { supabase, sortTrainersLatestFirst: () => [] };
      if (name === '@/lib/game-slug-aliases') return { canonicalizeListedGameSlug: (slug) => slug };
      if (name === '@/lib/site') return { PUBLIC_LOCALIZATION_LOCALES: ['ko', 'ja', 'de', 'es'] };
      throw new Error(`Unexpected module import: ${name}`);
    },
  };
  vm.runInNewContext(compiledModule, context);
  return moduleRecord.exports.getPatcherSitemapSnapshotEntries;
}

function rows(count, offset = 0) {
  return Array.from({ length: count }, (_, index) => ({
    language_code: 'ko',
    canonical_slug: `game-${offset + index}`,
    content_updated_at: '2026-10-14T00:00:00.000Z',
  }));
}

function fakeClient(responses) {
  const calls = [];
  return {
    calls,
    client: {
      rpc(name, args, options) {
        assert.equal(name, 'list_patcher_indexable_sitemap_entries');
        assert.deepEqual(Object.keys(args), ['p_locales']);
        assert.deepEqual(Array.from(args.p_locales), ['ko']);
        assert.deepEqual(Object.keys(options), ['count']);
        assert.equal(options.count, 'exact');
        return {
          range(from, to) {
            calls.push([from, to]);
            return Promise.resolve(responses[calls.length - 1]);
          },
        };
      },
    },
  };
}

test('sitemap snapshot reads every exact-count page and returns all 2,630 entries', async () => {
  const { client, calls } = fakeClient([
    { data: rows(1000), error: null, count: 2630 },
    { data: rows(1000, 1000), error: null, count: 2630 },
    { data: rows(630, 2000), error: null, count: 2630 },
  ]);
  const entries = await loadSnapshotReader(client)(['ko']);
  assert.equal(entries.length, 2630);
  assert.deepEqual(calls, [[0, 999], [1000, 1999], [2000, 2999]]);
  assert.equal(entries.at(-1).slug, 'game-2629');
  assert.equal(entries[0].contentUpdatedAt.toISOString(), '2026-10-14T00:00:00.000Z');

  const [sitemapSource, siteSource] = await Promise.all([
    readFile(path.join(process.cwd(), 'app/sitemap.ts'), 'utf8'),
    readFile(path.join(process.cwd(), 'lib/site.ts'), 'utf8'),
  ]);
  const staticPaths = sitemapSource.match(/const staticPaths = \[([\s\S]*?)\];/)?.[1];
  const locales = siteSource.match(/PUBLIC_LOCALIZATION_LOCALES = \[([^\]]+)\]/)?.[1];
  assert.ok(staticPaths && locales);
  const staticPageCount = (staticPaths.match(/'[^']*'/g) || []).length * (locales.match(/'[^']+'/g) || []).length;
  assert.equal(staticPageCount + entries.length, 2662);
});

test('page-two failure rejects instead of returning a partial sitemap', async () => {
  const failure = new Error('page two failed');
  const { client } = fakeClient([
    { data: rows(1000), error: null, count: 1500 },
    { data: null, error: failure, count: 1500 },
  ]);
  await assert.rejects(loadSnapshotReader(client)(['ko']), (error) => error === failure);
});

test('snapshot rejects API-cap overflow and changing exact counts', async () => {
  const overflow = fakeClient([{ data: rows(1000), error: null, count: 100001 }]);
  await assert.rejects(loadSnapshotReader(overflow.client)(['ko']), /최대 페이지 수를 초과/);

  const mismatch = fakeClient([
    { data: rows(1000), error: null, count: 1200 },
    { data: rows(200, 1000), error: null, count: 1201 },
  ]);
  await assert.rejects(loadSnapshotReader(mismatch.client)(['ko']), /건수가 페이지 사이에 변경/);
});

test('snapshot rejects short pages, duplicate rows, malformed rows, and unknown counts', async () => {
  const short = fakeClient([{ data: rows(999), error: null, count: 1000 }]);
  await assert.rejects(loadSnapshotReader(short.client)(['ko']), /페이지가 완전하지/);

  const duplicateRows = rows(2);
  duplicateRows[1] = { ...duplicateRows[0] };
  const duplicate = fakeClient([{ data: duplicateRows, error: null, count: 2 }]);
  await assert.rejects(loadSnapshotReader(duplicate.client)(['ko']), /중복 항목/);

  const malformed = fakeClient([{ data: [{ ...rows(1)[0], content_updated_at: 'invalid' }], error: null, count: 1 }]);
  await assert.rejects(loadSnapshotReader(malformed.client)(['ko']), /시각이 올바르지/);

  const unknownCount = fakeClient([{ data: [], error: null, count: null }]);
  await assert.rejects(loadSnapshotReader(unknownCount.client)(['ko']), /페이지 정보가 올바르지/);
});
