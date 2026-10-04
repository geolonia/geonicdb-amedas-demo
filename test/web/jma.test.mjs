import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseLatestTime, parsePoint, isFresh, widgetText, loadLatest, WIND_DIRECTIONS, LATEST_TIME_URL } from '../../web/src/lib/jma.js';

// 2026-10-04 に取得した実データ(https://www.jma.go.jp/bosai/amedas/data/point/14163/20261004_21.json)
const sample = JSON.parse(readFileSync(new URL('./fixtures/jma-point-14163-20261004_21.json', import.meta.url), 'utf8'));

test('latest_time.txt から、キーと3時間ごとのファイルの URL を作る', () => {
  assert.equal(LATEST_TIME_URL, 'https://www.jma.go.jp/bosai/amedas/data/latest_time.txt');
  assert.deepEqual(parseLatestTime('2026-10-04T21:00:00+09:00\n'), {
    key: '20261004210000',
    url: 'https://www.jma.go.jp/bosai/amedas/data/point/14163/20261004_21.json',
  });
  assert.equal(parseLatestTime('2026-10-04T20:50:00+09:00').url, 'https://www.jma.go.jp/bosai/amedas/data/point/14163/20261004_18.json');
  assert.equal(parseLatestTime('2026-10-05T02:10:00+09:00').url, 'https://www.jma.go.jp/bosai/amedas/data/point/14163/20261005_00.json');
});

test('latest_time.txt が想定外の形なら null', () => {
  for (const t of ['', '<html>', '2026-10-04T21:00:00Z', '2026-10-04 21:00', null, undefined]) assert.equal(parseLatestTime(t), null, String(t));
});

test('実データ: 気温と風を読み、積雪(品質が 0 でない)は読まない', () => {
  const p = parsePoint(sample, '20261004210000');
  assert.deepEqual(p, { time: '2026-10-04 21:00 JST', temperature: 12, wind: 0.9, windDirection: '南' });
  assert.equal('snow' in p, false);
  assert.equal(widgetText(p), '気温 12.0℃ ・ 風 南 0.9m/s');
});

test('latestKey 以前で最も新しい観測を使う', () => {
  const json = {
    '20261004180000': { temp: [15, 0], wind: [2, 0], windDirection: [16, 0] },
    '20261004181000': { temp: [14.5, 0], wind: [1.5, 0], windDirection: [0, 0] },
    '20261004182000': { temp: [14, 0], wind: [1, 0], windDirection: [4, 0] },
  };
  assert.equal(parsePoint(json, '20261004181000').temperature, 14.5);
  assert.equal(parsePoint(json, '20261004181000').windDirection, '静穏');
  assert.equal(parsePoint(json, '20261004235000').windDirection, '東');
  assert.equal(parsePoint(json).time, '2026-10-04 18:20 JST');
});

test('品質が 0 でない値と、壊れた値は使わない', () => {
  const p = parsePoint({ '20261004210000': { temp: [12, 1], wind: [3, 0], windDirection: [99, 0] } }, '20261004210000');
  assert.deepEqual(p, { time: '2026-10-04 21:00 JST', temperature: null, wind: 3, windDirection: null });
  assert.equal(widgetText(p), '気温 — ・ 風 3.0m/s');
});

test('想定外の形は null(ウィジェットを出さない)', () => {
  const cases = [null, 'x', [], {}, { foo: 1 }, { '20261004210000': null }, { '20261004210000': { temp: [null, 0], wind: ['1', 0] } }];
  for (const c of cases) assert.equal(parsePoint(c, '20261004210000'), null, JSON.stringify(c));
  // latestKey より新しいキーしかない
  assert.equal(parsePoint(sample, '20261004205000'), null);
});

test('16方位の表', () => {
  assert.equal(WIND_DIRECTIONS.length, 17);
  assert.equal(WIND_DIRECTIONS[8], '南');
  assert.equal(WIND_DIRECTIONS[16], '北');
});

// 取得の差し替え: URL ごとに応答を返す(タイマーを残さないよう、すぐに解決する)
const fakeFetch = (routes) => async (url) => {
  const r = routes[url];
  if (r instanceof Error) throw r;
  if (r === undefined) return { ok: false, status: 404, text: async () => 'not found' };
  return { ok: true, status: 200, text: async () => r };
};
const NOW = Date.parse('2026-10-04T21:05:00+09:00'); // 取得の差し替えテストの「いま」
const POINT_URL = 'https://www.jma.go.jp/bosai/amedas/data/point/14163/20261004_21.json';

test('loadLatest: latest_time → 点のファイルの順に取り、読んだ値を返す', async () => {
  const p = await loadLatest(fakeFetch({ [LATEST_TIME_URL]: '2026-10-04T21:00:00+09:00', [POINT_URL]: JSON.stringify(sample) }), { nowMs: NOW });
  assert.equal(p.temperature, 12);
});

test('loadLatest: どの失敗でも null(例外にしない)', async () => {
  assert.equal(await loadLatest(fakeFetch({}), { nowMs: NOW }), null); // 404
  assert.equal(await loadLatest(fakeFetch({ [LATEST_TIME_URL]: new TypeError('Failed to fetch') }), { nowMs: NOW }), null); // ネットワークなし
  assert.equal(await loadLatest(fakeFetch({ [LATEST_TIME_URL]: '<html>maintenance</html>' }), { nowMs: NOW }), null);
  assert.equal(await loadLatest(fakeFetch({ [LATEST_TIME_URL]: '2026-10-04T21:00:00+09:00' }), { nowMs: NOW }), null); // 点のファイルが 404
  assert.equal(await loadLatest(fakeFetch({ [LATEST_TIME_URL]: '2026-10-04T21:00:00+09:00', [POINT_URL]: '{broken' }), { nowMs: NOW }), null);
  assert.equal(await loadLatest(fakeFetch({ [LATEST_TIME_URL]: '2026-10-04T21:00:00+09:00', [POINT_URL]: '{"x":1}' }), { nowMs: NOW }), null);
});

test('isFresh: 観測時刻が新しければ true、3時間を超えて古い・未来・形が不正なら false', () => {
  const now = Date.parse('2026-10-05T01:50:00+09:00');
  assert.equal(isFresh('2026-10-05T01:40:00+09:00', now), true); // 10分前
  assert.equal(isFresh('2026-10-04T22:50:00+09:00', now), true); // ちょうど3時間
  assert.equal(isFresh('2026-10-04T22:49:59+09:00', now), false); // 3時間 + 1秒
  assert.equal(isFresh('2026-10-02T01:50:00+09:00', now), false); // 3日前
  assert.equal(isFresh('2026-10-05T02:50:00+09:00', now), false); // 未来 1時間
  assert.equal(isFresh('2026-10-05T01:59:00+09:00', now), true); // 9分先までは時計のずれとして許す
  for (const t of ['2026-10-05T01:40:00', '2026-10-05T01:40:00Z', 'x', '', null, undefined]) assert.equal(isFresh(t, now), false, String(t));
  assert.equal(isFresh('2026-10-05T01:40:00+09:00', NaN), false);
});

test('loadLatest: 観測時刻が古い(3日前)なら、値が読めても null', async () => {
  const fetchOld = fakeFetch({ [LATEST_TIME_URL]: '2026-10-04T21:00:00+09:00', [POINT_URL]: JSON.stringify(sample) });
  assert.equal(await loadLatest(fetchOld, { nowMs: NOW + 3 * 24 * 3600_000 }), null);
  assert.notEqual(await loadLatest(fetchOld, { nowMs: NOW }), null);
});
