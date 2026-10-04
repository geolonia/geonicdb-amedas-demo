import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeMessage, kindOfTopic, readDateTime, wardOfEntityId, isNewSnowfall, freshValue, parsePayload,
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
  // observedAt が dateObserved より新しい(時刻の逆転)は、信用しない
  assert.equal(freshValue({ value: 1, observedAt: t + 1 }, t), null);
});
