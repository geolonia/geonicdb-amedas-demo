// 条件ヒットのラベルの置き場所を選ぶ(DOM を使わない計算だけ。effects/hit-effects.js から使う)。
// 1280 × 720 では地図が狭く、観測点の真上に置くと、隣の区のラベルやパネルに重なる。
// そこで、観測点の真上を基準に、上へ持ち上げた位置、横、自分のラベルの下(2段)と、それぞれを左右にずらした候補を作り、
// 動く範囲(HIT_DRIFT)まで含めた箱で、次の順に選ぶ(同じ段の中では、基準から近い候補を先に):
//   1. パネルと区のラベル(obstacles)にも、ほかのピル(pills)にも、gap 以上離れる候補
//   2. なければ、obstacles に 1px も重ならない候補のうち、ほかのピルとの重なりが最小のもの
//      (obstacles は「重ねてはいけないもの」。ほかのピルは 4秒で消えるので、重ねるならこちら)
//   3. それでもなければ、重なりが最小のもの(obstacles の重なりを 4倍に数える)
// 戻り値の overlap は、本当の重なり(広げない箱)の面積の合計。0 より大きければ、置き場所がなかった。
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

// x, y: 観測点の画面座標、w, h: ラベルの大きさ、obstacles: パネルと区のラベルの箱、pills: いま出ているほかのピルの箱(動く範囲を含む)、
// bounds: 置いてよい範囲(画面)、below: 自分の区のラベルの下端(省略時は観測点の少し下)。
// 戻り値 { left, top, overlap, hardOverlap }(left, top は動く前の位置)
export function placeHitLabel({ x, y, w, h, obstacles, pills = [], bounds, below = y + 8, gap = 4 }) {
  const dot = { l: x - 5, t: y - 5, r: x + 5, b: y + 5 };
  const hard = [...obstacles, dot];
  const hardPad = hard.map((o) => inflate(o, gap));
  const pillPad = pills.map((o) => inflate(o, gap));
  const above = y - STATION_CLEAR - HIT_DRIFT.down - h;
  const under = below + gap + HIT_DRIFT.up;
  const rows = [
    { top: above, cost: 0 },
    { top: above - 16, cost: 10 },
    { top: above - 32, cost: 20 },
    { top: y - h / 2, cost: 25 },
    { top: under, cost: 40 },
    { top: under + 40, cost: 55 },
  ];
  const shifts = [0, 0.25, 0.5, 0.5 + 30 / w, 0.5 + 60 / w, 0.5 + 90 / w].flatMap((k) => (k === 0 ? [0] : [-k * w, k * w]));
  const minLeft = bounds.l + gap;
  const maxLeft = bounds.r - gap - w;
  const minTop = bounds.t + gap + HIT_DRIFT.up;
  const maxTop = bounds.b - gap - HIT_DRIFT.down - h;
  const sum = (list, sw) => list.reduce((acc, o) => acc + overlapArea(sw, o), 0);
  const candidates = [];
  for (const row of rows) {
    for (const dx of shifts) {
      const left = Math.round(Math.min(Math.max(x + dx - w / 2, minLeft), maxLeft));
      const top = Math.round(Math.min(Math.max(row.top, minTop), maxTop));
      const sw = { l: left, t: top - HIT_DRIFT.up, r: left + w, b: top + h + HIT_DRIFT.down };
      candidates.push({
        left,
        top,
        cost: row.cost + Math.abs(dx) * 0.2,
        hardRaw: sum(hard, sw),
        hardPad: sum(hardPad, sw),
        pillRaw: sum(pills, sw),
        pillPad: sum(pillPad, sw),
      });
    }
  }
  candidates.sort((a, b) => a.cost - b.cost);
  const by = (...keys) => (a, b) => {
    for (const k of keys) if (a[k] !== b[k]) return a[k] - b[k];
    return 0;
  };
  const best =
    candidates.find((c) => c.hardPad === 0 && c.pillPad === 0) ??
    candidates.filter((c) => c.hardRaw === 0).sort(by('pillRaw', 'hardPad', 'pillPad', 'cost'))[0] ??
    candidates.map((c) => ({ ...c, weighted: c.hardRaw * 4 + c.pillRaw })).sort(by('weighted', 'cost'))[0];
  return { left: best.left, top: best.top, overlap: best.hardRaw + best.pillRaw, hardOverlap: best.hardRaw };
}
