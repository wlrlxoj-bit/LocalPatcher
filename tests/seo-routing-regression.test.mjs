import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const nextServer = require('next/server');
const origin = 'https://localpatcher.com';

/** 실제 TypeScript 모듈을 컴파일하며 허용한 의존성 외 외부 호출을 차단합니다. */
async function loadModule(relativePath, dependencies = {}) {
  const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const moduleRecord = { exports: {} };
  vm.runInNewContext(outputText, {
    module: moduleRecord,
    exports: moduleRecord.exports,
    URL,
    require(specifier) {
      if (Object.hasOwn(dependencies, specifier)) return dependencies[specifier];
      throw new Error(`허용되지 않은 테스트 의존성: ${specifier}`);
    },
  }, { filename: relativePath });
  return moduleRecord.exports;
}

const aliases = await loadModule('../lib/game-slug-aliases.ts');
const { middleware } = await loadModule('../middleware.ts', {
  'next/server': nextServer,
  './lib/game-slug-aliases': aliases,
});

function request(path, headers) {
  return middleware(new nextServer.NextRequest(`${origin}${path}`, { headers }));
}

function assertPassThrough(path) {
  const response = request(path);
  assert.equal(response.status, 200, path);
  assert.equal(response.headers.get('x-middleware-next'), '1', path);
  assert.equal(response.headers.get('location'), null, path);
}

test('실재 여부를 모르는 trainer 접미사는 미들웨어에서 삭제하지 않는다', () => {
  for (const locale of ['ko', 'ja', 'de', 'es', 'en']) {
    for (const slug of ['graveyard-keeper-2-trainer', 'silent-hill-f-trainer', 'example-trainer-1768067282']) {
      assertPassThrough(`/${locale}/patcher/${slug}?ref=search`);
    }
  }
});

test('등록하지 않은 Elden 접두사 변형을 다른 게임으로 합치지 않는다', () => {
  for (const slug of [
    'elden-ring-shadow-of-the-erdtree-new-game',
    'elden-ring-shadow-of-the-erdtree-trainer',
    'elden-ring-shadow-of-the-erdtree-9999999999',
  ]) {
    assertPassThrough(`/ko/patcher/${slug}`);
  }
});

test('정확히 등록된 Elden 과거 주소 세 개만 언어와 쿼리를 보존하여 308 이동한다', () => {
  const query = '?utm_source=google&keyword=%ED%8C%A8%EC%B9%98&item=1&item=2';
  for (const locale of ['ko', 'ja', 'de', 'es', 'en']) {
    for (const slug of [
      'elden-ring-shadow-of-the-erdtree',
      'elden-ring-shadow-of-the-erdtree-1768067282',
      'elden-ring-shadow-of-the-erdtree-trainer-1768067282',
    ]) {
      const response = request(`/${locale}/patcher/${slug}${query}`);
      assert.equal(response.status, 308);
      assert.equal(response.headers.get('location'), `${origin}/${locale}/patcher/elden-ring${query}`);
    }
    assertPassThrough(`/${locale}/patcher/elden-ring`);
  }
});

test('사이트맵이 유지하는 독립 trainer 주소는 실제 미들웨어에서도 유지한다', () => {
  const slug = 'graveyard-keeper-2-trainer';
  const canonical = aliases.canonicalizeListedGameSlug(
    slug,
    new Set([slug]),
    new Map([[slug, 'Graveyard Keeper 2 Trainer']]),
  );
  assert.equal(canonical, slug);
  assertPassThrough(`/ko/patcher/${canonical}`);
});

test('기본 진입 언어와 Accept-Language 우선순위 및 쿼리 보존은 유지한다', () => {
  const defaultResponse = request('/?from=home');
  assert.equal(defaultResponse.status, 308);
  assert.equal(defaultResponse.headers.get('location'), `${origin}/ko?from=home`);

  const localized = request('/patcher/example-trainer?from=search', {
    'accept-language': 'fr;q=1,ja-JP;q=0.9,ko;q=0.8',
  });
  assert.equal(localized.status, 308);
  assert.equal(localized.headers.get('location'), `${origin}/ja/patcher/example-trainer?from=search`);
});

test('기존 locale·관리 경로와 API·정적 파일 경계를 변경하지 않는다', () => {
  for (const path of [
    '/ko', '/ja/games', '/de/patcher/example', '/ko/admin/system',
    '/api/admin/system', '/api/translation', '/_next/static/chunk.js',
    '/_next/image?url=cover.png', '/favicon.ico', '/icon.png',
    '/sitemap.xml', '/robots.txt', '/cover.webp',
  ]) {
    assertPassThrough(path);
  }
});
