// 2つの時計: 「観測時刻」(データの時刻 = 最後に受けた live の通知の dateObserved)と「現在時刻」(壁時計)
import { formatJst } from '../lib/format.js';

export function createClocks(root) {
  const observed = root.querySelector('[data-clock="observed"]');
  const wall = root.querySelector('[data-clock="wall"]');
  return {
    render(observedMs, nowMs) {
      observed.textContent = formatJst(observedMs);
      wall.textContent = formatJst(nowMs, { seconds: true });
    },
  };
}
