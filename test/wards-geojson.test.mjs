import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractWards } from '../scripts/prepare/wards-geojson.mjs';
import { WARDS } from '../scripts/lib/wards.mjs';

const feature = (code, name, coordinates) => ({
  type: 'Feature',
  properties: { N03_001: '北海道', N03_004: '札幌市', N03_005: name, N03_007: code },
  geometry: { type: 'Polygon', coordinates },
});
const ring = [[141.123456789, 43.123456789], [141.2, 43.1], [141.15, 43.2], [141.123456789, 43.123456789]];

const sample = () => ({
  type: 'FeatureCollection',
  features: [
    feature('01100', '札幌市(ノイズ)', [ring]),
    feature('01202', '函館市', [ring]),
    ...[...WARDS].reverse().map((w) => feature(w.code, w.name, [ring])),
  ],
});

test('札幌市10区だけを、区コードの順に取り出す', () => {
  const fc = extractWards(sample());
  assert.equal(fc.type, 'FeatureCollection');
  assert.deepEqual(fc.features.map((f) => f.properties.code), WARDS.map((w) => w.code));
  assert.deepEqual(fc.features[1].properties, { code: '01102', id: 'kita', name: '北区' });
});

test('座標を指定の桁数に丸める(既定は4桁)', () => {
  const fc = extractWards(sample());
  assert.deepEqual(fc.features[0].geometry.coordinates[0][0], [141.1235, 43.1235]);
  const fc6 = extractWards(sample(), { decimals: 6 });
  assert.deepEqual(fc6.features[0].geometry.coordinates[0][0], [141.123457, 43.123457]);
});

test('区が欠けていればエラー', () => {
  const s = sample();
  s.features = s.features.filter((f) => f.properties.N03_007 !== '01106');
  assert.throws(() => extractWards(s), /01106/);
});
