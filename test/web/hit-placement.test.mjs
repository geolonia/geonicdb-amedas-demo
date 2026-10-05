import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placeHitLabel, overlapArea, HIT_DRIFT } from '../../web/src/lib/hit-placement.js';

const bounds = { l: 0, t: 0, r: 1000, b: 800 };
// 動く範囲(上へ HIT_DRIFT.up、下へ HIT_DRIFT.down)を含めた箱
const swept = ({ left, top }, w, h) => ({ l: left, t: top - HIT_DRIFT.up, r: left + w, b: top + h + HIT_DRIFT.down });

test('overlapArea: 重なりの面積。接するだけなら 0', () => {
  assert.equal(overlapArea({ l: 0, t: 0, r: 10, b: 10 }, { l: 5, t: 5, r: 20, b: 20 }), 25);
  assert.equal(overlapArea({ l: 0, t: 0, r: 10, b: 10 }, { l: 10, t: 0, r: 20, b: 10 }), 0);
});

test('障害物がなければ、観測点の真上(中央そろえ)に置く', () => {
  const p = placeHitLabel({ x: 500, y: 400, w: 200, h: 30, obstacles: [], bounds });
  assert.equal(p.left, 400);
  assert.ok(p.top + 30 + HIT_DRIFT.down <= 400 - 5 - 4, '動いても観測点の点にかからない');
  assert.ok(p.top + 30 + HIT_DRIFT.down >= 400 - 12, '観測点から離しすぎない(真上の最初の候補)');
  assert.equal(p.overlap, 0);
});

test('真上がふさがっていたら、ずらした位置のうち、重ならないものを選ぶ', () => {
  const blocker = { l: 380, t: 300, r: 620, b: 398 }; // 観測点の上を横いっぱいにふさぐ
  const p = placeHitLabel({ x: 500, y: 400, w: 200, h: 30, obstacles: [blocker], bounds });
  assert.equal(p.overlap, 0);
  assert.equal(overlapArea(swept(p, 200, 30), blocker), 0);
});

test('障害物との間に gap(既定 4px)を空ける', () => {
  const w = 200, h = 30;
  const left = { l: 0, t: 0, r: 398, b: 800 }; // 左のパネル(右端 398)
  const p = placeHitLabel({ x: 420, y: 400, w, h, obstacles: [left], bounds });
  assert.equal(p.overlap, 0);
  assert.ok(p.left >= 398 + 4);
});

test('画面の外には出さない', () => {
  const p = placeHitLabel({ x: 30, y: 30, w: 200, h: 30, obstacles: [], bounds });
  const s = swept(p, 200, 30);
  assert.ok(s.l >= bounds.l + 4 && s.t >= bounds.t + 4 && s.r <= bounds.r - 4);
});

test('どこにも置けなければ、重なりの最も小さい位置を返す(overlap > 0)', () => {
  const all = { l: 0, t: 0, r: 1000, b: 800 };
  const p = placeHitLabel({ x: 500, y: 400, w: 200, h: 30, obstacles: [all], bounds });
  assert.ok(p.overlap > 0);
  assert.ok(Number.isFinite(p.left) && Number.isFinite(p.top));
});

