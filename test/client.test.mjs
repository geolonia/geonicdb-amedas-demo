import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient, ok } from '../scripts/replayer/client.mjs';

function fake(responses = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, ...init });
    const r = responses[`${init.method} ${new URL(url).pathname}`] ?? { status: 204, body: '' };
    return { status: r.status, text: async () => r.body ?? '' };
  };
  return { calls, fetchImpl };
}
const base = { apiBase: 'http://b/ngsi-ld/v1', context: 'http://context/weather.jsonld' };

test('エンティティの作成は application/ld+json で、@context はボディに入れる(Link は付けない)', async () => {
  const { calls, fetchImpl } = fake();
  await createClient({ ...base, fetchImpl }).createEntity({ '@context': 'x', id: 'urn:a', type: 'T' });
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].url, 'http://b/ngsi-ld/v1/entities');
  assert.equal(calls[0].headers['Content-Type'], 'application/ld+json');
  assert.equal(calls[0].headers.Link, undefined);
});

test('属性の更新は application/json で、@context は Link ヘッダーで渡す', async () => {
  const { calls, fetchImpl } = fake();
  await createClient({ ...base, fetchImpl }).patchAttrs('urn:ngsi-ld:X:1', { a: { type: 'Property', value: 1 } });
  assert.equal(calls[0].method, 'PATCH');
  assert.equal(calls[0].url, 'http://b/ngsi-ld/v1/entities/urn%3Angsi-ld%3AX%3A1/attrs');
  assert.equal(calls[0].headers['Content-Type'], 'application/json');
  assert.equal(calls[0].headers.Link, '<http://context/weather.jsonld>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"');
});

test('属性の追加は POST /entities/{id}/attrs', async () => {
  const { calls, fetchImpl } = fake();
  await createClient({ ...base, fetchImpl }).appendAttrs('urn:a', { a: { type: 'Property', value: 1 } });
  assert.equal(calls[0].method, 'POST');
  assert.ok(calls[0].url.endsWith('/entities/urn%3Aa/attrs'));
});

test('テナントを指定したときだけ NGSILD-Tenant ヘッダーを付ける', async () => {
  const a = fake();
  await createClient({ ...base, tenant: 'demo', fetchImpl: a.fetchImpl }).deleteEntity('urn:a');
  assert.equal(a.calls[0].headers['NGSILD-Tenant'], 'demo');
  const b = fake();
  await createClient({ ...base, fetchImpl: b.fetchImpl }).deleteEntity('urn:a');
  assert.equal(b.calls[0].headers['NGSILD-Tenant'], undefined);
});

test('購読の一覧は JSON として返す', async () => {
  const { fetchImpl } = fake({ 'GET /ngsi-ld/v1/subscriptions': { status: 200, body: '[{"id":"urn:s"}]' } });
  const r = await createClient({ ...base, fetchImpl }).listSubscriptions();
  assert.deepEqual(r.json, [{ id: 'urn:s' }]);
});

test('ok(): 2xx だけが成功。207(一部失敗)と 4xx/5xx は失敗', () => {
  assert.equal(ok({ status: 204 }), true);
  assert.equal(ok({ status: 201 }), true);
  assert.equal(ok({ status: 207 }), false);
  assert.equal(ok({ status: 404 }), false);
  assert.equal(ok({ status: 500 }), false);
});

test('リクエストには AbortSignal(タイムアウト)を渡す', async () => {
  const { calls, fetchImpl } = fake();
  await createClient({ ...base, fetchImpl }).deleteEntity('urn:a');
  assert.ok(calls[0].signal instanceof AbortSignal);
});

test('応答しない fetch は、timeoutMs 経過後に reject される', async () => {
  const fetchImpl = (url, init) =>
    new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason)));
  await assert.rejects(createClient({ ...base, timeoutMs: 20, fetchImpl }).deleteEntity('urn:a'));
});
