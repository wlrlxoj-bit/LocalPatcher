import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { Buffer } from 'node:buffer';
import ts from 'typescript';

/** 실제 로컬 TS를 평가하며 명시한 의존성 이외 require는 거부합니다. */
async function loadModule(relativePath, dependencies = {}, globals = {}) {
  const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const moduleRecord = { exports: {} };
  vm.runInNewContext(outputText, { ...globals, module: moduleRecord, exports: moduleRecord.exports,
    require(specifier) {
      if (Object.hasOwn(dependencies, specifier)) return dependencies[specifier];
      throw new Error(`허용되지 않은 테스트 의존성: ${specifier}`);
    },
  }, { filename: relativePath });
  return moduleRecord.exports;
}

// 실제 순수 후보 모듈 전체를 읽으며 DB 클라이언트 생성·네트워크·캐시는 실행하지 않습니다.
const candidates = await loadModule('../lib/patcher-trainer-candidates.ts');
const site = await loadModule('../lib/site.ts', {}, { process: { env: {} } });
const tables = await loadModule('../lib/trainer-option-table.ts');
const publication = await loadModule('../lib/patcher-publication.ts', { './site': site, './trainer-option-table': tables });
const inputDependencies = {
  'node:buffer': { Buffer },
  'server-only': {}, './access': { getAdminClient: () => { throw new Error('테스트에서 기본 DB 접근 금지'); } },
  '@/lib/patcher-trainer-candidates': candidates, '@/lib/site': site,
};
const inputModule = await loadModule('../lib/server/admin/patcher-publication-input.ts', inputDependencies, { AbortController, setTimeout, clearTimeout });
const { dryRunPatcherPublication } = await loadModule('../lib/server/admin/patcher-publication-dry-run.ts', {
  'server-only': {}, '@/lib/patcher-publication': publication, './patcher-publication-input': inputModule,
});
const { parsePublicationReadPayload, readPatcherPublicationInput } = inputModule;
const request = { canonicalSlug: 'fixture-game', locale: 'ko' };

/** 설치된 Supabase와 같은 thenable builder의 abortSignal 계약만 모사합니다. */
function clientOf(run) {
  return { rpc(...args) {
    const pending = Promise.resolve().then(() => run(...args));
    pending.abortSignal = (signal) => { assert.ok(signal instanceof AbortSignal); return pending; };
    return pending;
  } };
}

function mapping(id = 1, trainer_id = 10) {
  return { id, trainer_id, language_code: 'ko', is_approved: true, offset_dec: 100,
    original_text: 'Num 0 - Original', translated_text: 'Num 0 - 번역' };
}
function payload(overrides = {}) {
  const result = {
    schema_version: 1, locale: 'ko', fingerprint: 'a'.repeat(64),
    canonical_game: { id: 4, slug: 'fixture-game' }, source_games: [{ id: 4, slug: 'fixture-game' }],
    candidate_trainers: [{ id: 10, game_id: 4, version_str: 'v1.0', option_count: 1 }],
    approved_mappings: [mapping()], ...overrides,
  };
  result.counts ??= { source_games: result.source_games.length, candidate_trainers: result.candidate_trainers.length, approved_mappings: result.approved_mappings.length };
  return result;
}

test('단일 RPC 응답에서만 후보와 매핑을 읽고 실제 정렬을 재사용한다', async () => {
  let calls = 0;
  const client = clientOf(async (name, args) => {
    calls += 1;
    assert.equal(name, 'read_patcher_publication_input');
    assert.equal(args.p_canonical_slug, request.canonicalSlug);
    assert.equal(args.p_locale, request.locale);
    return { error: null, data: payload({ candidate_trainers: [
      { id: 30, game_id: 4, version_str: 'v1.1', option_count: 1 },
      { id: 10, game_id: 4, version_str: 'v1.0-v1.16.1 Plus 1', option_count: 1 },
      { id: 20, game_id: 4, version_str: 'v1.16.1.0 Plus 1', option_count: 1 },
    ] }) };
  });
  const result = await readPatcherPublicationInput(request, client);
  assert.equal(result.status, 'ready');
  assert.equal(result.input.orderedTrainers.map((row) => row.id).join(','), '20,10,30');
  assert.equal(calls, 1);
});

