import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pointInGeometry } from '../scripts/lib/geo.mjs';

const square = { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] };
const withHole = {
  type: 'Polygon',
  coordinates: [
    [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
    [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]],
  ],
};
const multi = {
  type: 'MultiPolygon',
  coordinates: [square.coordinates, [[[20, 20], [30, 20], [30, 30], [20, 30], [20, 20]]]],
};

test('多角形の内側と外側を判定する', () => {
  assert.equal(pointInGeometry([5, 5], square), true);
  assert.equal(pointInGeometry([11, 5], square), false);
});

test('穴の中は外側として扱う', () => {
  assert.equal(pointInGeometry([5, 5], withHole), false);
  assert.equal(pointInGeometry([2, 2], withHole), true);
});

test('MultiPolygon はどれかに含まれればよい', () => {
  assert.equal(pointInGeometry([25, 25], multi), true);
  assert.equal(pointInGeometry([15, 15], multi), false);
});

test('Polygon と MultiPolygon 以外はエラー', () => {
  assert.throws(() => pointInGeometry([0, 0], { type: 'Point', coordinates: [0, 0] }), /未対応/);
});
