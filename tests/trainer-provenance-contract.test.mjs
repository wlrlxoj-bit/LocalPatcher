import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { promisify } from 'node:util';

const moduleUrl = new URL('../lib/trainer-provenance.ts', import.meta.url);
const pageUrl = new URL('../app/[locale]/patcher/[game_slug]/page.tsx', import.meta.url);
const execFileAsync = promisify(execFile);

const validMappings = [{
  is_approved: true,
  original_text: [1, 2, 3, 4].map((number) => `Num ${number} - Original ${number}`).join('\n'),
  translated_text: [1, 2, 3, 4].map((number) => `Num ${number} - Translation ${number}`).join('\n'),
}];
const validTrainers = [
  { id: 1, version_str: 'v1.16.1 Plus 35', original_file_hash: 'a'.repeat(64), original_file_size: 1_048_576, option_count: 4 },
  { id: 2, version_str: 'v1.15.0 Plus 35', original_file_hash: 'b'.repeat(64), original_file_size: 1_000_000, option_count: 4 },
];

async function runFixture(input) {
  const script = [
    "import { getTrainerProvenance } from './lib/trainer-provenance.ts';",
    `console.log(JSON.stringify(getTrainerProvenance(${JSON.stringify(input)})));`,
  ].join(' ');
  const { stdout } = await execFileAsync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', script], { cwd: new URL('..', import.meta.url) });
  return JSON.parse(stdout);
}

test('출처 정보는 확인된 원본 URL, 버전 이력, 승인 범위와 선택 파일 사실을 함께 만든다', async () => {
  const result = await runFixture({ sourceUrl: 'https://flingtrainer.com/trainer/example/', trainers: validTrainers, latestMappings: validMappings });
  assert.equal(result.latestVersion, 'v1.16.1 Plus 35');
  assert.equal(result.file.fingerprint, 'aaaaaaaaaaaa…');
  assert.equal(result.approvedOptionCount, 4);
  assert.equal(result.file.fileSize, '1.00 MB');
  assert.deepEqual(result.versionHistory, ['v1.16.1 Plus 35', 'v1.15.0 Plus 35']);
});

test('형식이 잘못된 출처 URL은 링크만 숨기고, 다른 확인 사실을 바꾸지 않는다', async () => {
  const cases = [
    { sourceUrl: 'https://evil.example/trainer/example/' },
    { sourceUrl: 'https://flingtrainer.com.evil.example/trainer/example/' },
    { sourceUrl: 'https://flingtrainer.com/trainer/example/?ref=x' },
    { sourceUrl: 'https://flingtrainer.com/trainer/' },
    { sourceUrl: 'https://flingtrainer.com/trainer/invalid_slug/' },
    { sourceUrl: 'https://flingtrainer.com/trainer/example/extra/' },
  ];
  for (const override of cases) {
    const result = await runFixture({ sourceUrl: 'https://flingtrainer.com/trainer/example/', trainers: validTrainers, latestMappings: validMappings, ...override });
    assert.notEqual(result, null);
    assert.equal(result.sourceUrl, undefined);
  }
});

test('확인된 사실이 둘 미만이면 출처 영역 전체를 만들지 않는다', async () => {
  const result = await runFixture({
    sourceUrl: 'https://flingtrainer.com/trainer/example/',
    trainers: [{ ...validTrainers[0], original_file_hash: 'bad', original_file_size: 0 }],
    latestMappings: [{ ...validMappings[0], is_approved: false }],
  });
  assert.equal(result, null);
});

test('해시나 파일 크기가 없거나 잘못되어도 출처·두 버전·승인 범위는 독립적으로 표시한다', async () => {
  const result = await runFixture({
    sourceUrl: 'https://flingtrainer.com/trainer/example/',
    trainers: [{ ...validTrainers[0], original_file_hash: 'bad', original_file_size: 0 }, validTrainers[1]],
    latestMappings: validMappings,
  });
  assert.equal(result.latestVersion, 'v1.16.1 Plus 35');
  assert.equal(result.approvedOptionCount, 4);
  assert.equal(result.file, undefined);
});

test('대소문자나 공백만 다른 버전은 하나의 이력으로 처리한다', async () => {
  const result = await runFixture({
    sourceUrl: 'https://flingtrainer.com/trainer/example/',
    trainers: [
      validTrainers[0],
      { ...validTrainers[0], id: 2, version_str: ' V1.16.1   Plus 35 ' },
    ],
    latestMappings: validMappings,
  });
  assert.notEqual(result, null);
  assert.equal(result.versionHistory, undefined);
});

test('유효하지 않은 과거 레코드는 이력을 만들지 않으며 확인 사실이 둘 미만이면 전체를 숨긴다', async () => {
  const result = await runFixture({
    sourceUrl: 'https://flingtrainer.com/trainer/example/',
    trainers: [
      { ...validTrainers[0], original_file_hash: 'bad', original_file_size: 0 },
      { ...validTrainers[1], id: 0 },
    ],
    latestMappings: [{ ...validMappings[0], is_approved: false }],
  });
  assert.equal(result, null);
});

test('유효하지 않은 과거 레코드는 독립 사실이 있어도 버전 이력에 포함하지 않는다', async () => {
  const result = await runFixture({
    sourceUrl: 'https://flingtrainer.com/trainer/example/',
    trainers: [validTrainers[0], { ...validTrainers[1], id: 'invalid' }],
    latestMappings: validMappings,
  });
  assert.notEqual(result, null);
  assert.equal(result.versionHistory, undefined);
  assert.equal(result.latestVersion, undefined);
});

test('버전 기록은 중복 없이 여섯 개까지만 보이며 전체 해시는 반환하지 않는다', async () => {
  const trainers = Array.from({ length: 8 }, (_, index) => ({ ...validTrainers[0], id: index + 1, version_str: `v${8 - index}.0` }));
  const result = await runFixture({ sourceUrl: 'https://www.flingtrainer.com/trainer/example/', trainers, latestMappings: validMappings });
  assert.deepEqual(result.versionHistory, ['v8.0', 'v7.0', 'v6.0', 'v5.0', 'v4.0', 'v3.0']);
  assert.equal(result.file.fingerprint.includes('a'.repeat(64)), false);
});

test('상세 페이지는 색인 가능하고 provenance가 있는 경우에만 SSR 영역을 전달한다', async () => {
  const [source, page] = await Promise.all([readFile(moduleUrl, 'utf8'), readFile(pageUrl, 'utf8')]);
  assert.match(source, /MAX_VERSION_HISTORY = 6/);
  assert.match(source, /SHA256_PATTERN/);
  assert.match(source, /OPTION_LINE_PATTERN/);
  assert.match(page, /indexEligible && provenance &&/);
  assert.match(page, /PatcherVerificationProvenance/);
});
