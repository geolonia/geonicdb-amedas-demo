// 波紋(CSS アニメーション。transform と opacity だけを動かす)と、条件ヒットのラベル。
// - 通常の更新: 細いリング1本(控えめ)
// - 条件ヒット: 太い発光リング2本 + ラベル(橙 = 3cm 以上、赤 = 5cm 以上)
// - 同じ書き込みで強い購読の通知があとから届いたら、弱い方の演出を消して置き換える
// - 隠れたタブでは通常の波紋を出さない(アニメーションが止まり、要素がたまるため。lib/pulse.js)
import { canPulse } from '../lib/pulse.js';

export function createRipples(layer) {
  const active = new Map(); // hit.key -> 要素の配列
  let enabled = true;
  let liveRings = 0;

  function place(el, x, y) {
    el.style.left = `${Math.round(x)}px`;
    el.style.top = `${Math.round(y)}px`;
    layer.append(el);
    return el;
  }

  function ring(x, y, className) {
    const el = document.createElement('div');
    el.className = className;
    el.addEventListener('animationend', () => el.remove(), { once: true });
    return place(el, x, y);
  }

  return {
    setEnabled(v) {
      enabled = v;
    },
    // 通常の更新(live の通知)
    pulse(x, y) {
      if (!enabled || !canPulse({ hidden: document.hidden, active: liveRings })) return;
      liveRings++;
      ring(x, y, 'ring ring-live').addEventListener('animationend', () => liveRings--, { once: true });
    },
    // 条件ヒット(トグルに関係なく出す。必須の演出)
    hit(key, x, y, tier, text) {
      for (const el of active.get(key) ?? []) el.remove();
      const els = [ring(x, y, `ring ring-hit ${tier}`), ring(x, y, `ring ring-hit ${tier} delayed`)];
      const label = document.createElement('div');
      label.className = `hit-label ${tier}`;
      label.textContent = text;
      label.addEventListener(
        'animationend',
        () => {
          label.remove();
          if (active.get(key) === els) active.delete(key);
        },
        { once: true },
      );
      els.push(place(label, x, y));
      active.set(key, els);
    },
  };
}