test('정확한 Elden canonical/source만 합치고 무관한 source·중복 게임은 거부한다', () => {
  const eldenRequest = { canonicalSlug: 'elden-ring', locale: 'ko' };
  const data = payload({ canonical_game: { id: 4, slug: 'elden-ring' },
    source_games: [{ id: 4, slug: 'elden-ring' }, { id: 638, slug: candidates.ELDEN_RING_SOURCE_SLUG }],
    candidate_trainers: [
      { id: 20, game_id: 4, version_str: 'v1.15', option_count: 1 },
      { id: 10, game_id: 638, version_str: 'v1.16.1', option_count: 1 },
    ],
  });
  const valid = parsePublicationReadPayload(data, eldenRequest);
  assert.equal(valid.status, 'ready');
  assert.equal(valid.input.orderedTrainers.map((row) => row.id).join(','), '10,20');
  for (const source of [{ id: 638, slug: 'elden-ring-shadow-of-the-erdtree' }, { id: 4, slug: candidates.ELDEN_RING_SOURCE_SLUG }]) {
    assert.equal(parsePublicationReadPayload({ ...data, source_games: [data.source_games[0], source] }, eldenRequest).reason, 'INVALID_RPC_PAYLOAD');
  }
  assert.equal(parsePublicationReadPayload(data, request).reason, 'INVALID_RPC_PAYLOAD');
});

test('부분 응답·중복·널·다른 trainer/언어·미승인·unsafe offset은 전체를 거부한다', () => {
  const original = payload();
  const corruptions = [
    { fingerprint: '' }, { fingerprint: null }, { schema_version: 2 }, { locale: 'ja' }, { canonical_game: null },
    { candidate_trainers: [] }, { approved_mappings: null }, { counts: {} },
    { candidate_trainers: [original.candidate_trainers[0], original.candidate_trainers[0]] },
    { approved_mappings: [mapping(), mapping()] },
    { approved_mappings: [mapping(), { ...mapping(2), offset_dec: 100 }] },
    { approved_mappings: [{ ...mapping(), trainer_id: 99 }] },
    { approved_mappings: [{ ...mapping(), language_code: 'ja' }] },
    { approved_mappings: [{ ...mapping(), is_approved: false }] },
    { approved_mappings: [{ ...mapping(), original_text: null }] },
    { approved_mappings: [{ ...mapping(), offset_dec: Number.MAX_SAFE_INTEGER + 1 }] },
    { candidate_trainers: [{ ...original.candidate_trainers[0], game_id: 638 }] },
  ];
  for (const corruption of corruptions) {
    assert.equal(parsePublicationReadPayload({ ...original, ...corruption }, request).reason, 'INVALID_RPC_PAYLOAD');
  }
});

test('미확인 수량 후보를 삭제·보정하지 않고 최신 ID와 과거 완전본을 분리한다', () => {
  for (const count of [0, null]) {
    const latest = { id: 20, game_id: 4, version_str: 'v2.0', option_count: count };
    const data = payload({ candidate_trainers: [latest, payload().candidate_trainers[0]],
      approved_mappings: [mapping(), mapping(2, 20)] });
    const parsed = parsePublicationReadPayload(data, request);
    assert.equal(parsed.status, 'ready');
    assert.equal(parsed.input.orderedTrainers.length, 2);
    assert.equal(parsed.input.orderedTrainers[0].id, 20);
    assert.equal(parsed.input.orderedTrainers[0].option_count, count);
    const result = publication.resolvePatcherPublication(parsed.input);
    assert.equal(result.status, 'available');
    assert.equal(result.latestDiscoveredTrainer.id, 20);
    assert.equal(result.publishedTrainer.id, 10);
    const unknownOnly = parsePublicationReadPayload(payload({ candidate_trainers: [latest], approved_mappings: [mapping(1, 20)] }), request);
    assert.equal(unknownOnly.status, 'ready');
    assert.equal(publication.resolvePatcherPublication(unknownOnly.input).reason, 'NO_COMPLETE_APPROVED_TRANSLATION');
    const corrected = parsePublicationReadPayload(payload({ candidate_trainers: [{ ...latest, option_count: 1 }, data.candidate_trainers[1]],
      approved_mappings: data.approved_mappings }), request);
    assert.equal(corrected.status, 'ready');
    assert.equal(publication.resolvePatcherPublication(corrected.input).publishedTrainer.id, 20);
  }
});

