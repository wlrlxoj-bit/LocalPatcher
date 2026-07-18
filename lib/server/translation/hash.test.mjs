import test from 'node:test';
import assert from 'node:assert/strict';
import { createSourceVersion } from './hash.ts';

const slot = (offsetDec, sourceMappingId) => ({
  sourceMappingId,
  targetMappingId: null,
  offsetDec,
  encoding: 'UTF-16LE',
  maxCharLen: 64,
  originalText: `source-${offsetDec}`,
  sourceRowVersion: `source-version-${sourceMappingId}`,
  targetRowVersion: null,
  targetOriginalText: null,
  targetTranslatedText: null,
  targetEncoding: null,
  targetMaxCharLen: null,
  targetApproved: null,
});

test('sourceVersion은 슬롯 순서와 snapshot 변경을 결정적으로 반영한다', () => {
  const slots = [slot(100, 1), slot(200, 2)];
  assert.equal(createSourceVersion(slots), createSourceVersion(slots));
  assert.notEqual(createSourceVersion(slots), createSourceVersion([...slots].reverse()));
  assert.notEqual(createSourceVersion(slots), createSourceVersion([slot(100, 1), slot(201, 2)]));
});
