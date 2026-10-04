// steps を intervalMs の間隔で再生する。各ステップの中では、区を1つずつ順に書く(並列にしない)。
// ステップの中の k 件目(0 始まり、n 件中)は、due + k × intervalMs / n に書く。書き込みをステップの時間に散らし、
// 通知を1件ずつ処理するブローカーで、通知がまとめて滞留しないようにする。予定は t0 からの計算で決め、遅れを累積させない。
// 既定の時計は単調な時計(performance.now)。壁時計の変更(NTP、手動での変更)で、待ち時間が変わらないようにする。
// now と sleep は、テストで差し替えるために注入する。
export async function runReplay({
  steps,
  intervalMs,
  write,
  now = () => performance.now(),
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  onStep,
  onWarn,
  maxConsecutiveFailures = 5,
}) {
  const t0 = now();
  // 大きく遅れたときに、予定を後ろへずらした量の合計
  let shift = 0;
  const stats = { writes: 0, failed: 0, steps: 0 };
  let consecutive = 0;
  // 予定の時刻まで待ち、遅れを返す。大きく遅れたとき(スリープや一時停止、止まった要求のあと)は、
  // 予定を遅れの分だけ後ろへずらす(この枠を「今」とし、以降の枠は元の間隔を保つ)。
  // ずらさないと、遅れた分の書き込みが、間を空けずに続けて出る。この確認は、書き込みのたびに行う。
  const waitFor = async (offset, where) => {
    const slot = t0 + shift + offset;
    const wait = slot - now();
    if (wait > 0) await sleep(wait);
    const late = Math.max(0, Math.round(now() - slot));
    if (late > 3 * intervalMs) {
      onWarn?.(`${where}: ${late}ms 遅れたため、以降の予定を ${late}ms 後ろへずらします`);
      shift += late;
    }
    return late;
  };
  for (let i = 0; i < steps.length; i++) {
    const where = `ステップ ${i + 1}/${steps.length}`;
    const lag = await waitFor(i * intervalMs, where);
    if (lag <= 3 * intervalMs && lag > Math.max(1000, 2 * intervalMs)) onWarn?.(`${where}: ${lag}ms 遅れています`);
    const { writes } = steps[i];
    for (const [k, { ward, obs }] of writes.entries()) {
      if (k > 0) await waitFor(i * intervalMs + (k * intervalMs) / writes.length, `${where}(${k + 1}/${writes.length} 件目、区: ${ward})`);
      let ok;
      // 最後の失敗が例外だったときの、その例外(中断のエラーに原因として含める)
      let error = null;
      try {
        ok = await write(ward, obs, steps[i].t);
      } catch (e) {
        ok = false;
        error = e;
        onWarn?.(`${ward} の書き込みで例外: ${e?.message ?? e}`);
      }
      if (ok) {
        consecutive = 0;
        stats.writes++;
      } else {
        stats.failed++;
        consecutive++;
        if (consecutive >= maxConsecutiveFailures) {
          const where = `ステップ ${i + 1}/${steps.length}、区: ${ward}`;
          const cause = error ? `。最後の例外: ${error?.message ?? error}` : '';
          throw new Error(`書き込みが連続 ${maxConsecutiveFailures} 回失敗したため中断しました(${where})${cause}`, error ? { cause: error } : undefined);
        }
      }
    }
    stats.steps++;
    onStep?.({ index: i, total: steps.length, t: steps[i].t, lag });
  }
  return stats;
}
