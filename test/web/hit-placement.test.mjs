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
