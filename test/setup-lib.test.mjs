import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDemoSubscription, setupDemo } from '../scripts/replayer/setup-lib.mjs';

const CTX = 'http://context/weather.jsonld';
const sub = (id, uri) => ({ id, notification: { endpoint: { uri } } });
const WARDS = [
  { ward: { id: 'chuo', name: '中央区' }, station: { coordinates: [141.3, 43.0] }, observations: [{ t: '2025-11-18T00:00:00Z', snowHeight: 1 }] },
  { ward: { id: 'kita', name: '北区' }, station: { coordinates: [141.3, 43.1] }, observations: [{ t: '2025-11-18T00:00:00Z', snowHeight: 2 }] },
];
const OPTS = { context: CTX, from: '2025-11-18T09:00:00+09:00', mqttBase: 'mqtt://mosquitto:1883', mqttVersion: 'mqtt5.0' };

// 要求を記録する偽のクライアント。del で、削除の応答(id ごと)を決める。
function fakeClient({ subs = [], delSub = () => 204, delEntity = () => 204 } = {}) {
  const calls = [];
  const res = (status, text = '') => ({ status, text });
  return {
    calls,
    listAllSubscriptions: async () => subs,
    deleteSubscription: async (id) => { calls.push(['DELETE sub', id]); return res(delSub(id), `body of ${id} `.repeat(40)); },
    deleteEntity: async (id) => { calls.push(['DELETE entity', id]); return res(delEntity(id), 'entity error'); },
    createEntity: async (e) => { calls.push(['POST entity', e.id]); return res(201); },
    createSubscription: async (s) => { calls.push(['POST sub', s.notification.endpoint.uri]); return res(201); },
  };
}
const kinds = (calls, kind) => calls.filter((c) => c[0] === kind).map((c) => c[1]);

test('isDemoSubscription: mqtt: か mqtts: で、パスが /amedas/ で始まる購読だけ', () => {
  assert.equal(isDemoSubscription(sub('a', 'mqtt://mosquitto:1883/amedas/live')), true);
  assert.equal(isDemoSubscription(sub('b', 'mqtts://broker:8883/amedas/cond/snowfall1h_ge5')), true);
  assert.equal(isDemoSubscription(sub('c', 'http://example.com/hook/amedas/live')), false);
  assert.equal(isDemoSubscription(sub('d', 'http://example.com/amedas/live')), false);
  assert.equal(isDemoSubscription(sub('e', 'mqtt://mosquitto:1883/other/amedas/live')), false);
  assert.equal(isDemoSubscription(sub('f', 'mqtt://mosquitto:1883/amedasX/live')), false);
  assert.equal(isDemoSubscription(sub('g', 'not a url /amedas/')), false);
  assert.equal(isDemoSubscription({ id: 'h' }), false);
});

test('setupDemo: このデモの購読だけを消し、エンティティを消して作り直し、購読を作る', async () => {
  const subs = [
    sub('urn:s:1', 'mqtt://mosquitto:1883/amedas/live'),
    sub('urn:s:2', 'http://example.com/amedas/live'),
    sub('urn:s:3', 'mqtts://b:8883/amedas/cond/snowfall1h_ge3'),
    sub('urn:s:4', 'mqtt://mosquitto:1883/other'),
  ];
  const client = fakeClient({ subs });
  await setupDemo({ client, wards: WARDS, ...OPTS, log: () => {} });
  assert.deepEqual(kinds(client.calls, 'DELETE sub'), ['urn:s:1', 'urn:s:3']);
  assert.deepEqual(kinds(client.calls, 'DELETE entity'), ['urn:ngsi-ld:WeatherObserved:sapporo-chuo', 'urn:ngsi-ld:WeatherObserved:sapporo-kita']);
  assert.deepEqual(kinds(client.calls, 'POST entity'), ['urn:ngsi-ld:WeatherObserved:sapporo-chuo', 'urn:ngsi-ld:WeatherObserved:sapporo-kita']);
  assert.equal(kinds(client.calls, 'POST sub').length, 3);
});

test('setupDemo: 削除の 404(すでにない)は成功として進む', async () => {
  const client = fakeClient({ subs: [sub('urn:s:1', 'mqtt://m:1883/amedas/live')], delSub: () => 404, delEntity: () => 404 });
  await setupDemo({ client, wards: WARDS, ...OPTS, log: () => {} });
  assert.equal(kinds(client.calls, 'POST entity').length, 2);
  assert.equal(kinds(client.calls, 'POST sub').length, 3);
});

for (const status of [403, 500]) {
  test(`setupDemo: 購読の削除が ${status} なら、何も作らずに、読みやすいエラーで止める`, async () => {
    const client = fakeClient({ subs: [sub('urn:s:1', 'mqtt://m:1883/amedas/live')], delSub: () => status });
    await assert.rejects(setupDemo({ client, wards: WARDS, ...OPTS, log: () => {} }), (e) => {
      assert.match(e.message, new RegExp(`購読.*urn:s:1.*mqtt://m:1883/amedas/live.*${status}`));
      assert.ok(e.message.includes('body of urn:s:1'));
      // 本文は先頭の 200 文字まで
      assert.ok(!e.message.includes(`body of urn:s:1 `.repeat(40)));
      return true;
    });
    assert.deepEqual(kinds(client.calls, 'POST entity'), []);
    assert.deepEqual(kinds(client.calls, 'POST sub'), []);
  });
}

test('setupDemo: エンティティの削除が失敗(403)したら、何も作らずに止める', async () => {
  const client = fakeClient({ delEntity: (id) => (id.endsWith('kita') ? 403 : 204) });
  await assert.rejects(setupDemo({ client, wards: WARDS, ...OPTS, log: () => {} }), /エンティティ.*sapporo-kita.*403 entity error/);
  assert.deepEqual(kinds(client.calls, 'POST entity'), []);
  assert.deepEqual(kinds(client.calls, 'POST sub'), []);
});
