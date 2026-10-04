import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyObservation, notifiedEntity, notificationMessage, topicsForWrite, TOPIC } from '../scripts/fake-notify/messages.mjs';
import { normalizeMessage, isNewSnowfall } from '../web/src/lib/notification.js';

const ward = { id: 'kita', name: '北区' };
const station = { coordinates: [141.3517, 43.13982] };

test('applyObservation: 書いた属性だけ観測時刻が新しくなる', () => {
  const a0 = applyObservation({}, { t: '2025-11-18T03:00:00Z', snowHeight: 26, snowfall1h: 2 });
  const a1 = applyObservation(a0, { t: '2025-11-18T03:10:00Z', snowHeight: 27 });
  assert.deepEqual(a1.snowHeight, { value: 27, t: '2025-11-18T03:10:00Z' });
  assert.deepEqual(a1.snowfall1h, { value: 2, t: '2025-11-18T03:00:00Z' });
  assert.equal(a0.snowHeight.value, 26); // 元の状態は変えない
});

test('通知の形は、地図アプリの正規化でそのまま読める(封筒あり・なし)', () => {
  const attrs = applyObservation({}, { t: '2025-11-18T03:00:00Z', snowHeight: 26, snowfall1h: 2 });
  const e = notifiedEntity({ ward, station, attrs, dateObserved: '2025-11-18T03:00:00Z', sentAt: '2026-10-04T08:45:01.136Z' });
  assert.deepEqual(e.sentAt, { type: 'Property', value: { type: 'DateTime', '@value': '2026-10-04T08:45:01.136Z' } });
  for (const bare of [false, true]) {
    const msg = notificationMessage(e, { bare, seq: 1, notifiedAt: '2026-10-04T08:45:01.200Z' });
    assert.equal('body' in msg, !bare);
    const [o] = normalizeMessage(TOPIC.live, JSON.stringify(msg), 0);
    assert.equal(o.ward, 'kita');
    assert.equal(o.attrs.snowHeight.value, 26);
    assert.equal(isNewSnowfall(o), true);
  }
});

test('topicsForWrite: 順序の3つの型と、条件の判定', () => {
  const five = { t: '2025-11-17T22:00:00Z', snowfall1h: 5 };
  assert.deepEqual(topicsForWrite(five), [TOPIC.ge5, TOPIC.ge3, TOPIC.live]);
  assert.deepEqual(topicsForWrite(five, 'weak-first'), [TOPIC.ge3, TOPIC.ge5, TOPIC.live]);
  assert.deepEqual(topicsForWrite(five, 'live-first'), [TOPIC.live, TOPIC.ge5, TOPIC.ge3]);
  assert.deepEqual(topicsForWrite({ snowfall1h: 4 }), [TOPIC.ge3, TOPIC.live]);
  assert.deepEqual(topicsForWrite({ snowfall1h: 2 }), [TOPIC.live]);
  assert.deepEqual(topicsForWrite({ snowHeight: 9 }), [TOPIC.live]);
});
