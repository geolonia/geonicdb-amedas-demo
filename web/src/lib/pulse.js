// 通常の波紋を出してよいか(純関数)。
// 隠れたタブでは CSS アニメーションが止まり、animationend が来ないため、波紋の要素がたまり続ける(約100件/分)。
// 隠れているときは出さず、同時に出ている数にも上限を付ける。
export const MAX_LIVE_RINGS = 40;

export function canPulse({ hidden, active, max = MAX_LIVE_RINGS }) {
  return !hidden && active < max;
}
