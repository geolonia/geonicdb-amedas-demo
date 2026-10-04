import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WARDS } from '../scripts/lib/wards.mjs';
import { pointInGeometry } from '../scripts/lib/geo.mjs';

const stations = JSON.parse(readFileSync('data/stations.json', 'utf8'));
const wards = JSON.parse(readFileSync('data/wards.geojson', 'utf8'));

test('10区ぶんの観測地点が、区の表の順にある', () => {
  assert.deepEqual(stations.map((s) => s.ward), WARDS.map((w) => w.id));
});

test('各観測地点に、住所、座標、出典がある', () => {
  for (const s of stations) {
    assert.ok(s.station && s.address, `${s.ward}: 名称と住所が必要です`);
    assert.ok(s.sources?.address?.startsWith('http'), `${s.ward}: 住所の出典 URL が必要です`);
    assert.ok(s.sources?.coordinates, `${s.ward}: 座標の出典が必要です`);
    assert.equal(s.coordinates.length, 2);
  }
});

test('各観測地点の座標は、その区の境界の内側にある', () => {
  for (const s of stations) {
    const ward = wards.features.find((f) => f.properties.id === s.ward);
    assert.ok(pointInGeometry(s.coordinates, ward.geometry), `${s.ward}: 座標 ${s.coordinates} が区の外です`);
  }
});
