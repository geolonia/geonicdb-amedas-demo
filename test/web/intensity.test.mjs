import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snowIntensity, canvasScale, approach, spawnCount } from '../../web/src/lib/intensity.js';

test('降雪量 5cm で最大、2cm で 0.4', () => {
  assert.equal(snowIntensity({ snowfall1h: 5, temperature: -1 }), 1);
  assert.equal(snowIntensity({ snowfall1h: 8, temperature: -1 }), 1);
  assert.equal(snowIntensity({ snowfall1h: 2, temperature: -1 }), 0.4);
});

test('積雪深の増分が降雪量より大きければ、増分を使う。減少は 0', () => {
  assert.equal(snowIntensity({ snowfall1h: 1, snowDelta1h: 3, temperature: 0 }), 0.6);
  assert.equal(snowIntensity({ snowfall1h: 0, snowDelta1h: -4, temperature: 0 }), 0);
});

test('気温が 3℃ を超えると 0。ちょうど 3℃ は降る', () => {
  assert.equal(snowIntensity({ snowfall1h: 5, temperature: 3.1 }), 0);
  assert.equal(snowIntensity({ snowfall1h: 5, temperature: 3 }), 1);
});

test('気温が欠測(null)なら、降雪の値だけで決める', () => {
  assert.equal(snowIntensity({ snowfall1h: 5, temperature: null }), 1);
  assert.equal(snowIntensity({ snowfall1h: null, snowDelta1h: null, temperature: null }), 0);
  assert.equal(snowIntensity(), 0);
});

test('canvas の倍率は 1.5 まで', () => {
  assert.equal(canvasScale(1), 1);
  assert.equal(canvasScale(2), 1.5);
  assert.equal(canvasScale(3), 1.5);
  assert.equal(canvasScale(1.25), 1.25);
  assert.equal(canvasScale(undefined), 1);
  assert.equal(canvasScale(0), 1);
});

test('approach: 目標へ近づき、行き過ぎない', () => {
  assert.ok(Math.abs(approach(0, 1, 0.1) - 0.15) < 1e-9);
  assert.equal(approach(0, 1, 10), 1);
  assert.equal(approach(1, 0, -1), 1);
});

test('spawnCount: 端数を持ち越す、弱すぎれば 0', () => {
  assert.deepEqual(spawnCount(1, 1 / 60, 0, 120), { count: 2, carry: 0 });
  const a = spawnCount(0.5, 1 / 60, 0, 120);
  assert.equal(a.count, 1);
  const b = spawnCount(0.5, 1 / 60, a.carry, 120);
  assert.equal(a.count + b.count, 2);
  assert.deepEqual(spawnCount(0.01, 1, 0.5), { count: 0, carry: 0 });
});
