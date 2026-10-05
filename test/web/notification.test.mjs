import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_ENTITIES_PER_MESSAGE, normalizeMessage, kindOfTopic, readDateTime, wardOfEntityId, isNewSnowfall, freshValue, parsePayload, BOUNDS,
  TOPIC_LIVE, TOPIC_GE5, TOPIC_GE3, SUBSCRIBE_TOPICS,
} from '../../web/src/lib/notification.js';
import { entity, stellioMessage, bareMessage } from './helpers.mjs';

const WARDS = new Set(['chuo', 'kita', 'higashi', 'shiroishi', 'toyohira', 'minami', 'nishi', 'atsubetsu', 'teine', 'kiyota']);
const kita0300 = entity({
  ward: 'kita',
  dateObserved: '2025-11-18T03:00:00Z',
  sentAt: '2026-10-04T08:45:01.136Z',
  attrs: { snowHeight: [26, '2025-11-18T03:00:00Z'], snowfall1h: [2, '2025-11-18T03:00:00Z'], temperature: [-1.2, '2025-11-18T03:00:00Z'] },
});

test('トピックの種別と購読するトピック', () => {
  assert.equal(kindOfTopic(TOPIC_LIVE), 'live');
  assert.equal(kindOfTopic(TOPIC_GE5), 'ge5');
  assert.equal(kindOfTopic(TOPIC_GE3), 'ge3');
  assert.equal(kindOfTopic('amedas/cond/other'), null);
  assert.equal(kindOfTopic('amedas/live/x'), null);
  assert.deepEqual([...SUBSCRIBE_TOPICS], ['amedas/live', 'amedas/cond/#']);
});

test('Stellio の封筒({body, metadata})を読む', () => {
  const [o, ...rest] = normalizeMessage(TOPIC_LIVE, stellioMessage(kita0300), 1000, WARDS);
  assert.equal(rest.length, 0);
  assert.equal(o.kind, 'live');
  assert.equal(o.ward, 'kita');
  assert.equal(o.receivedAt, 1000);
  assert.equal(o.sentAt, Date.parse('2026-10-04T08:45:01.136Z'));
  assert.equal(o.dateObserved, Date.parse('2025-11-18T03:00:00Z'));
  assert.deepEqual(o.attrs.snowHeight, { value: 26, observedAt: Date.parse('2025-11-18T03:00:00Z') });
  assert.equal(o.attrs.windSpeed, null);
});

test('封筒のない通知も同じ結果になる', () => {
  const a = normalizeMessage(TOPIC_LIVE, stellioMessage(kita0300), 5, WARDS);
  const b = normalizeMessage(TOPIC_LIVE, bareMessage(kita0300), 5, WARDS);
  assert.deepEqual(a, b);
});

test('Uint8Array(ブラウザーの mqtt.js)でも読む', () => {
  const bytes = new TextEncoder().encode(bareMessage(kita0300));
  assert.equal(normalizeMessage(TOPIC_GE3, bytes, 0, WARDS)[0].kind, 'ge3');
});

test('data の配列の全件を返す(1件とは限らない)', () => {
  const chuo = entity({ ward: 'chuo', dateObserved: '2025-11-18T03:00:00Z', sentAt: '2026-10-04T08:45:00Z' });
  const out = normalizeMessage(TOPIC_LIVE, stellioMessage(kita0300, chuo), 0, WARDS);
  assert.deepEqual(out.map((o) => o.ward), ['kita', 'chuo']);
});

test('想定外の形は、例外にせず無視する', () => {
  const cases = [
    'not json', '', 'null', '42', '[]', '{}', '{"body":null}', '{"data":"x"}', '{"data":[null, 1, "a"]}',
    JSON.stringify({ data: [{ id: 'urn:ngsi-ld:WeatherObserved:other-1' }] }),
    JSON.stringify({ data: [{ id: 'urn:ngsi-ld:WeatherObserved:sapporo-unknown' }] }),
  ];
  for (const c of cases) assert.deepEqual(normalizeMessage(TOPIC_LIVE, c, 0, WARDS), [], c);
  assert.deepEqual(normalizeMessage('other/topic', bareMessage(kita0300), 0, WARDS), []);
});

test('wardIds を省略すると、ID の形だけで判定する', () => {
  const e = entity({ ward: 'zzz', dateObserved: '2025-11-18T03:00:00Z' });
  assert.equal(normalizeMessage(TOPIC_LIVE, bareMessage(e), 0)[0].ward, 'zzz');
});

