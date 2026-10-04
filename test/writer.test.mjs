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
// setup が作るエンティティ(引き継ぐ観測値があるとき)は、dateObserved をすでに持つ。
const withObserved = (known = []) => [...known, 'dateObserved'];
const lines = () => {
  const out = [];
  return { out, write: (s) => out.push(JSON.parse(s)) };
};

test('(a) まだない属性の append を先に送り、sentAt は最後の PATCH だけに付ける', async () => {
  const client = fakeClient();
  const state = newState(withObserved(['snowHeight']));
  const write = createWriter({ client, state, changedOnly: false, now: () => NOW });
  const ok = await write('chuo', { t: '2025-11-10T00:00:00Z', snowHeight: 3, temperature: -1 }, 't0');
  assert.equal(ok, true);
  assert.deepEqual(client.calls.map((c) => c[0]), ['POST', 'PATCH']);
  const [post, patch] = client.calls;
  assert.equal(post[1], ID);
  assert.deepEqual(Object.keys(post[2]), ['temperature']);
  assert.equal(post[2].sentAt, undefined);
  assert.deepEqual(Object.keys(patch[2]).sort(), ['dateObserved', 'sentAt', 'snowHeight']);
  assert.equal(patch[2].sentAt.value['@value'], '2026-10-05T00:00:00.000Z');
});

test('(a) 更新が append だけのときも、sentAt だけの PATCH を必ず送る(live の購読のきっかけ)', async () => {
  const client = fakeClient();
  const write = createWriter({ client, state: newState(withObserved()), changedOnly: false, now: () => NOW });
  assert.equal(await write('chuo', { t: 'x', temperature: -1 }, 't0'), true);
  assert.deepEqual(client.calls.map((c) => c[0]), ['POST', 'PATCH']);
  assert.deepEqual(Object.keys(client.calls[1][2]).sort(), ['dateObserved', 'sentAt']);
});

