import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const gameCardUrl = new URL('../components/GameCard.tsx', import.meta.url);
const gamesListUrl = new URL('../components/GamesListClient.tsx', import.meta.url);
const patcherClientUrl = new URL('../components/PatcherClient.tsx', import.meta.url);

/**
 * 대상 `Image` 태그의 속성을 태그 종료 지점(`/>`) 안에서만 검증한다.
 * 다른 이미지 태그의 속성이 우연히 매칭되어 계약 검사가 통과하는 일을 막는다.
 */
function selfClosingImageTags(source) {
  return source.match(/<Image\b[\s\S]*?\/>/g) ?? [];
}

function coverImageTags(source) {
  return selfClosingImageTags(source).filter((tag) => tag.includes('src={game.cover_image_url}'));
}

test('Steam 커버는 Vercel 이미지 변환을 우회하고, 홈에는 LCP 후보 한 장만 preload한다', async () => {
  const [gameCard, gamesList, patcherClient] = await Promise.all([
    readFile(gameCardUrl, 'utf8'),
    readFile(gamesListUrl, 'utf8'),
    readFile(patcherClientUrl, 'utf8'),
  ]);

  const gameCardCoverTags = coverImageTags(gameCard);
  assert.equal(gameCardCoverTags.length, 1);
  assert.match(gameCardCoverTags[0], /\bunoptimized\b/);
  assert.match(gameCardCoverTags[0], /sizes="\(max-width: 639px\) calc\(100vw - 48px\), \(max-width: 767px\) calc\(\(100vw - 72px\) \/ 2\), \(max-width: 1023px\) calc\(\(100vw - 96px\) \/ 3\), 296px"/);
  assert.doesNotMatch(gamesList, /priority=\{index < 6\}/);
  assert.equal((gamesList.match(/priority=\{index === 0\}/g) || []).length, 2);

  const patcherCoverTags = coverImageTags(patcherClient);
  assert.equal(patcherCoverTags.length, 2);
  for (const tag of patcherCoverTags) {
    assert.match(tag, /\bunoptimized\b/);
  }
});
