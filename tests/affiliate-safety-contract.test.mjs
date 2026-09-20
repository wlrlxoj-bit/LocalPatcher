import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const clientUrl = new URL('../components/PatcherClient.tsx', import.meta.url);
const gamesUrl = new URL('../lib/i18n/dictionaries/games.ts', import.meta.url);

test('Humble 제휴 링크만 sponsored 관계를 선언하고 새 탭 보호를 유지한다', async () => {
  const source = await readFile(clientUrl, 'utf8');
  assert.match(source, /affiliate: Boolean\(partnerKey\)/);
  assert.match(source, /rel=\{store\.affiliate \? 'sponsored noopener noreferrer' : 'noopener noreferrer'\}/);
  assert.match(source, /trackAnalyticsEvent\('affiliate_merchant_clicked'/);
});

test('Humble 제휴 고지는 다섯 공개 언어에 있고 키가 없으면 렌더하지 않는다', async () => {
  const [client, games] = await Promise.all([readFile(clientUrl, 'utf8'), readFile(gamesUrl, 'utf8')]);
  assert.match(client, /\{partnerKey && <p[\s\S]*data-affiliate-disclosure/);
  assert.equal((games.match(/"humbleAffiliateDisclosure"/g) || []).length, 5);
  assert.match(client, /getGamesDict\(locale\)/);
});
