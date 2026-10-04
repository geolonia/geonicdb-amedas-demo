import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attrProperty, sentAtProperty, buildEntity, buildSubscriptions, planWrite } from '../scripts/replayer/payload.mjs';

const CTX = 'http://context/weather.jsonld';

test('属性は、値、単位コード、観測時刻を持つ Property', () => {
  assert.deepEqual(attrProperty('snowHeight', 35, '2025-11-18T07:00:00Z'), {
    type: 'Property', value: 35, unitCode: 'CMT', observedAt: '2025-11-18T07:00:00Z',
  });
  assert.equal(attrProperty('temperature', -1, 't').unitCode, 'CEL');
  assert.equal(attrProperty('windDirection', 90, 't').unitCode, 'DEG');
});

test('sentAt は DateTime 型の Property', () => {
  assert.deepEqual(sentAtProperty('2026-11-28T01:00:00.123Z'), {
    type: 'Property', value: { '@type': 'DateTime', '@value': '2026-11-28T01:00:00.123Z' },
  });
});

test('エンティティ: ID、型、名前、位置、引き継いだ属性、sentAt を持つ', () => {
  const e = buildEntity({
    ward: { id: 'kita', name: '北区' },
    station: { coordinates: [141.35, 43.14] },
    context: CTX,
    attrs: { snowHeight: { value: 30, t: '2025-11-18T05:00:00Z' } },
    sentAt: '2026-10-05T00:00:00.000Z',
  });
  assert.equal(e['@context'], CTX);
  assert.equal(e.id, 'urn:ngsi-ld:WeatherObserved:sapporo-kita');
  assert.equal(e.type, 'WeatherObserved');
  assert.deepEqual(e.name, { type: 'Property', value: '北区' });
  assert.deepEqual(e.location, { type: 'GeoProperty', value: { type: 'Point', coordinates: [141.35, 43.14] } });
  assert.equal(e.snowHeight.value, 30);
  assert.equal(e.snowHeight.observedAt, '2025-11-18T05:00:00Z');
  assert.ok(e.sentAt);
});

test('購読は3本: 全件、5cm 以上、3cm 以上(条件付きは watchedAttributes を持つ)', () => {
  const subs = buildSubscriptions({ context: CTX, mqttBase: 'mqtt://mosquitto:1883', mqttVersion: 'mqtt5.0' });
  assert.deepEqual(
    subs.map((s) => s.notification.endpoint.uri),
    ['mqtt://mosquitto:1883/amedas/live', 'mqtt://mosquitto:1883/amedas/cond/snowfall1h_ge5', 'mqtt://mosquitto:1883/amedas/cond/snowfall1h_ge3'],
  );
  assert.equal(subs[0].q, undefined);
  // 書き込みごとに sentAt を更新するので、PATCH 1回につき通知は1回になる(属性ごとに通知するブローカーの負荷を減らす)。
  assert.deepEqual(subs[0].watchedAttributes, ['sentAt']);
  assert.equal(subs[1].q, 'snowfall1h>=5');
  assert.equal(subs[2].q, 'snowfall1h>=3');
  assert.deepEqual(subs[1].watchedAttributes, ['snowfall1h']);
  for (const s of subs) {
    assert.equal(s.type, 'Subscription');
    assert.deepEqual(s.entities, [{ type: 'WeatherObserved', idPattern: '^urn:ngsi-ld:WeatherObserved:sapporo-' }]);
    assert.equal(s.notification.format, 'normalized');
    assert.deepEqual(s.notification.endpoint.notifierInfo, [
      { key: 'MQTT-Version', value: 'mqtt5.0' },
      { key: 'MQTT-QoS', value: '0' },
    ]);
  }
});

test('MQTT の宛先の末尾の / は除く', () => {
  const subs = buildSubscriptions({ context: CTX, mqttBase: 'mqtt://host:1883/', mqttVersion: 'mqtt5.0' });
  assert.equal(subs[0].notification.endpoint.uri, 'mqtt://host:1883/amedas/live');
});

test('planWrite: すでにある属性は patch、まだない属性は append に分ける', () => {
  const obs = { t: '2025-11-18T00:00:00Z', temperature: -1, snowHeight: 3 };
  const { patch, append } = planWrite({ known: new Set(['snowHeight']), last: {}, obs, changedOnly: false });
  assert.deepEqual(Object.keys(patch), ['snowHeight']);
  assert.deepEqual(Object.keys(append), ['temperature']);
});

test('planWrite: 欠測の属性は、どちらにも入れない', () => {
  const { patch, append } = planWrite({ known: new Set(['temperature']), last: {}, obs: { t: 'x', snowHeight: 1 }, changedOnly: false });
  assert.deepEqual(Object.keys(patch), []);
  assert.deepEqual(Object.keys(append), ['snowHeight']);
});

test('planWrite(changedOnly): 前回と同じ値の属性を省く', () => {
  const known = new Set(['temperature', 'snowHeight']);
  const { patch } = planWrite({ known, last: { temperature: -1, snowHeight: 3 }, obs: { t: 'x', temperature: -1, snowHeight: 4 }, changedOnly: true });
  assert.deepEqual(Object.keys(patch), ['snowHeight']);
});

test('planWrite(changedOnly): snowfall1h は、値が同じでも毎回書く', () => {
  const known = new Set(['snowfall1h']);
  const { patch } = planWrite({ known, last: { snowfall1h: 5 }, obs: { t: 'x', snowfall1h: 5 }, changedOnly: true });
  assert.deepEqual(Object.keys(patch), ['snowfall1h']);
});

test('dateObserved は sentAt と同じ形の DateTime 型の Property', async () => {
  const { dateObservedProperty } = await import('../scripts/replayer/payload.mjs');
  assert.deepEqual(dateObservedProperty('2025-11-18T05:00:00Z'), {
    type: 'Property', value: { '@type': 'DateTime', '@value': '2025-11-18T05:00:00Z' },
  });
});

test('エンティティ: dateObserved は、引き継いだ属性の観測時刻のうち最も新しいもの。属性がなければ付けない', () => {
  const base = { ward: { id: 'kita', name: '北区' }, station: { coordinates: [141.35, 43.14] }, context: CTX, sentAt: '2026-10-05T00:00:00.000Z' };
  const e = buildEntity({
    ...base,
    attrs: {
      snowHeight: { value: 30, t: '2025-11-18T05:50:00Z' },
      snowfall1h: { value: 0, t: '2025-11-18T05:00:00Z' },
    },
  });
  assert.deepEqual(e.dateObserved, { type: 'Property', value: { '@type': 'DateTime', '@value': '2025-11-18T05:50:00Z' } });
  assert.equal(buildEntity({ ...base, attrs: {} }).dateObserved, undefined);
});