test('미확인 수량과 함께 있어도 잘못된 ID·source·버전·중복 및 손상 수량은 전체를 거부한다', () => {
  const original = payload().candidate_trainers[0];
  for (const count of [-1, 1.5, '1', undefined, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(parsePublicationReadPayload(payload({ candidate_trainers: [{ ...original, option_count: count }] }), request).reason, 'INVALID_RPC_PAYLOAD');
  }
  for (const count of [0, null]) {
    const unknown = { ...original, option_count: count };
    for (const candidate_trainers of [
      [{ ...unknown, id: 0 }], [unknown, unknown], [unknown, { ...original, id: 20, game_id: 999 }],
      [unknown, { ...original, id: 20, version_str: '' }],
    ]) assert.equal(parsePublicationReadPayload(payload({ candidate_trainers }), request).reason, 'INVALID_RPC_PAYLOAD');
  }
});

test('정상 빈 후보와 비어 있는 승인 매핑은 부분 전송과 구분한다', () => {
  assert.equal(parsePublicationReadPayload(payload({ candidate_trainers: [], approved_mappings: [] }), request).status, 'ready');
  const withoutMappings = parsePublicationReadPayload(payload({ approved_mappings: [] }), request);
  assert.equal(withoutMappings.status, 'ready');
  assert.equal(publication.resolvePatcherPublication(withoutMappings.input).reason, 'NO_COMPLETE_APPROVED_TRANSLATION');
});

test('불투명 fingerprint는 메모리 입력만 유지하고 알 수 없는 payload 필드는 선택기로 전달하지 않는다', () => {
  const extra = payload({ secret: '버리기', original_file_hash: '버리기' });
  const first = parsePublicationReadPayload(extra, request);
  const second = parsePublicationReadPayload({ ...extra, fingerprint: 'b'.repeat(64) }, request);
  assert.equal(first.status, 'ready');
  assert.notEqual(first.fingerprint, second.fingerprint);
  assert.equal(Object.hasOwn(first.input, 'fingerprint'), false);
  assert.equal(Object.hasOwn(first, 'secret'), false);
  assert.equal(Object.hasOwn(first.input.orderedTrainers[0], 'original_file_hash'), false);
});

test('무효 요청은 RPC를 호출하지 않고 DB 오류나 throw 내용은 노출하지 않는다', async () => {
  let calls = 0;
  const client = clientOf(async () => { calls += 1; throw new Error('비공개 테스트 오류'); });
  assert.equal((await readPatcherPublicationInput({ ...request, locale: 'en' }, client)).reason, 'INVALID_REQUEST');
  assert.equal((await readPatcherPublicationInput({ ...request, canonicalSlug: '../fixture' }, client)).reason, 'INVALID_REQUEST');
  assert.equal(calls, 0);
  const failed = await readPatcherPublicationInput(request, client);
  assert.equal(failed.reason, 'RPC_FAILED');
  assert.equal(JSON.stringify(failed).includes('비공개'), false);
  assert.equal(calls, 1);
  assert.equal((await readPatcherPublicationInput(request, null)).reason, 'ADMIN_CLIENT_UNAVAILABLE');
  assert.equal((await readPatcherPublicationInput(request, clientOf(async () => ({ data: payload(), error: { message: '비공개' } })))).reason, 'RPC_FAILED');
});

test('dry-run은 최신/과거/실패를 고정 집계만 반환하고 쓰기 콜백을 받지 않는다', async () => {
  let calls = 0;
  const summary = await dryRunPatcherPublication(Array.from({ length: 4 }, () => request), async () => {
    calls += 1;
    if (calls === 3) return { status: 'failed', reason: 'RPC_FAILED' };
    if (calls === 4) throw new Error('원문·fingerprint 비공개');
    const data = payload();
    if (calls === 2) { data.candidate_trainers.push({ id: 20, game_id: 4, version_str: 'v2.0', option_count: 1 }); data.counts.candidate_trainers += 1; }
    return parsePublicationReadPayload(data, request);
  });
  assert.equal(summary.total, 4); assert.equal(summary.available, 2); assert.equal(summary.latest, 1);
  assert.equal(summary.previous, 1); assert.equal(summary.unavailable, 2);
  assert.equal(summary.reasons.RPC_FAILED, 1); assert.equal(summary.reasons.READER_FAILED, 1);
  const serialized = JSON.stringify(summary);
  for (const hidden of ['fingerprint', 'original_text', 'translated_text', 'fixture-game', 'a'.repeat(64), 'v1.0']) assert.equal(serialized.includes(hidden), false);
});

test('dry-run 상한 초과는 reader 0회, 무효 입력은 고정 사유이며 승인 실패도 집계한다', async () => {
  let calls = 0;
  const reader = async () => { calls += 1; return parsePublicationReadPayload(payload({ approved_mappings: [] }), request); };
  assert.equal((await dryRunPatcherPublication(Array.from({ length: 21 }, () => request), reader)).status, 'invalid_batch');
  assert.equal(calls, 0);
  const result = await dryRunPatcherPublication([{ ...request, locale: 'en' }, request], reader);
  assert.equal(result.total, 2); assert.equal(result.unavailable, 2); assert.equal(calls, 1);
  assert.equal(result.reasons.INVALID_REQUEST, 1); assert.equal(result.reasons.NO_COMPLETE_APPROVED_TRANSLATION, 1);
});

test('UTF8 매핑 바이트 경계는 한글·emoji를 실제 바이트로 세고 1바이트 초과를 거부한다', () => {
  const { mappingTextBytes } = inputModule.PUBLICATION_INPUT_BUDGET;
  for (const unit of ['a', '가', '😀']) {
    const unitBytes = Buffer.byteLength(unit, 'utf8');
    const text = unit.repeat(Math.floor(mappingTextBytes / unitBytes)) + 'x'.repeat(mappingTextBytes % unitBytes);
    const data = payload({ approved_mappings: [{ ...mapping(), original_text: text, translated_text: '' }] });
    assert.equal(parsePublicationReadPayload(data, request).status, 'ready');
    data.approved_mappings[0].original_text += 'x';
    assert.equal(parsePublicationReadPayload(data, request).reason, 'INVALID_RPC_PAYLOAD');
  }
});

test('총 텍스트 및 JSON escape 보수적 상한과 초대형 버전 문자열을 거부한다', () => {
  const data = payload({ candidate_trainers: [{ id: 10, game_id: 4, version_str: 'v'.repeat(inputModule.PUBLICATION_INPUT_BUDGET.textBytes + 1), option_count: 1 }] });
  assert.equal(parsePublicationReadPayload(data, request).reason, 'INVALID_RPC_PAYLOAD');
  const empty = payload({ candidate_trainers: [], approved_mappings: [] });
  const baseText = Buffer.byteLength('ko' + request.canonicalSlug + request.canonicalSlug, 'utf8');
  const maxVersionBytes = Math.floor((inputModule.PUBLICATION_INPUT_BUDGET.jsonUpperBoundBytes - 1024 - 512 * 4) / 6) - baseText;
  const atBoundary = payload({ approved_mappings: [], candidate_trainers: [{ id: 10, game_id: 4, version_str: 'x'.repeat(maxVersionBytes), option_count: 1 }] });
  assert.equal(parsePublicationReadPayload(atBoundary, request).status, 'ready');
  atBoundary.candidate_trainers[0].version_str += 'x';
  assert.equal(parsePublicationReadPayload(atBoundary, request).reason, 'INVALID_RPC_PAYLOAD');
  assert.ok(inputModule.isPublicationPayloadWithinBudget(empty));
  const escaped = payload({ approved_mappings: [{ ...mapping(), original_text: '\u0001'.repeat(100), translated_text: '' }] });
  assert.ok(Buffer.byteLength(JSON.stringify(escaped), 'utf8') > Buffer.byteLength(escaped.approved_mappings[0].original_text, 'utf8'));
});

test('여러 매핑 합산의 도달 가능한 JSON 상한은 정확 경계를 허용하고 1바이트 초과를 거부한다', () => {
  const budget = inputModule.PUBLICATION_INPUT_BUDGET;
  const count = 11;
  const data = payload({ approved_mappings: Array.from({ length: count }, (_, index) => ({
    ...mapping(index + 1), offset_dec: index * 100, original_text: '', translated_text: '',
  })) });
  const fixedTextBytes = Buffer.byteLength(data.locale + data.canonical_game.slug + data.source_games[0].slug + data.candidate_trainers[0].version_str, 'utf8')
    + data.approved_mappings.reduce((sum, row) => sum + Buffer.byteLength(row.language_code, 'utf8'), 0);
  const structureBytes = 1024 + 512 * (data.candidate_trainers.length + count + 3);
  const allowedTextBytes = Math.floor((budget.jsonUpperBoundBytes - structureBytes) / 6);
  let remaining = allowedTextBytes - fixedTextBytes;
  for (const row of data.approved_mappings) {
    const bytes = Math.min(remaining, budget.mappingTextBytes);
    row.original_text = 'x'.repeat(bytes);
    remaining -= bytes;
  }
  assert.equal(remaining, 0);
  assert.ok(data.approved_mappings.every((row) => Buffer.byteLength(row.original_text, 'utf8') <= budget.mappingTextBytes));
  assert.ok(data.approved_mappings.at(-1).original_text.length < budget.mappingTextBytes);
  // 현재는 JSON 6배 상한에 먼저 도달하므로 8MiB 텍스트 성공 경계를 검증했다고 주장하지 않습니다.
  assert.ok(allowedTextBytes < budget.textBytes);
  assert.ok(structureBytes + 6 * allowedTextBytes <= budget.jsonUpperBoundBytes);
  assert.ok(structureBytes + 6 * (allowedTextBytes + 1) > budget.jsonUpperBoundBytes);
  assert.equal(parsePublicationReadPayload(data, request).status, 'ready');
  data.approved_mappings.at(-1).original_text += 'x';
  assert.equal(parsePublicationReadPayload(data, request).reason, 'INVALID_RPC_PAYLOAD');
});

test('15초 대기 상한은 취소 신호를 보내고 미응답 RPC를 고정 실패로 끝낸다', async () => {
  let timerCallback;
  let cleared = 0;
  let recordedSignal;
  const isolated = await loadModule('../lib/server/admin/patcher-publication-input.ts', inputDependencies, {
    AbortController,
    setTimeout(callback, delay) { assert.equal(delay, 15000); timerCallback = callback; return 123; },
    clearTimeout(id) { assert.equal(id, 123); cleared += 1; },
  });
  const client = { rpc() { return { abortSignal(signal) { recordedSignal = signal; return new Promise(() => {}); } }; } };
  const pending = isolated.readPatcherPublicationInput(request, client);
  assert.equal(recordedSignal.aborted, false);
  timerCallback();
  const failed = await pending;
  assert.equal(failed.reason, 'RPC_FAILED');
  assert.equal(recordedSignal.aborted, true);
  assert.equal(cleared, 1);
  assert.equal(Object.keys(failed).sort().join(','), 'reason,status');
});

test('정상·오류 응답은 타이머를 반드시 해제하여 pending handle을 남기지 않는다', async () => {
  const timers = new Set();
  const isolated = await loadModule('../lib/server/admin/patcher-publication-input.ts', inputDependencies, {
    AbortController, setTimeout(callback) { const handle = { callback }; timers.add(handle); return handle; },
    clearTimeout(handle) { timers.delete(handle); },
  });
  for (const response of [{ data: payload(), error: null }, { data: null, error: { message: '비공개' } }]) {
    await isolated.readPatcherPublicationInput(request, clientOf(async () => response));
    assert.equal(timers.size, 0);
  }
});

test('timeout 뒤 늦게 reject하는 RPC도 unhandled rejection과 타이머를 남기지 않는다', async () => {
  let timerCallback;
  let rejectRpc;
  let recordedSignal;
  const timers = new Set();
  const unhandled = [];
  const listener = (reason) => { unhandled.push(reason); };
  process.on('unhandledRejection', listener);
  try {
    const isolated = await loadModule('../lib/server/admin/patcher-publication-input.ts', inputDependencies, {
      AbortController,
      setTimeout(callback) { timerCallback = callback; const handle = {}; timers.add(handle); return handle; },
      clearTimeout(handle) { timers.delete(handle); },
    });
    const late = new Promise((_, reject) => { rejectRpc = reject; });
    const client = { rpc() { return { abortSignal(signal) { recordedSignal = signal; return late; } }; } };
    const pending = isolated.readPatcherPublicationInput(request, client);
    timerCallback();
    const failed = await pending;
    assert.equal(failed.reason, 'RPC_FAILED');
    assert.equal(recordedSignal.aborted, true);
    assert.equal(timers.size, 0);
    rejectRpc(new Error('늦게 도착한 비공개 오류'));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(unhandled.length, 0);
    assert.equal(timers.size, 0);
  } finally {
    process.removeListener('unhandledRejection', listener);
  }
});

test('rpc와 abortSignal의 동기 예외도 고정 오류만 반환하며 타이머를 만들지 않는다', async () => {
  let scheduled = 0;
  const timers = new Set();
  const isolated = await loadModule('../lib/server/admin/patcher-publication-input.ts', inputDependencies, {
    AbortController,
    setTimeout(callback) { scheduled += 1; const handle = { callback }; timers.add(handle); return handle; },
    clearTimeout(handle) { timers.delete(handle); },
  });
  for (const client of [
    { rpc() { throw new Error('비공개 rpc 동기 오류'); } },
    { rpc() { return { abortSignal() { throw new Error('비공개 abortSignal 동기 오류'); } }; } },
  ]) {
    const failed = await isolated.readPatcherPublicationInput(request, client);
    assert.equal(failed.reason, 'RPC_FAILED');
    assert.equal(Object.keys(failed).sort().join(','), 'reason,status');
    assert.equal(JSON.stringify(failed).includes('비공개'), false);
    assert.equal(timers.size, 0);
  }
  assert.equal(scheduled, 0);
});