// ---- 実際の到着順(2025-11-18 15:00 のピーク。fake-notify --interval 6000 --gap 430 で、この順にピルが出る) ----
// 値は、本番のビルドで実測した区のラベル、パネル、観測点、ピルの大きさ(2026-10-05、Task 13 の修正 1)。
// 箱は [l, t, r, b]。15:00 の書き込みでは、14:00 のピルは消えている(6秒の間隔 > 4秒の表示)
const box = ([l, t, r, b]) => ({ l, t, r, b });
const PEAK_1500 = {
  '1366x768': {
    bounds: [1366, 768],
    labels: { chuo: [536.7, 391, 617.3, 425], kita: [606.2, 185, 693.8, 219], higashi: [653.2, 294, 740.8, 328], shiroishi: [779.7, 494, 860.3, 528], toyohira: [694.7, 543, 775.3, 577], minami: [606.7, 586, 687.3, 620], nishi: [414.7, 372, 495.3, 406], atsubetsu: [933.7, 487, 1014.3, 521], teine: [330.2, 202, 417.8, 236], kiyota: [830.7, 614, 911.3, 648] },
    panels: { hud: [12, 150, 308.5, 304.5], clocks: [12, 12, 297.6, 125.5], side: [1034, 12, 1354, 728], title: [443.5, 12, 922.5, 56], controls: [12, 639.5, 294, 684], legend: [12, 696, 310.2, 728], attribution: [12, 743.5, 1354, 760] },
    pills: [{ ward: 'chuo', x: 577.5, y: 383.4, w: 202, h: 28 }, { ward: 'higashi', x: 697, y: 285.6, w: 186, h: 28 }, { ward: 'shiroishi', x: 820, y: 485.8, w: 202, h: 28 }, { ward: 'atsubetsu', x: 974, y: 478.6, w: 202, h: 28 }, { ward: 'teine', x: 368, y: 194.3, w: 201, h: 28 }],
  },
  '1920x1080': {
    bounds: [1920, 1080],
    labels: { chuo: [721.3, 545, 806.7, 580.3], kita: [842.6, 189, 935.4, 224.3], higashi: [923.6, 376, 1016.4, 411.3], shiroishi: [1139.3, 722, 1224.7, 757.3], toyohira: [993.3, 807, 1078.7, 842.3], minami: [840.3, 858, 925.7, 893.3], nishi: [514.3, 511, 599.7, 546.3], atsubetsu: [1405.3, 709, 1490.7, 744.3], teine: [361.6, 219, 454.4, 254.3], kiyota: [1227.3, 929, 1312.7, 964.3] },
    panels: { hud: [12, 150, 342, 304.5], clocks: [12, 12, 359.1, 132.5], side: [1508, 12, 1908, 1040], title: [720.5, 12, 1199.5, 56], controls: [12, 951.5, 294, 996], legend: [12, 1008, 310.2, 1040], attribution: [12, 1055.5, 1908, 1072] },
    pills: [{ ward: 'chuo', x: 763.6, y: 537, w: 248, h: 35 }, { ward: 'higashi', x: 969.9, y: 368.2, w: 228, h: 35 }, { ward: 'shiroishi', x: 1182.1, y: 713.8, w: 248, h: 35 }, { ward: 'atsubetsu', x: 1448, y: 701.4, w: 249, h: 35 }, { ward: 'teine', x: 402, y: 210.7, w: 248, h: 35 }],
  },
};

for (const [size, s] of Object.entries(PEAK_1500)) {
  test(`実際の到着順(15:00、${size}): 中央 → 東 → 白石 → 厚別 → 手稲 の順に置いても、どのピルもパネル、区のラベル、ほかのピルに重ならない`, () => {
    const hard = [...Object.values(s.labels), ...Object.values(s.panels)].map(box);
    const placed = [];
    for (const p of s.pills) {
      const r = placeHitLabel({ x: p.x, y: p.y, w: p.w, h: p.h, obstacles: hard, pills: placed, bounds: { l: 0, t: 0, r: s.bounds[0], b: s.bounds[1] }, below: s.labels[p.ward][3] });
      const sw = swept(r, p.w, p.h);
      for (const o of hard) assert.equal(overlapArea(sw, o), 0, `${p.ward} がパネルか区のラベルに重なる`);
      for (const o of placed) assert.equal(overlapArea(sw, o), 0, `${p.ward} がほかのピルに重なる`);
      assert.equal(r.overlap, 0, `${p.ward}: overlap ${r.overlap}`);
      placed.push(sw);
    }
  });
}

test('置き場所が本当にないときは overlap > 0 を返し、パネルや区のラベルより、ほかのピルに重ねる方を選ぶ', () => {
  // 観測点 (500, 250) の真上の候補(left 400、top 204)のまわりだけが空いていて、そこにほかのピルがいる
  const hard = [
    { l: 0, t: 0, r: 1000, b: 170 },
    { l: 0, t: 245, r: 1000, b: 800 },
    { l: 0, t: 170, r: 380, b: 245 },
    { l: 620, t: 170, r: 1000, b: 245 },
  ];
  const other = { l: 400, t: 190, r: 600, b: 240 };
  const r = placeHitLabel({ x: 500, y: 250, w: 200, h: 30, obstacles: hard, pills: [other], bounds });
  const sw = swept(r, 200, 30);
  assert.ok(r.overlap > 0);
  for (const o of hard) assert.equal(overlapArea(sw, o), 0, 'パネル(区のラベル)には重ねない');
  assert.ok(overlapArea(sw, other) > 0);
});

test('ほかのピルとの間の 4px に食い込むより、パネルに重ならない方を選ぶ(重なりの面積を、広げた箱で比べない)', () => {
  // 真上は、ほかのピルの 4px の余白にだけかかる。代わりの候補はすべて、パネルに本当に重なる
  const hard = [
    { l: 0, t: 0, r: 1000, b: 150 },
    { l: 0, t: 245, r: 1000, b: 800 },
    { l: 0, t: 150, r: 398, b: 245 },
    { l: 602, t: 150, r: 1000, b: 245 },
  ];
  const other = { l: 400, t: 150, r: 600, b: 190 }; // 真上の候補(t 192)と 2px しか離れていない
  const r = placeHitLabel({ x: 500, y: 250, w: 200, h: 30, obstacles: hard, pills: [other], bounds });
  const sw = swept(r, 200, 30);
  for (const o of hard) assert.equal(overlapArea(sw, o), 0);
  assert.equal(r.overlap, 0);
});
