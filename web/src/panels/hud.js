// HUD: 受信件数、通知レート、配信の遅延(最新、中央値 / p95 / 最大)、条件付き購読の通知の件数、接続の状態
import { formatMs } from '../lib/format.js';

export function createHud(root) {
  const field = (name) => root.querySelector(`[data-hud="${name}"]`);
  const total = field('total');
  const rate = field('rate');
  const latency = field('latency');
  const latencyStats = field('latency-stats');
  const ge5 = field('ge5');
  const ge3 = field('ge3');
  return {
    // snap: stats.snapshot(now) の戻り値
    render(snap) {
      total.textContent = String(snap.total);
      rate.textContent = String(Math.round(snap.ratePerMin));
      latency.textContent = formatMs(snap.latency.last);
      latencyStats.textContent = `${formatMs(snap.latency.median)} / ${formatMs(snap.latency.p95)} / ${formatMs(snap.latency.max)} ms`;
      ge5.textContent = String(snap.cond.ge5);
      ge3.textContent = String(snap.cond.ge3);
    },
    setStatus(status) {
      root.dataset.status = status;
    },
  };
}
