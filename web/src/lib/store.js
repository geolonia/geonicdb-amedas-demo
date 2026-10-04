// 区ごとの最新値と、観測時刻の時計(純関数。DOM も時計も使わない)。
//
// - live の通知だけで更新する(条件付き購読の通知は、演出にだけ使う)。
// - 観測時刻は dateObserved を使う。属性の observedAt から求めない(気温の欠測や --changed-only で古いまま残る)。
// - 時計は「最後に受けた live の通知の dateObserved」。最大値ではない
//   (setup をやり直して、前より早い時刻から再生したときに、時計が止まらないようにする)。
// - setup のときに届く余分な live の通知(再生の開始より前の観測時刻)は、初期値として表示する。
// - 積雪深の1時間の増分は、区ごとの (dateObserved, 積雪深) の履歴から求める(replay は増分を書かない)。
import { freshValue, isNewSnowfall } from './notification.js';

export const HOUR_MS = 60 * 60 * 1000;
const HISTORY_MS = 2 * HOUR_MS;
// 1時間前のちょうどの値がない(その区が書かれなかったステップがある)とき、さかのぼって使う幅
const DELTA_TOLERANCE_MS = 30 * 60 * 1000;

const emptyWard = () => ({
  dateObserved: null,
  snowHeight: null,
  temperature: null,
  windSpeed: null,
  snowfall1h: null,
  snowDelta1h: null,
  newSnowfall: false,
  history: [], // [dateObserved, snowHeight] の昇順
});

// history の中で、t - 1時間 以前の最も新しい値との差(許容幅の外なら null)
export function depthDelta1h(history, t, depth) {
  if (depth === null || t === null) return null;
  const target = t - HOUR_MS;
  let base = null;
  for (const [ht, hv] of history) {
    if (ht <= target && ht >= target - DELTA_TOLERANCE_MS) base = hv;
  }
  return base === null ? null : depth - base;
}

export function createWardStore(wardIds) {
  const wards = new Map(wardIds.map((id) => [id, emptyWard()]));
  let clock = null;

  const snapshot = (w) => {
    const { history: _history, ...rest } = w;
    return { ...rest };
  };

  return {
    // live の Observation を反映する。戻り値は、その区の表示用の値(知らない区や live 以外は null)
    applyLive(obs) {
      if (obs.kind !== 'live') return null;
      const w = wards.get(obs.ward);
      if (!w) return null;
      const t = obs.dateObserved;
      if (t !== null) {
        clock = t;
        // 時刻が戻った(setup をやり直した)ときは、増分の履歴を捨てる
        if (w.dateObserved !== null && t < w.dateObserved) w.history = [];
        w.dateObserved = t;
      }
      const a = obs.attrs;
      w.snowHeight = a.snowHeight?.value ?? null;
      w.windSpeed = a.windSpeed?.value ?? null;
      w.temperature = freshValue(a.temperature, t);
      w.snowfall1h = freshValue(a.snowfall1h, t);
      w.newSnowfall = isNewSnowfall(obs);
      w.snowDelta1h = depthDelta1h(w.history, t, w.snowHeight);
      if (t !== null && w.snowHeight !== null) {
        w.history = w.history.filter(([ht]) => ht < t && ht >= t - HISTORY_MS);
        w.history.push([t, w.snowHeight]);
      }
      return { ward: obs.ward, ...snapshot(w) };
    },
    get(ward) {
      const w = wards.get(ward);
      return w ? { ward, ...snapshot(w) } : null;
    },
    clock: () => clock,
  };
}
