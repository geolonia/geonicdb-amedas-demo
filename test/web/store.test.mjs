import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWardStore, depthDelta1h, HOUR_MS } from '../../web/src/lib/store.js';
import { observation } from './helpers.mjs';

const WARDS = ['kita', 'kiyota'];
const at = (hhmm) => `2025-11-18T${hhmm}:00Z`;
const live = (ward, hhmm, attrs, extra = {}) => observation({ kind: 'live', ward, dateObserved: at(hhmm), attrs, ...extra });

test('live の通知で、区の値と時計を更新する', () => {
  const s = createWardStore(WARDS);
  assert.equal(s.clock(), null);
  const r = s.applyLive(live('kita', '03:00', { snowHeight: [26, at('03:00')], temperature: [-1.2, at('03:00')], windSpeed: [3.1, at('03:00')] }));
  assert.equal(r.ward, 'kita');
  assert.equal(r.snowHeight, 26);
  assert.equal(r.temperature, -1.2);
  assert.equal(r.windSpeed, 3.1);
  assert.equal(r.dateObserved, Date.parse(at('03:00')));
  assert.equal(s.clock(), Date.parse(at('03:00')));
  assert.equal(s.get('kita').snowHeight, 26);
  assert.equal(s.get('kiyota').snowHeight, null);
  assert.equal(s.get('nope'), null);
  assert.equal('history' in r, false);
});

test('条件付き購読の通知と、知らない区は反映しない', () => {
  const s = createWardStore(WARDS);
  assert.equal(s.applyLive(observation({ kind: 'ge5', ward: 'kita', dateObserved: at('03:00'), attrs: { snowHeight: [9, at('03:00')] } })), null);
  assert.equal(s.applyLive(live('chuo', '03:00', { snowHeight: [9, at('03:00')] })), null);
  assert.equal(s.clock(), null);
  assert.equal(s.get('kita').snowHeight, null);
});

test('気温の欠測: observedAt が1時間以上古ければ null(「—」で表示する)', () => {
  const s = createWardStore(WARDS);
  assert.equal(s.applyLive(live('kita', '03:10', { temperature: [-1, at('03:00')] })).temperature, -1);
  assert.equal(s.applyLive(live('kita', '04:00', { temperature: [-1, at('03:00')] })).temperature, null);
  assert.equal(s.applyLive(live('kita', '04:10', {})).temperature, null); // 属性がない
});

test('時計は最後に受けた live の dateObserved(setup のやり直しで戻る)', () => {
  const s = createWardStore(WARDS);
  s.applyLive(live('kita', '15:00', { snowHeight: [30, at('15:00')] }));
  // setup をやり直すと、再生の開始より前の観測時刻の通知が1件届く(inputs 6節)
  s.applyLive(live('kiyota', '02:40', { snowHeight: [0, at('02:40')] }));
  assert.equal(s.clock(), Date.parse(at('02:40')));
});

test('dateObserved のない通知は、時計を進めない', () => {
  const s = createWardStore(WARDS);
  s.applyLive(live('kita', '03:00', {}));
  s.applyLive(observation({ kind: 'live', ward: 'kita', attrs: { snowHeight: [5, at('09:00')] } }));
  assert.equal(s.clock(), Date.parse(at('03:00')));
  assert.equal(s.get('kita').snowHeight, 5);
});

test('snowfall1h: 正時の通知で newSnowfall、50分後まで値を保つ、1時間で消える', () => {
  const s = createWardStore(WARDS);
  const r0 = s.applyLive(live('kita', '07:00', { snowfall1h: [5, at('07:00')] }));
  assert.equal(r0.snowfall1h, 5);
  assert.equal(r0.newSnowfall, true);
  const r1 = s.applyLive(live('kita', '07:50', { snowfall1h: [5, at('07:00')] }));
  assert.equal(r1.snowfall1h, 5);
  assert.equal(r1.newSnowfall, false);
  // 08:00 の値が欠測(×)で書かれなかった場合
  assert.equal(s.applyLive(live('kita', '08:00', { snowfall1h: [5, at('07:00')] })).snowfall1h, null);
});

test('積雪深の1時間の増分', () => {
  const s = createWardStore(WARDS);
  const steps = [['02:00', 10], ['02:10', 11], ['02:20', 11], ['02:30', 12], ['02:40', 13], ['02:50', 14]];
  for (const [t, v] of steps) assert.equal(s.applyLive(live('kita', t, { snowHeight: [v, at(t)] })).snowDelta1h, null);
  assert.equal(s.applyLive(live('kita', '03:00', { snowHeight: [16, at('03:00')] })).snowDelta1h, 6);
  assert.equal(s.applyLive(live('kita', '03:10', { snowHeight: [15, at('03:10')] })).snowDelta1h, 4);
});

test('積雪深の増分: 時刻が戻ったら履歴を捨てる', () => {
  const s = createWardStore(WARDS);
  s.applyLive(live('kita', '02:00', { snowHeight: [10, at('02:00')] }));
  s.applyLive(live('kita', '01:00', { snowHeight: [0, at('01:00')] }));
  assert.equal(s.applyLive(live('kita', '02:00', { snowHeight: [10, at('02:00')] })).snowDelta1h, 10);
  // 03:00 の時点で、02:00 の値は 1件(やり直し後のもの)だけ
  assert.equal(s.applyLive(live('kita', '03:00', { snowHeight: [12, at('03:00')] })).snowDelta1h, 2);
});

test('depthDelta1h: ちょうど1時間前がなければ、30分さかのぼった範囲の最も新しい値', () => {
  const t = Date.parse(at('03:00'));
  const h = [[t - HOUR_MS - 20 * 60000, 4], [t - HOUR_MS - 10 * 60000, 5], [t - 30 * 60000, 9]];
  assert.equal(depthDelta1h(h, t, 8), 3);
  assert.equal(depthDelta1h([[t - HOUR_MS - 40 * 60000, 1]], t, 8), null);
  assert.equal(depthDelta1h(h, t, null), null);
  assert.equal(depthDelta1h(h, null, 8), null);
});

test('dateObserved が NaN / Infinity / null のとき、時計と区の時刻は変えない', () => {
  const s = createWardStore(WARDS);
  s.applyLive(live('kita', '03:00', { snowHeight: [26, at('03:00')] }));
  const t = Date.parse(at('03:00'));
  for (const bad of [NaN, Infinity, -Infinity, null]) {
    const r = s.applyLive({ ...live('kita', '04:00', { snowHeight: [27, at('04:00')] }), dateObserved: bad });
    assert.equal(s.clock(), t, String(bad));
    assert.equal(r.dateObserved, t, String(bad));
    assert.equal(s.get('kita').dateObserved, t, String(bad));
  }
  const fresh = createWardStore(WARDS);
  fresh.applyLive({ ...live('kita', '04:00', {}), dateObserved: NaN });
  assert.equal(fresh.clock(), null);
  assert.equal(fresh.get('kita').dateObserved, null);
});

test('Object.prototype のキーの区 ID は、知らない区として扱う', () => {
  const s = createWardStore(WARDS);
  for (const ward of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
    assert.equal(s.get(ward), null, ward);
    assert.equal(s.applyLive(live(ward, '03:00', { snowHeight: [1, at('03:00')] })), null, ward);
  }
  assert.equal(s.clock(), null);
  assert.equal(Object.keys(s.get('kita')).includes('constructor'), false);
});
