import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');

async function loadEligibilityFunctions() {
  const source = await readFile(new URL('../lib/content-eligibility.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require(name) {
      if (name === 'react') return { cache: fn => fn };
      if (name === '@/lib/supabase') return { sortTrainersLatestFirst: rows => rows, supabase: null };
      if (name === '@/lib/game-slug-aliases') return { canonicalizeListedGameSlug: slug => slug };
      if (name === '@/lib/site') return { PUBLIC_LOCALIZATION_LOCALES: ['ko', 'ja', 'de', 'es'] };
      throw new Error(`unexpected module: ${name}`);
    },
  });
  return exports;
}

test('승인된 원문 옵션이 2개여도 번역 옵션이 1개면 검색 노출 자격이 없다', async () => {
  const { hasCompleteApprovedMappings } = await loadEligibilityFunctions();
  const mappings = [{
    id: 1,
    trainer_id: 42,
    language_code: 'ko',
    is_approved: true,
    offset_dec: 100,
    encoding: 'UTF-8',
    max_length: 512,
    original_text: 'Num 1 - Original option one\nNum 2 - Original option two',
    translated_text: 'Num 1 - 승인 번역 옵션 하나',
  }];

  assert.equal(hasCompleteApprovedMappings(mappings, 2), false,
    '검색 노출 자격은 원문 수만 세지 않고 완전한 번역 옵션 표를 요구해야 합니다.');
});

test('승인된 원문 옵션과 번역 옵션이 모두 2개 이상이면 검색 노출 자격을 충족한다', async () => {
  const { hasCompleteApprovedMappings } = await loadEligibilityFunctions();
  const mappings = [{
    id: 2,
    trainer_id: 42,
    language_code: 'ko',
    is_approved: true,
    offset_dec: 100,
    encoding: 'UTF-8',
    max_length: 512,
    original_text: 'Num 1 - Original option one\nNum 2 - Original option two',
    translated_text: 'Num 1 - 승인 번역 옵션 하나\nNum 2 - 승인 번역 옵션 둘',
  }];

  assert.equal(hasCompleteApprovedMappings(mappings, 2), true,
    '원문과 번역문 모두 옵션 수가 충족된 승인 매핑은 색인 자격을 통과해야 합니다.');
});
