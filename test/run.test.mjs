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

test('ステップは intervalMs の間隔で、区は順に1つずつ、ステップの時間に均等に散らして書く(並列にしない)', async () => {
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
  assert.deepEqual(calls.map((c) => c[0]), [1_000_000, 1_000_500, 1_001_000, 1_001_500, 1_002_000, 1_002_500]);
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

test('ステップの中の書き込みは、due + k × intervalMs / n に等間隔で行う(書き込みの時間は累積しない)', async () => {
  const clock = fakeClock();
  const calls = [];
  const write = async (ward) => { calls.push([ward, clock.now()]); clock.advance(100); return true; };
  await runReplay({ steps: steps(2, ['a', 'b', 'c', 'd']), intervalMs: 1000, write, ...clock });
  assert.deepEqual(calls.map((c) => c[1]), [
    1_000_000, 1_000_250, 1_000_500, 1_000_750,
    1_001_000, 1_001_250, 1_001_500, 1_001_750,
  ]);
});

test('1件の書き込みが枠を超えても、待たずに続け、あとの書き込みの予定時刻は変えない', async () => {
  const clock = fakeClock();
  const calls = [];
  const write = async (ward) => {
    calls.push([ward, clock.now()]);
    if (ward === 'a') clock.advance(700); // 枠(250ms)を超える
    return true;
  };
  await runReplay({ steps: steps(2, ['a', 'b', 'c', 'd']), intervalMs: 1000, write, ...clock });
  // b、c は予定(250、500)を過ぎているので、すぐに書く。d は予定どおり 750。次のステップも予定どおり。
  assert.deepEqual(calls.map((c) => c[1]), [
    1_000_000, 1_000_700, 1_000_700, 1_000_750,
    1_001_000, 1_001_700, 1_001_700, 1_001_750,
  ]);
});

test('大きく遅れたら(3 × intervalMs 超)、警告して予定を後ろへずらし、書き込みの間隔を保つ', async () => {
  const clock = fakeClock();
  const calls = [];
  const warns = [];
  let stalled = false;
  const write = async (ward, obs) => {
    calls.push([ward + obs.t, clock.now()]);
    if (!stalled && ward === 'b') { stalled = true; clock.advance(10_000); } // 最初のステップの b のあとで止まる
    return true;
  };
  await runReplay({ steps: steps(3), intervalMs: 1000, write, onWarn: (m) => warns.push(m), ...clock });
  // ステップ1は 1_010_500 に始まる(遅れ 9,500ms)。そこから、元の間隔(区は 500ms、ステップは 1,000ms)で書く。
  assert.deepEqual(calls, [
    ['at0', 1_000_000], ['bt0', 1_000_500],
    ['at1', 1_010_500], ['bt1', 1_011_000],
    ['at2', 1_011_500], ['bt2', 1_012_000],
  ]);
  assert.ok(warns.some((m) => /ずらし/.test(m)));
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

test('ステップの途中で大きく止まったら(3 × intervalMs 超)、その書き込みの枠で警告して予定をずらし、残りの区を一度に書かない', async () => {
  const clock = fakeClock();
  const calls = [];
  const warns = [];
  let stalled = false;
  const write = async (ward, obs) => {
    calls.push([ward + obs.t, clock.now()]);
    if (!stalled && ward === 'b') { stalled = true; clock.advance(30_000); } // ステップ0の b の書き込みが 30 秒止まる
    return true;
  };
  await runReplay({ steps: steps(2, ['a', 'b', 'c', 'd']), intervalMs: 6000, write, onWarn: (m) => warns.push(m), ...clock });
  // c は予定 1_003_000 に対して 1_031_500(28,500ms 遅れ)。そこを「今」として、残りは元の間隔(区は 1,500ms、ステップは 6,000ms)で書く。
  assert.deepEqual(calls, [
    ['at0', 1_000_000], ['bt0', 1_001_500], ['ct0', 1_031_500], ['dt0', 1_033_000],
    ['at1', 1_034_500], ['bt1', 1_036_000], ['ct1', 1_037_500], ['dt1', 1_039_000],
  ]);
  assert.equal(warns.filter((m) => /ずらし/.test(m)).length, 1);
  assert.ok(warns.some((m) => /28500ms/.test(m)));
});

test('ステップの途中の小さな遅れ(3 × intervalMs 以下)では、予定をずらさない', async () => {
  const clock = fakeClock();
  const calls = [];
  const warns = [];
  let stalled = false;
  const write = async (ward, obs) => {
    calls.push([ward + obs.t, clock.now()]);
    if (!stalled && ward === 'b') { stalled = true; clock.advance(4000); }
    return true;
  };
  await runReplay({ steps: steps(2, ['a', 'b', 'c', 'd']), intervalMs: 6000, write, onWarn: (m) => warns.push(m), ...clock });
  assert.deepEqual(calls, [
    ['at0', 1_000_000], ['bt0', 1_001_500], ['ct0', 1_005_500], ['dt0', 1_005_500],
    ['at1', 1_006_000], ['bt1', 1_007_500], ['ct1', 1_009_000], ['dt1', 1_010_500],
  ]);
  assert.equal(warns.filter((m) => /ずらし/.test(m)).length, 0);
});

test('書き込みが 0 件や 1 件のステップも、ステップの間隔を保って再生する', async () => {
  const clock = fakeClock();
  const calls = [];
  const s = [
    { t: 't0', writes: [{ ward: 'a', obs: { t: 't0' } }] },
    { t: 't1', writes: [] },
    { t: 't2', writes: [{ ward: 'a', obs: { t: 't2' } }] },
  ];
  const write = async (ward, obs) => { calls.push([obs.t, clock.now()]); clock.advance(100); return true; };
  const seen = [];
  const stats = await runReplay({ steps: s, intervalMs: 1000, write, onStep: ({ index }) => seen.push([index, clock.now()]), ...clock });
  assert.deepEqual(calls, [['t0', 1_000_000], ['t2', 1_002_000]]);
  assert.deepEqual(seen.map((x) => x[0]), [0, 1, 2]);
  assert.equal(seen[1][1], 1_001_000);
  assert.deepEqual(stats, { writes: 2, failed: 0, steps: 3 });
});

test('既定の時計は単調な時計(壁時計の変更で、待ち時間が変わらない)', async () => {
  const realNow = Date.now;
  let wall = realNow();
  Date.now = () => (wall -= 3_600_000); // 呼ぶたびに壁時計が 1 時間戻る
  const sleeps = [];
  try {
    await runReplay({ steps: steps(3), intervalMs: 20, write: async () => true, sleep: async (ms) => { sleeps.push(ms); } });
  } finally {
    Date.now = realNow;
  }
  // 偽の sleep は時刻を進めないので、待ち時間は再生の長さ(3 ステップ × 20ms)までになる。壁時計を使うと、約 1 時間になる。
  assert.ok(sleeps.every((ms) => ms <= 60), `待ち時間: ${sleeps}`);
});

test('write の例外の内容を、失敗ごとに onWarn へ渡す(区と例外のメッセージ)', async () => {
  const clock = fakeClock();
  const warns = [];
  let n = 0;
  const write = async (ward) => { n++; if (n === 1) throw new Error('request timed out'); return true; };
  await runReplay({ steps: steps(1), intervalMs: 1000, write, onWarn: (m) => warns.push(m), ...clock });
  assert.deepEqual(warns, ['a の書き込みで例外: request timed out']);
});

test('連続の失敗で中断するとき、最後の例外の内容を、エラーのメッセージと cause に含める', async () => {
  const clock = fakeClock();
  let n = 0;
  const write = async () => { n++; throw new Error(`ECONNREFUSED ${n}`); };
  const err = await runReplay({ steps: steps(10), intervalMs: 10, write, onWarn: () => {}, ...clock }).catch((e) => e);
  assert.match(err.message, /連続 5 回/);
  assert.match(err.message, /ECONNREFUSED 5/);
  assert.equal(err.cause?.message, 'ECONNREFUSED 5');
});

test('例外のあとに成功すれば、連続の失敗は数え直し、中断のエラーに古い例外を含めない', async () => {
  const clock = fakeClock();
  let n = 0;
  // 1〜4 回目は例外、5 回目は成功、6〜10 回目は 2xx 以外(例外なし)
  const write = async () => { n++; if (n <= 4) throw new Error('old cause'); return n === 5; };
  const err = await runReplay({ steps: steps(10), intervalMs: 10, write, onWarn: () => {}, ...clock }).catch((e) => e);
  assert.equal(n, 10);
  assert.match(err.message, /連続 5 回/);
  assert.doesNotMatch(err.message, /old cause/);
  assert.equal(err.cause, undefined);
});
