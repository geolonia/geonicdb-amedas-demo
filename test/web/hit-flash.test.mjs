import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hitFlashRemaining, addPendingHit, pickPendingHit, HIT_FLASH_MS } from '../../web/src/lib/hit-flash.js';

test('hitFlashRemaining: 受信からの経過を引いた残り。期限切れは 0、先の時刻は上限', () => {
  assert.equal(HIT_FLASH_MS, 1800);
  assert.equal(hitFlashRemaining(1000, 1000), 1800);
  assert.equal(hitFlashRemaining(1000, 1500), 1300);
  assert.equal(hitFlashRemaining(1000, 2800), 0);
  assert.equal(hitFlashRemaining(1000, 5000), 0);
  assert.equal(hitFlashRemaining(2000, 1000), 1800); // 時計のずれで受信が未来でも、全期間を超えない
  assert.equal(hitFlashRemaining(undefined, 1000), 1800);
});

const level = { ge3: 1, ge5: 2 };
const pend = (...hits) => hits.reduce((c, [tier, at]) => addPendingHit(c, tier, at), undefined);

test('pickPendingHit: 期限が残っている候補のうち、最も強い tier を選ぶ', () => {
  // ロード前に ge5(0ms)、ge3(1000ms)が届き、1900ms にロード: ge5 は期限切れ、ge3 は有効
  assert.deepEqual(pickPendingHit(pend(['ge5', 0], ['ge3', 1000]), 1900, level), { tier: 'ge3', startedAt: 1000 });
  assert.equal(pickPendingHit(pend(['ge5', 1000], ['ge3', 1000]), 1900, level).tier, 'ge5'); // 両方有効
  assert.equal(pickPendingHit(pend(['ge5', 0], ['ge3', 100]), 5000, level), null); // 両方期限切れ
  assert.equal(pickPendingHit(undefined, 0, level), null);
});

test('addPendingHit: 同じ tier が複数なら新しい方。元の候補は変えない', () => {
  const a = pend(['ge3', 100]);
  const b = addPendingHit(a, 'ge3', 500);
  assert.equal(b.ge3, 500);
  assert.equal(a.ge3, 100);
  assert.equal(addPendingHit(b, 'ge3', 200).ge3, 500);
  assert.equal(pickPendingHit(b, 1000, level).startedAt, 500);
});

test('startedAt が不正なら、従来どおり(全期間有効)に扱う', () => {
  assert.deepEqual(pickPendingHit(pend(['ge3', undefined]), 99999, level), { tier: 'ge3', startedAt: undefined });
  assert.equal(pickPendingHit(pend(['ge5', NaN], ['ge3', 0]), 99999, level).tier, 'ge5');
});
