import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connectFeed } from '../../web/src/mqtt-feed.js';

test('connectFeed: connect が例外を投げても、status error と使える戻り値を返す', () => {
  const statuses = [];
  const origError = console.error;
  console.error = () => {};
  try {
    const feed = connectFeed({
      url: 'ws://x', wardIds: new Set(), onObservations: () => {}, onStatus: (s) => statuses.push(s),
      connect: () => { throw new Error('boom'); },
    });
    assert.deepEqual(statuses, ['connecting', 'error']);
    assert.doesNotThrow(() => feed.end());
  } finally {
    console.error = origError;
  }
});
