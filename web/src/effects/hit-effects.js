// 波紋と条件ヒットの演出を、受信のイベントにつなぐ(必須の演出)。
// - live: 観測点に控えめな波紋(面の更新は main.js が行う)
// - hit(dedupe を通ったもの): 強い波紋とラベル、区の外周の強調、ヒット欄の行
//   live の通知では、条件の演出を出さない(dedupe が 'hit' を出さない)
import { createRipples } from './ripples.js';
import { createHitList } from '../panels/hits.js';
import { placeHitLabel, HIT_DRIFT } from '../lib/hit-placement.js';

// ヒットのラベルが避けるパネル(隠したパネルは避けない)
const PANELS = Object.freeze(['clocks', 'hud', 'side', 'title', 'controls', 'legend', 'attribution']);

// ヒットのラベルを、区のラベル、パネル、ほかのヒットのラベルに重ならない位置に置く(lib/hit-placement.js)
function createLabelPlacer(fx) {
  const placed = new WeakMap(); // 置いたヒットのラベル -> 動く範囲を含めた箱
  return (el, x, y, ward) => {
    const origin = fx.getBoundingClientRect();
    const rect = (e) => {
      const b = e.getBoundingClientRect();
      return { l: b.left - origin.left, t: b.top - origin.top, r: b.right - origin.left, b: b.bottom - origin.top };
    };
    const labels = [...fx.querySelectorAll('.ward-label')];
    const own = labels.find((e) => e.dataset.ward === ward);
    const obstacles = [
      ...labels.map(rect),
      ...PANELS.map((id) => document.getElementById(id)).filter((e) => e && e.getClientRects().length > 0).map(rect),
      ...[...fx.querySelectorAll('.hit-label')].filter((e) => e !== el && placed.has(e)).map((e) => placed.get(e)),
    ];
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const p = placeHitLabel({ x, y, w, h, obstacles, bounds: { l: 0, t: 0, r: origin.width, b: origin.height }, below: own ? rect(own).b : undefined });
    placed.set(el, { l: p.left, t: p.top - HIT_DRIFT.up, r: p.left + w, b: p.top + h + HIT_DRIFT.down });
    return p;
  };
}

export function installHitEffects(app) {
  const ripples = createRipples(app.fx, { placeLabel: createLabelPlacer(app.fx) });
  const hitList = createHitList(document.getElementById('hits'));
  app.ripples = ripples;

  app.on('live', (obs) => {
    const p = app.positions.get(obs.ward);
    if (p) ripples.pulse(p.x, p.y);
  });

  app.on('hit', (hit, obs) => {
    const name = app.wardNames.get(hit.ward) ?? hit.ward;
    const p = app.positions.get(hit.ward);
    if (p) ripples.hit(hit.key, p.x, p.y, hit.tier, `${name} 1時間降雪量 ${hit.value}cm`, hit.ward);
    app.mapLayer.flashHit(hit.ward, hit.tier);
    hitList.render(hit, name, obs);
  });
}