test('値が数でない属性は null(欠測の扱い)', () => {
  const e = entity({ ward: 'kita', dateObserved: '2025-11-18T03:00:00Z' });
  e.temperature = { type: 'Property', value: '×', observedAt: '2025-11-18T03:00:00Z' };
  e.snowHeight = { type: 'Property', value: null };
  const [o] = normalizeMessage(TOPIC_LIVE, bareMessage(e), 0, WARDS);
  assert.equal(o.attrs.temperature, null);
  assert.equal(o.attrs.snowHeight, null);
});

test('sentAt や dateObserved がなければ null', () => {
  const e = entity({ ward: 'kita', attrs: { snowHeight: [3, '2025-11-18T03:00:00Z'] } });
  const [o] = normalizeMessage(TOPIC_LIVE, bareMessage(e), 0, WARDS);
  assert.equal(o.sentAt, null);
  assert.equal(o.dateObserved, null);
});

test('readDateTime: 通知の形、書き込みの形、文字列、壊れた値', () => {
  const t = Date.parse('2026-10-04T08:45:01.136Z');
  assert.equal(readDateTime({ value: { type: 'DateTime', '@value': '2026-10-04T08:45:01.136Z' } }), t);
  assert.equal(readDateTime({ value: { '@type': 'DateTime', '@value': '2026-10-04T08:45:01.136Z' } }), t);
  assert.equal(readDateTime({ value: '2026-10-04T08:45:01.136Z' }), t);
  assert.equal(readDateTime({ value: 'yesterday' }), null);
  assert.equal(readDateTime({ value: 5 }), null);
  assert.equal(readDateTime(undefined), null);
});

test('wardOfEntityId', () => {
  assert.equal(wardOfEntityId('urn:ngsi-ld:WeatherObserved:sapporo-atsubetsu'), 'atsubetsu');
  assert.equal(wardOfEntityId('urn:ngsi-ld:WeatherObserved:sapporo-kita:x'), null);
  assert.equal(wardOfEntityId(undefined), null);
});

test('parsePayload は読めなければ null', () => {
  assert.equal(parsePayload('{'), null);
  assert.deepEqual(parsePayload('{"a":1}'), { a: 1 });
});

test('isNewSnowfall: observedAt が dateObserved と一致するときだけ新しい', () => {
  const [hourly] = normalizeMessage(TOPIC_LIVE, bareMessage(kita0300), 0, WARDS);
  assert.equal(isNewSnowfall(hourly), true);
  // 10分後の live の通知には、前の正時の snowfall1h がそのまま入っている(inputs 5節)
  const next = entity({ ward: 'kita', dateObserved: '2025-11-18T03:10:00Z', attrs: { snowfall1h: [2, '2025-11-18T03:00:00Z'] } });
  const [o] = normalizeMessage(TOPIC_LIVE, bareMessage(next), 0, WARDS);
  assert.equal(isNewSnowfall(o), false);
  const noDate = entity({ ward: 'kita', attrs: { snowfall1h: [2, '2025-11-18T03:00:00Z'] } });
  assert.equal(isNewSnowfall(normalizeMessage(TOPIC_LIVE, bareMessage(noDate), 0, WARDS)[0]), false);
});

test('freshValue: 1時間より古い値は欠測として null', () => {
  const t = Date.parse('2025-11-18T16:10:00Z');
  assert.equal(freshValue({ value: -1.6, observedAt: Date.parse('2025-11-18T16:00:00Z') }, t), -1.6);
  assert.equal(freshValue({ value: -1.6, observedAt: Date.parse('2025-11-18T15:10:00Z') }, t), null);
  assert.equal(freshValue({ value: -1.6, observedAt: Date.parse('2025-11-18T15:20:00Z') }, t), -1.6);
  assert.equal(freshValue({ value: 1, observedAt: null }, t), 1);
  assert.equal(freshValue({ value: 1, observedAt: t }, null), 1);
  assert.equal(freshValue(null, t), null);
  assert.equal(freshValue({ value: 1, observedAt: t }, undefined), 1);
  // observedAt が dateObserved より新しい(時刻の逆転)は、信用しない
  assert.equal(freshValue({ value: 1, observedAt: t + 1 }, t), null);
});

