import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OBS_KEYS, packObservations, unpackObservations, summarizeMissing } from '../scripts/lib/observations.mjs';

const list = [
  { t: '2025-11-18T00:00:00Z', temperature: -1.5, snowHeight: 3, snowfall1h: 2 },
  { t: '2025-11-18T00:10:00Z', windSpeed: 1.2 },
];

test('保存形式は、欠測を null で持つ列指向の配列', () => {
  const packed = packObservations(list);
  assert.deepEqual(packed.columns, ['t', ...OBS_KEYS]);
  assert.deepEqual(packed.rows[0], ['2025-11-18T00:00:00Z', -1.5, null, null, null, 3, 2]);
  assert.deepEqual(packed.rows[1], ['2025-11-18T00:10:00Z', null, null, 1.2, null, null, null]);
});

test('pack → unpack で元に戻る(欠測はキーを持たない)', () => {
  assert.deepEqual(unpackObservations(packObservations(list)), list);
});

test('列が想定と違う保存データはエラー', () => {
  assert.throws(() => unpackObservations({ columns: ['t', 'x'], rows: [] }), /columns/);
});

test('欠測の集計: snowfall1h は正時の行だけを数える', () => {
  const rows = [
    { t: '2025-11-18T00:00:00Z', snowHeight: 1 },
    { t: '2025-11-18T00:10:00Z', snowHeight: 1 },
    { t: '2025-11-18T01:00:00Z', snowHeight: 1, snowfall1h: 0 },
  ];
  const s = summarizeMissing(rows);
  assert.equal(s.rows, 3);
  assert.equal(s.missing.snowfall1h, 1);
  assert.equal(s.missing.snowHeight, 0);
  assert.equal(s.missing.temperature, 3);
});
