// 条件ヒットのラベルの置き場所を選ぶ(DOM を使わない計算だけ。effects/hit-effects.js から使う)。
// 1280 × 720 では地図が狭く、観測点の真上に置くと、隣の区のラベルやパネルに重なる。
// そこで、観測点の真上を基準に、上へ持ち上げた位置、横、自分のラベルの下、とそれぞれを左右にずらした候補を、
// 基準から遠いほど大きいコストの順に試し、
// 動く範囲(HIT_DRIFT)まで含めて、どの障害物(区のラベル、パネル、ほかのヒットのラベル)とも
// gap 以上離れる最初の候補を選ぶ。どこにも置けなければ、重なりの最も小さい候補を返す。
// 箱は { l, t, r, b }(画面の px)。

// ラベルのアニメーションで、置いた位置から上へ up、下へ down まで動く(style.css の @keyframes hit-label と対)
export const HIT_DRIFT = Object.freeze({ up: 12, down: 6 });
// 観測点の点(半径 3.5 + 縁 1.5)から、ラベルの下端までの最小の距離(点の箱 ±5 と gap 4 より大きくする)
const STATION_CLEAR = 10;

export function overlapArea(a, b) {
  const w = Math.min(a.r, b.r) - Math.max(a.l, b.l);
  const h = Math.min(a.b, b.b) - Math.max(a.t, b.t);
  return w > 0 && h > 0 ? w * h : 0;
}

const inflate = (r, d) => ({ l: r.l - d, t: r.t - d, r: r.r + d, b: r.b + d });

// x, y: 観測点の画面座標、w, h: ラベルの大きさ、obstacles: 避ける箱の配列、bounds: 置いてよい範囲(画面)
// below: 自分の区のラベルの下端(省略時は観測点の少し下)。戻り値 { left, top, overlap }(left, top は動く前の位置)
export function placeHitLabel({ x, y, w, h, obstacles, bounds, below = y + 8, gap = 4 }) {
  const dot = { l: x - 5, t: y - 5, r: x + 5, b: y + 5 };
  const blocks = [...obstacles, dot].map((o) => inflate(o, gap));
  const rows = [
    { top: y - STATION_CLEAR - HIT_DRIFT.down - h, cost: 0 },
    { top: y - STATION_CLEAR - HIT_DRIFT.down - h - 16, cost: 10 },
    { top: y - STATION_CLEAR - HIT_DRIFT.down - h - 32, cost: 20 },
    { top: y - h / 2, cost: 25 },
    { top: below + gap + HIT_DRIFT.up, cost: 40 },
  ];
  const shifts = [0, 0.25, 0.5, 0.5 + 30 / w, 0.5 + 60 / w].flatMap((k) => (k === 0 ? [0] : [-k * w, k * w]));
  const minLeft = bounds.l + gap;
  const maxLeft = bounds.r - gap - w;
  const minTop = bounds.t + gap + HIT_DRIFT.up;
  const maxTop = bounds.b - gap - HIT_DRIFT.down - h;
  const candidates = [];
  for (const row of rows) {
    for (const dx of shifts) {
      const left = Math.round(Math.min(Math.max(x + dx - w / 2, minLeft), maxLeft));
      const top = Math.round(Math.min(Math.max(row.top, minTop), maxTop));
      const swept = { l: left, t: top - HIT_DRIFT.up, r: left + w, b: top + h + HIT_DRIFT.down };
      const overlap = blocks.reduce((sum, o) => sum + overlapArea(swept, o), 0);
      candidates.push({ left, top, overlap, cost: row.cost + Math.abs(dx) * 0.2 });
    }
  }
  candidates.sort((a, b) => a.cost - b.cost);
  const best = candidates.find((c) => c.overlap === 0) ?? candidates.reduce((a, b) => (b.overlap < a.overlap ? b : a));
  return { left: best.left, top: best.top, overlap: best.overlap };
}
