// 雪の粒の強さ(純関数)。
// 強さ = max(降雪量 snowfall1h, 積雪深の1時間の増分(正の分だけ)) / 5cm を 0〜1 に収めたもの。
// 気温が 3℃ を超えるときは 0(雨とみなす)。気温が欠測のときは、降雪の値だけで決める(欠測で粒を止めない)。

export const RAIN_ABOVE_C = 3;
export const FULL_AT_CM = 5;
export const MAX_CANVAS_SCALE = 1.5;

export function snowIntensity({ snowfall1h = null, snowDelta1h = null, temperature = null } = {}) {
  if (Number.isFinite(temperature) && temperature > RAIN_ABOVE_C) return 0;
  const fall = Number.isFinite(snowfall1h) && snowfall1h > 0 ? snowfall1h : 0;
  const delta = Number.isFinite(snowDelta1h) && snowDelta1h > 0 ? snowDelta1h : 0;
  return Math.min(1, Math.max(fall, delta) / FULL_AT_CM);
}

// canvas の描画倍率。Retina(DPR 2)でも 1.5 に抑える(設計書 5.3)
export function canvasScale(devicePixelRatio) {
  const d = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  return Math.min(d, MAX_CANVAS_SCALE);
}

// 表示中の強さを、目標へなめらかに近づける(dtSec: 前のフレームからの秒、rate: 1秒あたりの追従の速さ)
export function approach(current, target, dtSec, rate = 1.5) {
  return current + (target - current) * Math.min(1, Math.max(0, dtSec) * rate);
}

// このフレームで出す粒の数。carry は端数の持ち越し。perSecond は強さ 1 のときの、区あたり毎秒の粒の数
export function spawnCount(intensity, dtSec, carry, perSecond = 200) {
  if (!(intensity > 0.02)) return { count: 0, carry: 0 };
  const total = carry + intensity * perSecond * Math.max(0, dtSec);
  const count = Math.floor(total);
  return { count, carry: total - count };
}

// 描画ループを止めてよいか: 粒が 1つもなく、全区の強さ(current)も目標(target)も 0
export function isIdle(particleCount, emitters) {
  if (particleCount > 0) return false;
  for (const e of emitters) if (e.current > 0 || e.target > 0) return false;
  return true;
}
