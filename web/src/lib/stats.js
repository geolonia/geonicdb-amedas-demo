// HUD の統計(純関数。現在時刻は引数で受ける)。
// - 通知レート: 直近 windowMs の live の通知の件数を、1分あたりに直す
// - 配信の遅延: 受信時刻 − sentAt(ブローカーと地図アプリが同じ機であることが前提)。中央値、p95、最大
// - 条件付き購読の通知の件数(ge5、ge3 のトピックごと。重複排除の前の件数で、smoke の件数と比べられる)
//
// setup のときの余分な live の通知(inputs 6節)は、再生の開始の数十秒〜数分前に1件だけ届く。
// 受信の間隔が windowMs より空いたら、そこから「新しい流れ」として数え直す(レートが薄まらないように)。

// scripts/smoke/analyze.mjs の percentile と同じ定義(最近傍順位)。HUD と npm run smoke の値をそろえる。
export function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1];
}

export function createStats({ windowMs = 60_000, maxLatencySamples = 2000 } = {}) {
  let total = 0;
  let runStart = null;
  let lastReceivedAt = null;
  let lastLatency = null;
  const times = []; // 直近の受信時刻(昇順)
  const latencies = []; // 直近 maxLatencySamples 件
  const cond = { ge5: 0, ge3: 0 };

  return {
    recordLive(obs) {
      const r = obs.receivedAt;
      total++;
      if (lastReceivedAt === null || r - lastReceivedAt > windowMs) {
        runStart = r;
        times.length = 0;
      }
      lastReceivedAt = r;
      times.push(r);
      if (obs.sentAt !== null) {
        lastLatency = r - obs.sentAt;
        latencies.push(lastLatency);
        if (latencies.length > maxLatencySamples) latencies.shift();
      }
    },
    recordConditional(obs) {
      if (obs.kind in cond) cond[obs.kind]++;
    },
    snapshot(now) {
      while (times.length > 0 && times[0] < now - windowMs) times.shift();
      let ratePerMin = 0;
      if (times.length > 0) {
        const span = Math.max(1000, Math.min(windowMs, now - runStart));
        ratePerMin = (times.length / span) * 60_000;
      }
      const sorted = [...latencies].sort((a, b) => a - b);
      return {
        total,
        ratePerMin,
        latency: {
          last: lastLatency,
          count: sorted.length,
          median: percentile(sorted, 50),
          p95: percentile(sorted, 95),
          max: sorted.length > 0 ? sorted.at(-1) : null,
        },
        cond: { ...cond },
      };
    },
  };
}
