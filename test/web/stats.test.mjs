import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStats, percentile } from '../../web/src/lib/stats.js';
import { percentile as smokePercentile } from '../../scripts/smoke/analyze.mjs';
import { observation } from './helpers.mjs';

const T0 = Date.parse('2026-10-04T09:00:00Z');
const liveAt = (receivedAt, latencyMs) =>
  observation({ kind: 'live', receivedAt, sentAt: latencyMs === null ? null : new Date(receivedAt - latencyMs).toISOString() });

test('percentile は smoke(analyze.mjs)と同じ値を返す', () => {
  const v = [5, 1, 9, 3, 7, 2, 8, 4, 6, 10, 11].sort((a, b) => a - b);
  for (const p of [0, 1, 50, 90, 95, 99, 100]) assert.equal(percentile(v, p), smokePercentile(v, p), `p=${p}`);
  assert.equal(percentile([], 50), null);
});

test('何も受けていないとき', () => {
  const s = createStats().snapshot(T0);
  assert.deepEqual(s, { total: 0, ratePerMin: 0, latency: { last: null, count: 0, median: null, p95: null, max: null }, cond: { ge5: 0, ge3: 0 } });
});

test('Stellio の既定(6秒に10件)で、約100件/分', () => {
  const st = createStats();
  for (let i = 0; i < 100; i++) st.recordLive(liveAt(T0 + i * 600, 400));
  const s = st.snapshot(T0 + 100 * 600);
  assert.equal(s.total, 100);
  assert.equal(Math.round(s.ratePerMin), 100);
});

test('受け始めの直後は、経過時間で割る(60秒で割って薄めない)', () => {
  const st = createStats();
  for (let i = 0; i < 10; i++) st.recordLive(liveAt(T0 + i * 600, 400));
  assert.equal(Math.round(st.snapshot(T0 + 6000).ratePerMin), 100);
});

test('setup の余分な通知のあと、間を空けて再生が始まっても、レートが薄まらない', () => {
  const st = createStats();
  st.recordLive(liveAt(T0, 50)); // setup のときの1件
  const start = T0 + 120_000; // 2分後に replay
  for (let i = 0; i < 50; i++) st.recordLive(liveAt(start + i * 600, 400));
  const s = st.snapshot(start + 50 * 600);
  assert.equal(Math.round(s.ratePerMin), 100);
  assert.equal(s.total, 51);
});

test('受信が止まれば、窓が過ぎたあとのレートは 0', () => {
  const st = createStats();
  for (let i = 0; i < 10; i++) st.recordLive(liveAt(T0 + i * 600, 400));
  assert.equal(st.snapshot(T0 + 5400 + 60_001).ratePerMin, 0);
});

test('遅延: 最新、中央値、p95、最大', () => {
  const st = createStats();
  const lat = [380, 390, 400, 410, 1980, 420, 430, 440, 450, 460];
  lat.forEach((l, i) => st.recordLive(liveAt(T0 + i * 600, l)));
  const { latency } = st.snapshot(T0 + 6000);
  assert.equal(latency.last, 460);
  assert.equal(latency.count, 10);
  assert.equal(latency.median, 420);
  assert.equal(latency.p95, 1980);
  assert.equal(latency.max, 1980);
});

test('sentAt のない通知は、件数とレートには入り、遅延には入らない', () => {
  const st = createStats();
  st.recordLive(liveAt(T0, null));
  const s = st.snapshot(T0 + 1000);
  assert.equal(s.total, 1);
  assert.equal(s.latency.count, 0);
  assert.equal(s.latency.last, null);
});

test('遅延のサンプルは上限の件数まで', () => {
  const st = createStats({ maxLatencySamples: 3 });
  [100, 200, 300, 400].forEach((l, i) => st.recordLive(liveAt(T0 + i, l)));
  const { latency } = st.snapshot(T0 + 10);
  assert.equal(latency.count, 3);
  assert.equal(latency.max, 400);
  assert.equal(latency.median, 300);
});

test('条件付き購読の通知をトピックごとに数える(live は数えない)', () => {
  const st = createStats();
  st.recordConditional(observation({ kind: 'ge5' }));
  st.recordConditional(observation({ kind: 'ge3' }));
  st.recordConditional(observation({ kind: 'ge3' }));
  st.recordConditional(observation({ kind: 'live' }));
  assert.deepEqual(st.snapshot(T0).cond, { ge5: 1, ge3: 2 });
});
