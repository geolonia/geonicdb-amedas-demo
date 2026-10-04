import { test } from 'node:test';
import assert from 'node:assert/strict';
import { percentile, latencyStats, coverage, notificationKeys } from '../scripts/smoke/analyze.mjs';

test('percentile: 最近傍法', () => {
  const v = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  assert.equal(percentile(v, 50), 50);
  assert.equal(percentile(v, 95), 100);
  assert.equal(percentile(v, 0), 10);
});

test('latencyStats: 件数、中央値、p95、最大', () => {
  assert.deepEqual(latencyStats([30, 10, 20]), { count: 3, median: 20, p95: 30, max: 30 });
  assert.deepEqual(latencyStats([]), { count: 0, median: null, p95: null, max: null });
});

test('coverage: 送った書き込みのうち、通知に現れなかったものを返す', () => {
  const r = coverage(new Set(['a|1', 'b|2', 'c|3']), new Set(['a|1', 'c|3', 'x|9']));
  assert.deepEqual(r.missing, ['b|2']);
});

const entity = (id, sentAt) => ({ id, type: 'WeatherObserved', sentAt: { type: 'Property', value: { '@type': 'DateTime', '@value': sentAt } } });

test('notificationKeys: 封筒(body)つきの通知から、(ID, sentAt)を取り出す', () => {
  const msg = { body: { type: 'Notification', data: [entity('urn:a', '2026-10-05T00:00:00.001Z')] }, metadata: {} };
  assert.deepEqual(notificationKeys(msg), [{ key: 'urn:a|2026-10-05T00:00:00.001Z', sentAt: '2026-10-05T00:00:00.001Z' }]);
});

test('notificationKeys: 封筒のない通知にも対応し、値が文字列の sentAt も読む', () => {
  const msg = { type: 'Notification', data: [{ id: 'urn:b', sentAt: { type: 'Property', value: '2026-10-05T00:00:01.000Z' } }] };
  assert.deepEqual(notificationKeys(msg), [{ key: 'urn:b|2026-10-05T00:00:01.000Z', sentAt: '2026-10-05T00:00:01.000Z' }]);
});

test('notificationKeys: sentAt のないエンティティは除く', () => {
  assert.deepEqual(notificationKeys({ body: { data: [{ id: 'urn:c' }] } }), []);
});

test('notificationKeys: 想定外の形(null、配列でない data、null のエンティティ)でも例外を投げず、読めるものだけ返す', () => {
  assert.deepEqual(notificationKeys(null), []);
  assert.deepEqual(notificationKeys(42), []);
  assert.deepEqual(notificationKeys('text'), []);
  assert.deepEqual(notificationKeys({ body: null }), []);
  assert.deepEqual(notificationKeys({ data: { id: 'urn:x' } }), []);
  assert.deepEqual(notificationKeys({ body: { data: [null, 7, { id: 'urn:ok', sentAt: { value: '2026-10-05T00:00:00.000Z' } }] } }), [
    { key: 'urn:ok|2026-10-05T00:00:00.000Z', sentAt: '2026-10-05T00:00:00.000Z' },
  ]);
});
