import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHub, EVENTS } from '../../web/src/lib/hub.js';

test('登録した順に呼ぶ', () => {
  const hub = createHub();
  const seen = [];
  hub.on('live', (x) => seen.push(['a', x]));
  hub.on('live', (x) => seen.push(['b', x]));
  hub.emit('live', 1);
  hub.emit('tick', 2);
  assert.deepEqual(seen, [['a', 1], ['b', 1]]);
});

test('1つが例外を投げても、残りは呼ばれる', () => {
  const errors = [];
  const hub = createHub({ onError: (e) => errors.push(e.message) });
  let called = false;
  hub.on('hit', () => {
    throw new Error('boom');
  });
  hub.on('hit', () => {
    called = true;
  });
  hub.emit('hit', {});
  assert.equal(called, true);
  assert.deepEqual(errors, ['boom']);
});

test('未知のイベントは登録で拒む', () => {
  assert.throws(() => createHub().on('nope', () => {}), /未知のイベント/);
  assert.deepEqual([...EVENTS], ['live', 'conditional', 'hit', 'tick', 'layout']);
});