test('readDateTime: 明示的なゾーンつきの ISO 8601 だけ受ける', () => {
  const z = Date.parse('2025-11-18T03:00:00Z');
  assert.equal(readDateTime({ value: '2025-11-18T03:00:00Z' }), z);
  assert.equal(readDateTime({ value: '2025-11-18T03:00:00.5Z' }), z + 500);
  assert.equal(readDateTime({ value: '2025-11-18T03:00:00.123456789Z' }), z + 123);
  assert.equal(readDateTime({ value: '2025-11-18T12:00:00+09:00' }), z);
  assert.equal(readDateTime({ value: { type: 'DateTime', '@value': '2025-11-18T12:00:00+09:00' } }), z);
  for (const bad of ['2025', '5', 'Nov 18 2025', '2025-11-18T03:00:00', '2025-11-18 03:00:00Z', '', '1999-12-31T23:59:59Z',
    '2101-01-01T00:00:00Z', '2025-13-40T25:61:61Z']) {
    assert.equal(readDateTime({ value: bad }), null, bad);
    assert.equal(readDateTime({ value: { type: 'DateTime', '@value': bad } }), null, `@value ${bad}`);
    assert.equal(readDateTime({ value: { '@type': 'DateTime', '@value': bad } }), null, `@type ${bad}`);
  }
  for (const bad of [null, 0, true, [], {}, { '@value': 5 }]) assert.equal(readDateTime({ value: bad }), null);
  assert.equal(readDateTime({ value: '2000-01-01T00:00:00Z' }), Date.UTC(2000, 0, 1));
  assert.equal(readDateTime({ value: '2100-12-31T23:59:59Z' }), Date.UTC(2100, 11, 31, 23, 59, 59));
});

test('属性値の妥当な範囲: 範囲外は欠測(null)、丸めない', () => {
  assert.ok(Object.isFrozen(BOUNDS));
  const read = (attr, v) => normalizeMessage(TOPIC_LIVE, bareMessage(entity({ dateObserved: '2025-11-18T03:00:00Z', attrs: { [attr]: [v, '2025-11-18T03:00:00Z'] } })), 0)[0].attrs[attr];
  const cases = { temperature: [-80, 60], snowHeight: [0, 1000], snowfall1h: [0, 100], windSpeed: [0, 100], windDirection: [0, 360], precipitation: [0, 500] };
  for (const [k, [lo, hi]] of Object.entries(cases)) {
    assert.deepEqual(BOUNDS[k], [lo, hi]);
    assert.equal(read(k, lo).value, lo, `${k} min`);
    assert.equal(read(k, hi).value, hi, `${k} max`);
    assert.equal(read(k, lo - 0.001), null, `${k} below`);
    assert.equal(read(k, hi + 0.001), null, `${k} above`);
    assert.equal(read(k, 1e308), null, `${k} 1e308`);
    assert.equal(read(k, -1e308), null, `${k} -1e308`);
  }
  assert.equal(read('snowHeight', -0).value, 0);
  assert.equal(read('snowHeight', null), null);
});

test('observedAt も厳密に読む(ゾーンなし・年だけは null、値は残す)', () => {
  const mk = (t) => normalizeMessage('amedas/live', bareMessage(entity({ attrs: { snowHeight: [26, t] } })), 0)[0].attrs.snowHeight;
  assert.deepEqual(mk('2025-11-18T03:00:00'), { value: 26, observedAt: null });
  assert.deepEqual(mk('2025'), { value: 26, observedAt: null });
  assert.deepEqual(mk('2025-11-18T03:00:00Z'), { value: 26, observedAt: Date.parse('2025-11-18T03:00:00Z') });
});

test('1通あたり最大 50 件まで処理する', () => {
  const list = Array.from({ length: 3000 }, () => entity({ attrs: { snowHeight: [1, '2025-11-18T03:00:00Z'] } }));
  assert.equal(MAX_ENTITIES_PER_MESSAGE, 50);
  assert.equal(normalizeMessage('amedas/live', JSON.stringify({ data: list }), 0).length, 50);
});

test('readDateTime: 存在しない日付(月末、閏年)と範囲外の時分秒は null、24:00 は受けない', () => {
  const ok = (v) => readDateTime({ value: v });
  for (const bad of ['2025-02-30T03:00:00Z', '2025-02-29T03:00:00Z', '2025-04-31T00:00:00Z', '2026-06-31T00:00:00Z',
    '2100-02-29T00:00:00Z', '2025-11-18T24:00:00Z', '2025-11-18T23:60:00Z', '2025-11-18T23:00:60Z', '2025-00-10T00:00:00Z',
    '2025-01-00T00:00:00Z', '2025-11-18T03:00:00+24:00', '2025-11-18T03:00:00+09:60']) {
    assert.equal(ok(bad), null, bad);
  }
  assert.equal(ok('2024-02-29T03:00:00Z'), Date.UTC(2024, 1, 29, 3)); // 閏年
  assert.equal(ok('2000-02-29T00:00:00Z'), Date.UTC(2000, 1, 29)); // 400 で割れる年は閏年
  assert.equal(ok('2025-02-28T23:59:59Z'), Date.UTC(2025, 1, 28, 23, 59, 59));
  assert.equal(ok('2025-04-30T00:00:00Z'), Date.UTC(2025, 3, 30));
  assert.equal(ok('2025-12-31T23:59:59Z'), Date.UTC(2025, 11, 31, 23, 59, 59));
});
