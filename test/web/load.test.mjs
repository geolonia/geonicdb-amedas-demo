import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadJson } from '../../web/src/lib/load.js';

const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => JSON.parse(body) });

test('200 なら JSON を返す', async () => {
  assert.deepEqual(await loadJson('/a.json', async () => res(200, '{"x":1}')), { x: 1 });
});

test('404 ならエラー', async () => {
  await assert.rejects(loadJson('/a.json', async () => res(404, '')), { message: '/a.json を読めませんでした(HTTP 404)' });
});

test('本文が JSON でなければエラー(cause に元の例外)', async () => {
  await assert.rejects(loadJson('/a.json', async () => res(200, '<html>')), (e) => {
    assert.equal(e.message, '/a.json を JSON として読めませんでした');
    assert.ok(e.cause instanceof Error);
    return true;
  });
});

test('fetch の reject を伝える', async () => {
  await assert.rejects(
    loadJson('/a.json', async () => {
      throw new TypeError('network');
    }),
    { message: 'network' },
  );
});
