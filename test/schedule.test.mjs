import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSteps, carryForward } from '../scripts/replayer/schedule.mjs';

const obs = (t, extra = {}) => ({ t, ...extra });
const byWard = new Map([
  ['chuo', [obs('2025-11-18T00:00:00Z', { snowHeight: 1 }), obs('2025-11-18T00:10:00Z', { snowHeight: 2 }), obs('2025-11-18T00:20:00Z', { snowHeight: 3 })]],
  ['kita', [obs('2025-11-18T00:00:00Z', { snowHeight: 5 }), obs('2025-11-18T00:20:00Z', { snowHeight: 7 })]],
]);

test('範囲内の時刻ごとに、区の順で書き込みを並べる(両端を含む)', () => {
  const steps = buildSteps(byWard, '2025-11-18T09:00:00+09:00', '2025-11-18T09:10:00+09:00');
  assert.deepEqual(steps.map((s) => s.t), ['2025-11-18T00:00:00Z', '2025-11-18T00:10:00Z']);
  assert.deepEqual(steps[0].writes.map((w) => w.ward), ['chuo', 'kita']);
});

test('ある区の行がないステップでは、その区を飛ばし、他の区は書く', () => {
  const steps = buildSteps(byWard, '2025-11-18T09:10:00+09:00', '2025-11-18T09:10:00+09:00');
  assert.equal(steps.length, 1);
  assert.deepEqual(steps[0].writes.map((w) => w.ward), ['chuo']);
});

test('範囲に観測値がなければ、分かりやすいエラーにする', () => {
  assert.throws(() => buildSteps(byWard, '2026-01-01T00:00:00+09:00', '2026-01-02T00:00:00+09:00'), /観測値がありません/);
});

test('carryForward: 指定時刻より前の、属性ごとの最後の値を、その観測時刻つきで返す', () => {
  const list = [
    obs('2025-11-18T00:00:00Z', { temperature: -1, snowfall1h: 2 }),
    obs('2025-11-18T00:10:00Z', { temperature: -2 }),
    obs('2025-11-18T00:20:00Z', { temperature: -3 }),
  ];
  const c = carryForward(list, '2025-11-18T00:20:00Z');
  assert.deepEqual(c, {
    temperature: { value: -2, t: '2025-11-18T00:10:00Z' },
    snowfall1h: { value: 2, t: '2025-11-18T00:00:00Z' },
  });
});

test('carryForward: 前の観測がなければ空', () => {
  assert.deepEqual(carryForward([obs('2025-11-18T00:00:00Z', { temperature: 1 })], '2025-11-18T00:00:00Z'), {});
});
