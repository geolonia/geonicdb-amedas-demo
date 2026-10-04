// 波紋と条件ヒットの演出を、受信のイベントにつなぐ(必須の演出)。
// - live: 観測点に控えめな波紋(面の更新は main.js が行う)
// - hit(dedupe を通ったもの): 強い波紋とラベル、区の外周の強調、ヒット欄の行
//   live の通知では、条件の演出を出さない(dedupe が 'hit' を出さない)
import { createRipples } from './ripples.js';
import { createHitList } from '../panels/hits.js';

export function installHitEffects(app) {
  const ripples = createRipples(app.fx);
  const hitList = createHitList(document.getElementById('hits'));
  app.ripples = ripples;

  app.on('live', (obs) => {
    const p = app.positions.get(obs.ward);
    if (p) ripples.pulse(p.x, p.y);
  });

  app.on('hit', (hit, obs) => {
    const name = app.wardNames.get(hit.ward) ?? hit.ward;
    const p = app.positions.get(hit.ward);
    if (p) ripples.hit(hit.key, p.x, p.y, hit.tier, `${name} 1時間降雪量 ${hit.value}cm`);
    app.mapLayer.flashHit(hit.ward, hit.tier);
    hitList.render(hit, name, obs);
  });
}
