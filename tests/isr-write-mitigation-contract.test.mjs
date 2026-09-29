import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), 'utf8');

test('패처 ISR은 하루 주기로 제한되고 실시간 Steam 접속자는 서버 HTML에 넣지 않는다', async () => {
  const [page, playerCount, steam] = await Promise.all([
    read('app/[locale]/patcher/[game_slug]/page.tsx'),
    read('components/SteamPlayerCount.tsx'),
    read('lib/steam.ts'),
  ]);
  assert.match(page, /export const revalidate = 86400/);
  assert.doesNotMatch(page, /getSteamPlayerCount/);
  assert.match(playerCount, /^'use client';/);
  assert.match(playerCount, /\/api\/steam\/player-count\?appid=/);
  assert.match(playerCount, /aria-busy="true"/);
  assert.match(steam, /cache: 'no-store'/);
  assert.doesNotMatch(steam, /GetNumberOfCurrentPlayers[\s\S]*?next: \{ revalidate: 900 \}/);
});

test('실시간 Steam endpoint는 입력을 제한하고, 페이지 ISR과 분리된 유한 CDN 캐시를 쓴다', async () => {
  const route = await read('app/api/steam/player-count/route.ts');
  assert.match(route, /export const dynamic = 'force-dynamic'/);
  assert.match(route, /s-maxage=900/);
  assert.match(route, /stale-while-revalidate=86400/);
  assert.match(route, /\^\\d\{1,8\}\$/);
  assert.match(route, /invalid_appid/);
});

test('재검증은 관계 조회 실패 시 재시도 상태를 돌리고 전역 경로·trainer별 sitemap을 무효화하지 않는다', async () => {
  const [revalidator, route] = await Promise.all([
    read('lib/server/admin/revalidate-patcher.ts'),
    read('app/api/internal/revalidate-patcher/route.ts'),
  ]);
  assert.match(revalidator, /trainer_game_lookup_unavailable/);
  assert.match(revalidator, /sitemap: 'deferred'/);
  assert.doesNotMatch(revalidator, /\[locale\]\/patcher\/\[game_slug\]/);
  assert.doesNotMatch(revalidator, /sitemap\.xml/);
  assert.match(route, /status: 503/);
  assert.match(route, /Retry-After/);
});

test('내부 재검증 API는 malformed 요청만 400으로, DB·경로 무효화 예외는 재시도 가능한 503으로 구분한다', async () => {
  const route = await read('app/api/internal/revalidate-patcher/route.ts');
  const requestParseStart = route.indexOf('let body:');
  const revalidationStart = route.indexOf('const client = getTranslationAdminClient();');
  const revalidationCatch = route.lastIndexOf('revalidation_unavailable');
  assert.ok(requestParseStart >= 0 && revalidationStart > requestParseStart && revalidationCatch > revalidationStart);
  const inputSection = route.slice(requestParseStart, revalidationStart);
  const retrySection = route.slice(revalidationStart);
  assert.match(inputSection, /error: 'invalid_request'/);
  assert.match(inputSection, /status: 400/);
  assert.match(retrySection, /error: 'revalidation_unavailable'/);
  assert.match(retrySection, /retryRequired: true/);
  assert.match(retrySection, /status: 503/);
  assert.doesNotMatch(retrySection, /error: 'invalid_request'/);
});