test('append がなければ、PATCH を1回だけ送る', async () => {
  const client = fakeClient();
  const write = createWriter({ client, state: newState(withObserved(['temperature'])), changedOnly: false, now: () => NOW });
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

test('(c) append が成功して PATCH が失敗したら、失敗を返すが、append した属性は known と last に残す(次の書き込みで append し直さない)', async () => {
  let patchStatus = 404;
  const client = fakeClient({ patch: () => ({ status: patchStatus, text: '' }) });
  const state = newState(['snowHeight'], { snowHeight: 1 });
  const log = lines();
  const write = createWriter({ client, state, changedOnly: false, log, now: () => NOW });
  assert.equal(await write('chuo', { t: 'x', snowHeight: 3, temperature: -1 }, 't0'), false);
  assert.deepEqual(client.calls.map((c) => c[0]), ['POST', 'PATCH']);
  // append はブローカーに反映済み。PATCH した snowHeight の値は、失敗したので last に入れない
  assert.deepEqual([...state.get('chuo').known].sort(), ['dateObserved', 'snowHeight', 'temperature']);
  assert.deepEqual(state.get('chuo').last, { snowHeight: 1, temperature: -1 });
  assert.equal(log.out[0].status, 404);
  // 次の書き込みは、同じ属性を append し直さず、PATCH だけを送る
  patchStatus = 204;
  client.calls.length = 0;
  assert.equal(await write('chuo', { t: 'y', snowHeight: 4, temperature: -2 }, 't1'), true);
  assert.deepEqual(client.calls.map((c) => c[0]), ['PATCH']);
  assert.deepEqual(Object.keys(client.calls[0][2]).sort(), ['dateObserved', 'sentAt', 'snowHeight', 'temperature']);
  assert.deepEqual(state.get('chuo').last, { snowHeight: 4, temperature: -2 });
});

test('(c) changedOnly で PATCH が失敗しても、append した値を last に残し、次のステップで同じ値を書き直さない', async () => {
  let patchStatus = 500;
  const client = fakeClient({ patch: () => ({ status: patchStatus, text: '' }) });
  const state = newState(withObserved(['snowHeight']), { snowHeight: 1 });
  const write = createWriter({ client, state, changedOnly: true, now: () => NOW });
  assert.equal(await write('chuo', { t: 'x', snowHeight: 1, temperature: -1 }, 't0'), false);
  patchStatus = 204;
  client.calls.length = 0;
  assert.equal(await write('chuo', { t: 'y', snowHeight: 1, temperature: -1 }, 't1'), true);
  assert.deepEqual(client.calls.map((c) => c[0]), ['PATCH']);
  assert.deepEqual(Object.keys(client.calls[0][2]).sort(), ['dateObserved', 'sentAt']);
});

test('(d) 成功したら、append と PATCH の値を known と last に記録する(sentAt は last に入れない)。ログに id、ward、t、sentAt、status を書く', async () => {
  const client = fakeClient();
  const state = newState(withObserved(['snowHeight']), { snowHeight: 1 });
  const log = lines();
  const write = createWriter({ client, state, changedOnly: false, log, now: () => NOW });
  assert.equal(await write('chuo', { t: 'x', snowHeight: 3, temperature: -1 }, 't0'), true);
  assert.deepEqual([...state.get('chuo').known].sort(), ['dateObserved', 'snowHeight', 'temperature']);
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
  // PATCH の前の append(dateObserved)は成功しているので、known に残す
  assert.deepEqual([...state.get('chuo').known].sort(), ['dateObserved', 'snowHeight']);
});

test('(f) changedOnly でも、snowfall1h は毎回書き、sentAt は常に付ける', async () => {
  const client = fakeClient();
  const state = newState(withObserved(['snowHeight', 'snowfall1h']), { snowHeight: 3, snowfall1h: 0 });
  const write = createWriter({ client, state, changedOnly: true, now: () => NOW });
  assert.equal(await write('chuo', { t: 'x', snowHeight: 3, snowfall1h: 0 }, 't0'), true);
  assert.deepEqual(client.calls.map((c) => c[0]), ['PATCH']);
  assert.deepEqual(Object.keys(client.calls[0][2]).sort(), ['dateObserved', 'sentAt', 'snowfall1h']);
  // 変わった値がまったくなくても、sentAt(と dateObserved)だけの PATCH を送る
  client.calls.length = 0;
  assert.equal(await write('chuo', { t: 'y', snowHeight: 3 }, 't1'), true);
  assert.deepEqual(Object.keys(client.calls[0][2]).sort(), ['dateObserved', 'sentAt']);
});

const dateObserved = (t) => ({ type: 'Property', value: { '@type': 'DateTime', '@value': t } });

test('(g) sentAt を付けた最後の PATCH には、毎回 dateObserved(そのステップの観測時刻)も付ける', async () => {
  const client = fakeClient();
  const state = newState(['snowHeight', 'dateObserved']);
  const write = createWriter({ client, state, changedOnly: false, now: () => NOW });
  assert.equal(await write('chuo', { t: '2025-11-18T00:10:00Z', snowHeight: 3, temperature: -1 }, 't0'), true);
  assert.deepEqual(client.calls.map((c) => c[0]), ['POST', 'PATCH']);
  assert.equal(client.calls[0][2].dateObserved, undefined);
  assert.deepEqual(client.calls[1][2].dateObserved, dateObserved('2025-11-18T00:10:00Z'));
  // dateObserved は last に入れない
  assert.equal(state.get('chuo').last.dateObserved, undefined);
});

test('(g) changedOnly で、変わった値がまったくないステップでも、PATCH に dateObserved を付ける', async () => {
  const client = fakeClient();
  const state = newState(['snowHeight', 'dateObserved'], { snowHeight: 3 });
  const write = createWriter({ client, state, changedOnly: true, now: () => NOW });
  assert.equal(await write('chuo', { t: '2025-11-07T17:50:00Z', snowHeight: 3 }, 't1'), true);
  assert.deepEqual(client.calls.map((c) => c[0]), ['PATCH']);
  assert.deepEqual(Object.keys(client.calls[0][2]).sort(), ['dateObserved', 'sentAt']);
  assert.deepEqual(client.calls[0][2].dateObserved, dateObserved('2025-11-07T17:50:00Z'));
});

test('(g) エンティティに dateObserved がまだなければ、append で追加し、PATCH にも付ける', async () => {
  const client = fakeClient();
  const state = newState(['snowHeight']);
  const write = createWriter({ client, state, changedOnly: false, now: () => NOW });
  assert.equal(await write('chuo', { t: '2025-11-18T00:10:00Z', snowHeight: 3 }, 't0'), true);
  assert.deepEqual(client.calls.map((c) => c[0]), ['POST', 'PATCH']);
  assert.deepEqual(client.calls[0][2], { dateObserved: dateObserved('2025-11-18T00:10:00Z') });
  assert.deepEqual(client.calls[1][2].dateObserved, dateObserved('2025-11-18T00:10:00Z'));
  assert.ok(state.get('chuo').known.has('dateObserved'));
  // 次の書き込みでは append しない
  client.calls.length = 0;
  assert.equal(await write('chuo', { t: '2025-11-18T00:20:00Z', snowHeight: 3 }, 't1'), true);
  assert.deepEqual(client.calls.map((c) => c[0]), ['PATCH']);
});

test('initialState: setup と同じ規則で、エンティティにある属性(観測値があれば dateObserved も)と直前の値を作る', async () => {
  const { initialState } = await import('../scripts/replayer/writer.mjs');
  const wards = [
    { ward: { id: 'chuo' }, observations: [{ t: '2025-11-18T00:00:00Z', snowHeight: 1 }, { t: '2025-11-18T00:10:00Z', snowHeight: 2, temperature: -1 }] },
    { ward: { id: 'kita' }, observations: [{ t: '2025-11-18T01:00:00Z', snowHeight: 5 }] },
  ];
  const st = initialState(wards, '2025-11-18T00:30:00Z');
  assert.deepEqual([...st.get('chuo').known].sort(), ['dateObserved', 'snowHeight', 'temperature']);
  assert.deepEqual(st.get('chuo').last, { snowHeight: 2, temperature: -1 });
  assert.deepEqual([...st.get('kita').known], []);
  assert.deepEqual(st.get('kita').last, {});
});
