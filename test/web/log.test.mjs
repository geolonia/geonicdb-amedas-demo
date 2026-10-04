import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boundPending } from '../../web/src/panels/log.js';

test('boundPending: 新しい方(末尾)から max 件だけ残し、古い方を捨てる', () => {
  const a = Array.from({ length: 500 }, (_, i) => i);
  const r = boundPending(a, 40);
  assert.equal(r, a, '渡した配列を直接変える');
  assert.equal(a.length, 40);
  assert.equal(a[0], 460);
  assert.equal(a.at(-1), 499);
});

test('boundPending: max 以下ならそのまま。既定は表示の最大行数(40)', () => {
  const a = [1, 2, 3];
  assert.deepEqual(boundPending(a, 3), [1, 2, 3]);
  const b = Array.from({ length: 41 }, (_, i) => i);
  assert.equal(boundPending(b).length, 40);
  assert.equal(b[0], 1);
});
