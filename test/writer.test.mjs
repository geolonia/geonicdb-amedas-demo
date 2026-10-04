import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWriter } from '../scripts/replayer/writer.mjs';

const ID = 'urn:ngsi-ld:WeatherObserved:sapporo-chuo';
const NOW = Date.parse('2026-10-05T00:00:00.000Z');

// 要求を記録する偽のクライアント。status で、要求の種類ごとの応答を決める(関数なら例外を投げられる)。
function fakeClient({ patch = 204, append = 204 } = {}) {
  const calls = [];
  const respond = (s) => (typeof s === 'function' ? s() : { status: s, text: '' });
  return {
    calls,
    patchAttrs: async (id, attrs) => { calls.push(['PATCH', id, attrs]); return respond(patch); },
    appendAttrs: async (id, attrs) => { calls.push(['POST', id, attrs]); return respond(append); },
  };
}
const newState = (known = [], last = {}) => new Map([['chuo', { known: new Set(known), last: { ...last } }]]);
const lines = () => {
  const out = [];
  return { out, write: (s) => out.push(JSON.parse(s)) };
};

test('(a) まだない属性の append を先に送り、sentAt は最後の PATCH だけに付ける', async () => {
  const client = fakeClient();
  const state = newState(['snowHeight']);
  const write = createWriter({ client, state, changedOnly: false, now: () => NOW });
  const ok = await write('chuo', { t: '2025-11-10T00:00:00Z', snowHeight: 3, temperature: -1 }, 't0');
  assert.equal(ok, true);
  assert.deepEqual(client.calls.map((c) => c[0]), ['POST', 'PATCH']);
  const [post, patch] = client.calls;
  assert.equal(post[1], ID);
  assert.deepEqual(Object.keys(post[2]), ['temperature']);
  assert.equal(post[2].sentAt, undefined);
  assert.deepEqual(Object.keys(patch[2]).sort(), ['sentAt', 'snowHeight']);
  assert.equal(patch[2].sentAt.value['@value'], '2026-10-05T00:00:00.000Z');
});

test('(a) 更新が append だけのときも、sentAt だけの PATCH を必ず送る(live の購読のきっかけ)', async () => {
  const client = fakeClient();
  const write = createWriter({ client, state: newState([]), changedOnly: false, now: () => NOW });
  assert.equal(await write('chuo', { t: 'x', temperature: -1 }, 't0'), true);
  assert.deepEqual(client.calls.map((c) => c[0]), ['POST', 'PATCH']);
  assert.deepEqual(Object.keys(client.calls[1][2]), ['sentAt']);
});

test('append がなければ、PATCH を1回だけ送る', async () => {
  const client = fakeClient();
  const write = createWriter({ client, state: newState(['temperature']), changedOnly: false, now: () => NOW });
  assert.equal(await write('chuo', { t: 'x', temperature: -1 }, 't0'), true);
  assert.deepEqual(client.calls.map((c) => c[0]), ['PATCH']);
});

test('(b) append が失敗したら、PATCH を送らずに失敗を返し、known と last を変えない', async () => {
  const client = fakeClient({ append: 500 });
  const state = newState(['snowHeight'], { snowHeight: 1 });
  const log = lines();
  const write = createWriter({ client, state, changedOnly: false, log, now: () => NOW });
  assert.equal(await write('chuo', { t: 'x', snowHeight: 3, temperature: -1 }, 't0'), false);
  assert.deepEqual(client.calls.map((c) => c[0]), ['POST']);
  assert.deepEqual([...state.get('chuo').known], ['snowHeight']);
  assert.deepEqual(state.get('chuo').last, { snowHeight: 1 });
  assert.equal(log.out.length, 1);
  assert.equal(log.out[0].status, 500);
});

test('(c) PATCH が失敗したら、失敗を返し、known と last を変えない', async () => {
  const client = fakeClient({ patch: 404 });
  const state = newState(['snowHeight'], { snowHeight: 1 });
  const log = lines();
  const write = createWriter({ client, state, changedOnly: false, log, now: () => NOW });
  assert.equal(await write('chuo', { t: 'x', snowHeight: 3, temperature: -1 }, 't0'), false);
  assert.deepEqual([...state.get('chuo').known], ['snowHeight']);
  assert.deepEqual(state.get('chuo').last, { snowHeight: 1 });
  assert.equal(log.out[0].status, 404);
});

test('(d) 成功したときだけ、known と last を更新する(sentAt は last に入れない)。ログに id、ward、t、sentAt、status を書く', async () => {
  const client = fakeClient();
  const state = newState(['snowHeight'], { snowHeight: 1 });
  const log = lines();
  const write = createWriter({ client, state, changedOnly: false, log, now: () => NOW });
  assert.equal(await write('chuo', { t: 'x', snowHeight: 3, temperature: -1 }, 't0'), true);
  assert.deepEqual([...state.get('chuo').known].sort(), ['snowHeight', 'temperature']);
  assert.deepEqual(state.get('chuo').last, { snowHeight: 3, temperature: -1 });
  assert.deepEqual(log.out, [{ id: ID, ward: 'chuo', t: 't0', sentAt: '2026-10-05T00:00:00.000Z', status: 204 }]);
});

test('(e) 例外のときは、status: "error" の行をログに書いて、例外を投げ直す', async () => {
  const client = fakeClient({ patch: () => { throw new Error('ECONNREFUSED'); } });
  const state = newState(['snowHeight'], { snowHeight: 1 });
  const log = lines();
  const write = createWriter({ client, state, changedOnly: false, log, now: () => NOW });
  await assert.rejects(() => write('chuo', { t: 'x', snowHeight: 3 }, 't0'), /ECONNREFUSED/);
  assert.equal(log.out.length, 1);
  assert.equal(log.out[0].status, 'error');
  assert.equal(log.out[0].id, ID);
  assert.deepEqual(state.get('chuo').last, { snowHeight: 1 });
});

test('(f) changedOnly でも、snowfall1h は毎回書き、sentAt は常に付ける', async () => {
  const client = fakeClient();
  const state = newState(['snowHeight', 'snowfall1h'], { snowHeight: 3, snowfall1h: 0 });
  const write = createWriter({ client, state, changedOnly: true, now: () => NOW });
  assert.equal(await write('chuo', { t: 'x', snowHeight: 3, snowfall1h: 0 }, 't0'), true);
  assert.deepEqual(client.calls.map((c) => c[0]), ['PATCH']);
  assert.deepEqual(Object.keys(client.calls[0][2]).sort(), ['sentAt', 'snowfall1h']);
  // 変わった値がまったくなくても、sentAt だけの PATCH を送る
  client.calls.length = 0;
  assert.equal(await write('chuo', { t: 'y', snowHeight: 3 }, 't1'), true);
  assert.deepEqual(Object.keys(client.calls[0][2]), ['sentAt']);
});
