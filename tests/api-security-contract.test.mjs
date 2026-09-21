import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const priceRouteUrl = new URL('../app/api/prices/route.ts', import.meta.url);
const workflowRouteUrl = new URL('../app/api/admin/system/trigger-workflow/route.ts', import.meta.url);
const workflowStatusRouteUrl = new URL('../app/api/admin/system/workflow-status/route.ts', import.meta.url);
const retryStatusRouteUrl = new URL('../app/api/admin/system/translation-retry-status/route.ts', import.meta.url);
const adminSystemPageUrl = new URL('../app/[locale]/admin/system/page.tsx', import.meta.url);

test('가격 API는 입력 검증 실패 시 DB·외부 가격 API 호출보다 먼저 종료한다', async () => {
  const source = await readFile(priceRouteUrl, 'utf8');
  const validationIndex = source.indexOf("if (!input.valid) return priceResponse({ success: false, error: 'INVALID_PRICE_REQUEST' }, 400)");
  const firstDatabaseOrFetchIndex = Math.min(source.indexOf('await supabase'), source.indexOf('await fetch'));

  assert.ok(validationIndex >= 0, '잘못된 가격 요청의 명시적 종료가 필요합니다.');
  assert.ok(firstDatabaseOrFetchIndex > validationIndex, '검증 실패는 DB 또는 외부 API보다 먼저 끝나야 합니다.');
  assert.match(source, /MAX_TITLE_LENGTH = 160/);
  assert.match(source, /\^\[1-9\]\\d\{0,8\}\$/);
  assert.match(source, /KNOWN_APP_IDS\.has\(appId\)/);
  assert.doesNotMatch(source, /\.upsert\(/);
});

test('가격 API는 성공 응답만 공유 캐시하고 오류·상류 장애는 캐시하지 않는다', async () => {
  const source = await readFile(priceRouteUrl, 'utf8');
  assert.match(source, /Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400'/);
  assert.match(source, /Cache-Control': 'private, no-store'/);
  assert.match(source, /status === 200 \? SUCCESS_CACHE_HEADERS : ERROR_CACHE_HEADERS/);
  assert.match(source, /PRICE_UPSTREAM_UNAVAILABLE/);
  assert.match(source, /PRICE_LOOKUP_FAILED/);
  assert.doesNotMatch(source, /error:\s*err\.message/);
});

test('워크플로 실행 API는 고정 allowlist 외 요청을 GitHub에 전달하지 않는다', async () => {
  const source = await readFile(workflowRouteUrl, 'utf8');
  const rejectIndex = source.indexOf("return NextResponse.json({ error: 'WORKFLOW_NOT_ALLOWED' }, { status: 400 })");
  const dispatchIndex = source.indexOf('await fetch(');

  assert.match(source, /new Set\(\['scraper\.yml', 'maintenance\.yml'\]\)/);
  assert.ok(rejectIndex >= 0 && dispatchIndex > rejectIndex, 'allowlist 거부가 GitHub dispatch보다 먼저 실행되어야 합니다.');
  assert.match(source, /WORKFLOW_DISPATCH_FAILED/);
  assert.doesNotMatch(source, /response\.text\(\)/);
  assert.doesNotMatch(source, /error\.message/);
});

test('워크플로 상태 API도 allowlist 외 요청을 GitHub에 전달하지 않는다', async () => {
  const source = await readFile(workflowStatusRouteUrl, 'utf8');
  const rejectIndex = source.indexOf("return NextResponse.json({ error: 'WORKFLOW_NOT_ALLOWED' }, { status: 400, headers: NO_STORE_HEADERS })");
  const upstreamIndex = source.indexOf('await fetch(');

  assert.match(source, /new Set\(\['scraper\.yml', 'maintenance\.yml'\]\)/);
  assert.ok(rejectIndex >= 0 && upstreamIndex > rejectIndex, '허용하지 않은 상태 조회는 upstream 호출 전에 끝나야 합니다.');
  assert.match(source, /cache: 'no-store'/);
  assert.match(source, /WORKFLOW_STATUS_UNAVAILABLE/);
  assert.doesNotMatch(source, /error\.message|response\.text\(\)/);
});

test('워크플로 상태 API는 수동 dispatch를 예약 실행과 구분하고 마지막 성공 실행을 함께 제공한다', async () => {
  const source = await readFile(workflowStatusRouteUrl, 'utf8');
  assert.match(source, /dispatchRequestedAt/);
  assert.match(source, /workflow_dispatch/);
  assert.match(source, /awaiting_dispatch_run/);
  assert.match(source, /latestSuccess/);
  assert.match(source, /run_attempt/);
  assert.match(source, /Cache-Control': 'private, no-store'/);
});

test('재번역 상태 API는 관리자 인증 후 집계만 제공하고 개별 trainer 정보를 노출하지 않는다', async () => {
  const source = await readFile(retryStatusRouteUrl, 'utf8');
  assert.match(source, /requireAdmin\(request\)/);
  assert.match(source, /getAdminClient\(\)/);
  assert.match(source, /translation_retry_queue/);
  assert.match(source, /select\('\*', \{ count: 'exact', head: true \}\)/);
  assert.match(source, /ready: counts\.ready/);
  assert.match(source, /deferred: counts\.deferred/);
  assert.match(source, /blocked: counts\.blocked/);
  assert.doesNotMatch(source, /trainer_id/);
  assert.match(source, /Cache-Control': 'private, no-store'/);
});

test('관리자 화면은 dispatch가 승인된 뒤 실행 ID를 기다리고 재번역 차단 상태를 표시한다', async () => {
  const source = await readFile(adminSystemPageUrl, 'utf8');
  assert.match(source, /dispatchRequestedAt/);
  assert.match(source, /awaiting_dispatch_run/);
  assert.match(source, /translation-retry-status/);
  assert.match(source, /차단됨/);
  assert.match(source, /재시도 #/);
});
