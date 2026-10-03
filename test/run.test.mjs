import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runReplay } from '../scripts/replayer/run.mjs';

// 偽の時計: sleep が時刻を進める。write は 1ms かかるものとして時刻を進める。
function fakeClock() {
  let t = 1_000_000;
  return { now: () => t, sleep: async (ms) => { t += ms; }, advance: (ms) => { t += ms; } };
}
const steps = (n, wards = ['a', 'b']) =>
  Array.from({ length: n }, (_, i) => ({ t: `t${i}`, writes: wards.map((ward) => ({ ward, obs: { t: `t${i}` } })) }));

test('ステップは intervalMs の間隔で、区は順に1つずつ書く(並列にしない)', async () => {
  const clock = fakeClock();
  const calls = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const write = async (ward, obs) => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    calls.push([clock.now(), ward, obs.t]);
    await Promise.resolve();
    inFlight--;
    return true;
  };
  const stats = await runReplay({ steps: steps(3), intervalMs: 1000, write, ...clock });
  assert.equal(maxInFlight, 1);
  assert.deepEqual(calls.map((c) => c[1] + c[2]), ['at0', 'bt0', 'at1', 'bt1', 'at2', 'bt2']);
  assert.deepEqual(calls.map((c) => c[0]), [1_000_000, 1_000_000, 1_001_000, 1_001_000, 1_002_000, 1_002_000]);
  assert.deepEqual(stats, { writes: 6, failed: 0, steps: 3 });
});

test('書き込みに時間がかかっても、ステップの時刻は遅れを累積させない', async () => {
  const clock = fakeClock();
  const starts = [];
  const write = async (ward, obs) => {
    if (ward === 'a') starts.push([obs.t, clock.now()]);
    clock.advance(300);
    return true;
  };
  await runReplay({ steps: steps(3), intervalMs: 1000, write, ...clock });
  assert.deepEqual(starts.map((s) => s[1]), [1_000_000, 1_001_000, 1_002_000]);
});

test('遅れが大きいときは警告する', async () => {
  const clock = fakeClock();
  const warns = [];
  const write = async () => { clock.advance(5000); return true; };
  await runReplay({ steps: steps(3, ['a']), intervalMs: 1000, write, onWarn: (m) => warns.push(m), ...clock });
  assert.ok(warns.length >= 1);
});

test('連続して5回失敗したら中断する', async () => {
  const clock = fakeClock();
  let n = 0;
  const write = async () => { n++; return false; };
  await assert.rejects(() => runReplay({ steps: steps(10), intervalMs: 1000, write, ...clock }), /連続 5 回/);
  assert.equal(n, 5);
});

test('成功が挟まれば、連続の失敗は数え直す', async () => {
  const clock = fakeClock();
  let n = 0;
  const write = async () => { n++; return n % 3 === 0; };
  const stats = await runReplay({ steps: steps(4), intervalMs: 10, write, ...clock });
  // 8 回の書き込みのうち、n が 3 の倍数(3、6)だけが成功する。失敗は 6 回で、連続は最大 2 回。
  assert.equal(stats.steps, 4);
  assert.equal(stats.writes, 2);
  assert.equal(stats.failed, 6);
});

test('write が例外を投げても、失敗として数える(プロセスを落とさない)', async () => {
  const clock = fakeClock();
  const write = async () => { throw new Error('ECONNREFUSED'); };
  await assert.rejects(() => runReplay({ steps: steps(10), intervalMs: 10, write, ...clock }), /連続 5 回/);
});
