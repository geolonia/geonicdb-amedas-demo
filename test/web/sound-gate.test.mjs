import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isFresh, createChimeLimiter } from '../../web/src/lib/sound-gate.js';

test('isFresh: 受信から 2 秒以内だけ新しい', () => {
  assert.equal(isFresh(1000, 2500), true);
  assert.equal(isFresh(1000, 3000), true);
  assert.equal(isFresh(1000, 3001), false);
  assert.equal(isFresh(undefined, 3000), false);
  assert.equal(isFresh(null, 3000), false);
});

test('limiter: ge3 は 250ms に1回まで', () => {
  const l = createChimeLimiter();
  assert.equal(l.admit('ge3', 0), true);
  assert.equal(l.admit('ge3', 100), false);
  assert.equal(l.admit('ge3', 250), true);
});

test('limiter: ge5 は間引かれない(同時数の上限まで)', () => {
  const l = createChimeLimiter({ maxVoices: 3 });
  assert.equal(l.admit('ge3', 0), true);
  assert.equal(l.admit('ge5', 1), true);
  assert.equal(l.admit('ge5', 2), true);
  assert.equal(l.admit('ge5', 3), true); // ge5 は上限+1 まで
  assert.equal(l.admit('ge5', 4), false);
});

test('limiter: 同時数の上限(ge3 は maxVoices まで)。終わったら空く', () => {
  const l = createChimeLimiter({ minGapMs: 0, maxVoices: 3, durationMs: 900 });
  assert.equal(l.admit('ge3', 0), true);
  assert.equal(l.admit('ge3', 1), true);
  assert.equal(l.admit('ge3', 2), true);
  assert.equal(l.admit('ge3', 3), false);
  assert.equal(l.admit('ge3', 901), true);
});

test('limiter: 大量に流しても同時に鳴る数が上限を超えない', () => {
  const l = createChimeLimiter();
  let played = 0;
  for (let i = 0; i < 300; i++) if (l.admit(i % 2 ? 'ge5' : 'ge3', i * 2)) played++;
  assert.ok(played <= 4, `played=${played}`);
});
