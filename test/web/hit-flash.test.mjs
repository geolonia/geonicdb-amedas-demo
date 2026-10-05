import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hitFlashRemaining, mergePendingHit, HIT_FLASH_MS } from '../../web/src/lib/hit-flash.js';

test('hitFlashRemaining: 受信からの経過を引いた残り。期限切れは 0、先の時刻は上限', () => {
  assert.equal(HIT_FLASH_MS, 1800);
  assert.equal(hitFlashRemaining(1000, 1000), 1800);
  assert.equal(hitFlashRemaining(1000, 1500), 1300);
  assert.equal(hitFlashRemaining(1000, 2800), 0);
  assert.equal(hitFlashRemaining(1000, 5000), 0);
  assert.equal(hitFlashRemaining(2000, 1000), 1800); // 時計のずれで受信が未来でも、全期間を超えない
  assert.equal(hitFlashRemaining(undefined, 1000), 1800);
});

test('mergePendingHit: 同じ区は強い方を残し、同じ強さなら新しい方', () => {
  const level = { ge3: 1, ge5: 2 };
  const a = { tier: 'ge5', startedAt: 1 };
  const b = { tier: 'ge3', startedAt: 2 };
  const c = { tier: 'ge3', startedAt: 3 };
  assert.equal(mergePendingHit(undefined, a, level), a);
  assert.equal(mergePendingHit(a, b, level), a);
  assert.equal(mergePendingHit(b, a, level), a);
  assert.equal(mergePendingHit(b, c, level), c);
});
