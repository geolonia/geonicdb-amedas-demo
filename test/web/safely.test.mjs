import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safely } from '../../web/src/lib/safely.js';

test('safely: 例外は onError に渡し、外へ投げない', () => {
  const errs = [];
  assert.doesNotThrow(() => safely(() => { throw new Error('x'); }, (e) => errs.push(e.message)));
  assert.deepEqual(errs, ['x']);
  assert.equal(safely(() => 5, () => {}), 5);
});
