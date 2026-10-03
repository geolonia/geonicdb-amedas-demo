// steps を intervalMs の間隔で再生する。各ステップの中では、区を1つずつ順に書く(並列にしない)。
// now と sleep は、テストで差し替えるために注入する。
export async function runReplay({
  steps,
  intervalMs,
  write,
  now = Date.now,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  onStep,
  onWarn,
  maxConsecutiveFailures = 5,
}) {
  const t0 = now();
  const stats = { writes: 0, failed: 0, steps: 0 };
  let consecutive = 0;
  for (let i = 0; i < steps.length; i++) {
    const due = t0 + i * intervalMs;
    const wait = due - now();
    if (wait > 0) await sleep(wait);
    const lag = Math.max(0, now() - due);
    if (lag > Math.max(1000, 2 * intervalMs)) onWarn?.(`ステップ ${i + 1}/${steps.length}: ${lag}ms 遅れています`);
    for (const { ward, obs } of steps[i].writes) {
      let ok = false;
      try {
        ok = await write(ward, obs, steps[i].t);
      } catch {
        ok = false;
      }
      if (ok) {
        consecutive = 0;
        stats.writes++;
      } else {
        stats.failed++;
        consecutive++;
        if (consecutive >= maxConsecutiveFailures) {
          throw new Error(`書き込みが連続 ${maxConsecutiveFailures} 回失敗したため中断しました(ステップ ${i + 1}/${steps.length}、区: ${ward})`);
        }
      }
    }
    stats.steps++;
    onStep?.({ index: i, total: steps.length, t: steps[i].t, lag });
  }
  return stats;
}
