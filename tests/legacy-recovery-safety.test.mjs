import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const acknowledgement = 'LEGACY_RECOVERY_OPERATOR_ACKNOWLEDGEMENT';

async function source(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

test('레거시 Python 복구 도구는 기본 main 경로에서 운영자 승인을 먼저 요구한다', async () => {
  for (const relativePath of ['scripts/archive_scraper.py', 'scripts/generate_ja_mappings.py']) {
    const content = await source(relativePath);
    const main = content.indexOf('def main():');
    const guard = content.indexOf('require_legacy_recovery_operator_acknowledgement()', main);
    assert.ok(content.includes(acknowledgement), `${relativePath}: 승인 환경 변수가 없다.`);
    assert.ok(main >= 0, `${relativePath}: main 진입점이 없다.`);
    assert.ok(guard >= 0, `${relativePath}: 실행 승인 호출이 없다.`);
    const firstMainOperation = content.indexOf('create_client(', main);
    assert.ok(guard < firstMainOperation, `${relativePath}: 승인 전에 DB 실행 경로가 있다.`);
  }
});

test('레거시 TypeScript 복구 도구는 파일·DB·번역 호출 전에 운영자 승인을 요구한다', async () => {
  const content = await source('scripts/repair-translations.ts');
  const main = content.indexOf('async function main()');
  const guard = content.indexOf('requireLegacyRecoveryOperatorAcknowledgement();', main);
  assert.ok(content.includes(acknowledgement));
  assert.ok(main >= 0);
  assert.ok(guard >= 0);
  const firstDangerousOperation = Math.min(
    ...['fs.writeFileSync(', 'createClient(']
      .map((marker) => content.indexOf(marker, main))
      .filter((index) => index >= 0),
  );
  assert.ok(guard < firstDangerousOperation, '승인 전에 파일/DB/번역 API 호출 경로가 있다.');
});
