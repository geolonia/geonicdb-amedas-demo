import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHitDeduper, nextHitOrder } from '../../web/src/lib/dedupe.js';
import { observation } from './helpers.mjs';

const T = '2025-11-17T22:00:00Z'; // 北区 07:00 JST、5cm
const hit = (kind, extra = {}) =>
  observation({ kind, ward: 'kita', dateObserved: T, attrs: { snowfall1h: [5, T], snowHeight: [20, T] }, ...extra });

test('ge5 → ge3 → live(Stellio の順): ge5 を出し、ge3 と live は無視する', () => {
  const d = createHitDeduper();
  const a = d.offer(hit('ge5'));
  assert.equal(a.action, 'show');
  assert.equal(a.tier, 'ge5');
  assert.equal(a.ward, 'kita');
  assert.equal(a.value, 5);
  assert.equal(a.key, `kita|${Date.parse(T)}`);
  assert.equal(d.offer(hit('ge3')).action, 'ignore');
  assert.equal(d.offer(hit('live')).action, 'ignore');
});

test('ge3 → ge5(逆の順): ge3 を出し、ge5 で置き換える', () => {
  const d = createHitDeduper();
  assert.equal(d.offer(hit('ge3')).action, 'show');
  const up = d.offer(hit('ge5'));
  assert.equal(up.action, 'upgrade');
  assert.equal(up.tier, 'ge5');
  assert.equal(up.key, `kita|${Date.parse(T)}`);
  assert.equal(d.offer(hit('ge3')).action, 'ignore');
  assert.equal(d.offer(hit('ge5')).action, 'ignore');
});

test('live → ge3(live が先に届いても): live は演出を出さず、ge3 で出す', () => {
  const d = createHitDeduper();
  assert.deepEqual(d.offer(hit('live')), { action: 'ignore', reason: 'not-conditional' });
  assert.equal(d.offer(hit('ge3')).action, 'show');
});

test('同じ区でも、観測時刻が違えば別のヒット', () => {
  const d = createHitDeduper();
  const T2 = '2025-11-18T00:00:00Z';
  assert.equal(d.offer(hit('ge5')).action, 'show');
  const later = observation({ kind: 'ge5', ward: 'kita', dateObserved: T2, attrs: { snowfall1h: [5, T2] } });
  assert.equal(d.offer(later).action, 'show');
});

test('同じ時刻でも、区が違えば別のヒット', () => {
  const d = createHitDeduper();
  const T3 = '2025-11-18T05:00:00Z';
  const h = observation({ kind: 'ge5', ward: 'higashi', dateObserved: T3, attrs: { snowfall1h: [5, T3] } });
  const t = observation({ kind: 'ge5', ward: 'teine', dateObserved: T3, attrs: { snowfall1h: [5, T3] } });
  assert.equal(d.offer(h).action, 'show');
  assert.equal(d.offer(t).action, 'show');
});

test('snowfall1h がない、または正時の値でない条件の通知は無視する', () => {
  const d = createHitDeduper();
  assert.equal(d.offer(observation({ kind: 'ge3', dateObserved: T })).reason, 'no-snowfall');
  const stale = observation({ kind: 'ge3', dateObserved: '2025-11-17T22:10:00Z', attrs: { snowfall1h: [3, T] } });
  assert.equal(d.offer(stale).reason, 'stale');
});

test('dateObserved のない条件の通知は、snowfall1h の観測時刻で集約する', () => {
  const d = createHitDeduper();
  const o = (kind) => observation({ kind, attrs: { snowfall1h: [5, T] } });
  assert.equal(d.offer(o('ge3')).action, 'show');
  assert.equal(d.offer(o('ge5')).action, 'upgrade');
});

test('キーは件数の上限で古い順に捨てる(タイマーを使わない)', () => {
  const d = createHitDeduper({ maxKeys: 2 });
  const at = (h) => {
    const t = `2025-11-18T0${h}:00:00Z`;
    return observation({ kind: 'ge3', dateObserved: t, attrs: { snowfall1h: [3, t] } });
  };
  d.offer(at(1));
  d.offer(at(2));
  d.offer(at(3));
  assert.equal(d.size(), 2);
  assert.equal(d.offer(at(1)).action, 'show'); // 捨てたキーは、また出る
});

test('同じ書き込みでも、60秒より後に届いたら(setup をやり直した再生)もう一度出す', () => {
  const d = createHitDeduper();
  assert.equal(d.offer(hit('ge5', { receivedAt: 0 })).action, 'show');
  assert.equal(d.offer(hit('ge3', { receivedAt: 430 })).action, 'ignore');
  const again = d.offer(hit('ge5', { receivedAt: 120_000 }));
  assert.equal(again.action, 'show');
  assert.equal(again.tier, 'ge5');
  assert.equal(d.offer(hit('ge3', { receivedAt: 120_430 })).action, 'ignore');
});

test('やり直した再生で弱い方が先に届いても、強い方で置き換える', () => {
  const d = createHitDeduper();
  d.offer(hit('ge5', { receivedAt: 0 }));
  assert.equal(d.offer(hit('ge3', { receivedAt: 90_000 })).action, 'show');
  assert.equal(d.offer(hit('ge5', { receivedAt: 90_005 })).action, 'upgrade');
});

test('nextHitOrder: 新しいヒットは先頭、上限を超えた分と、やり直しの古い行は消す', () => {
  const show = (key) => ({ action: 'show', key });
  let r = nextHitOrder([], show('a'), 2);
  assert.deepEqual(r, { keys: ['a'], removed: [] });
  r = nextHitOrder(['a'], show('b'), 2);
  assert.deepEqual(r, { keys: ['b', 'a'], removed: [] });
  r = nextHitOrder(['b', 'a'], show('c'), 2);
  assert.deepEqual(r, { keys: ['c', 'b'], removed: ['a'] });
  // やり直した再生: 同じキーの古い行を消して、先頭に新しい行を出す
  r = nextHitOrder(['c', 'b'], show('b'), 2);
  assert.deepEqual(r, { keys: ['b', 'c'], removed: ['b'] });
  // upgrade は並びを変えない
  assert.deepEqual(nextHitOrder(['b', 'c'], { action: 'upgrade', key: 'c' }, 2), { keys: ['b', 'c'], removed: [] });
});

test('nextHitOrder: 弱い方の行が押し出されたあとの upgrade は、先頭に出し直す', () => {
  let keys = [];
  keys = nextHitOrder(keys, { action: 'show', key: 'w' }, 8).keys;
  for (let i = 0; i < 8; i++) keys = nextHitOrder(keys, { action: 'show', key: `k${i}` }, 8).keys;
  assert.equal(keys.includes('w'), false);
  const r = nextHitOrder(keys, { action: 'upgrade', key: 'w' }, 8);
  assert.equal(r.keys[0], 'w');
  assert.equal(r.keys.length, 8);
  assert.deepEqual(r.removed, ['k0']);
});
