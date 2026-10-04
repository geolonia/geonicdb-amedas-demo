// 区のラベル(区名、積雪深、気温)。地図の上の DOM で描く(MapLibre の文字は外部のグリフが要るため使わない)。
// 気温が欠測(または1時間以上古い)のときは「—」にして、色を付けない。
import { formatSnowDepth, formatTemperature, temperatureClass } from './lib/format.js';

// 1280 × 720 で重なる区だけ、ラベルをずらす(px。x は負が左、y は負が上)。
// 2026-10-05 の実測(最も長い表示「35cm」「-10.5℃」、Task 13 の報告): ずらしなしでは南区と豊平区が 2px まで近づき、
// 手稲区と HUD、西区と中央区の間も 2〜3px しか空かなかった。南区は下へ(南は地図の端で空いている)、
// 手稲区は右へ(左は HUD)、西区は左へずらし、どの組も 4px 以上空ける。
const LABEL_OFFSET = Object.freeze({ minami: { x: 0, y: 32 }, teine: { x: 6, y: 0 }, nishi: { x: -6, y: 0 } });

export function createWardLabels(layer, stations, wardNames) {
  const labels = new Map();
  for (const s of stations) {
    const el = document.createElement('div');
    el.className = 'ward-label';
    el.dataset.ward = s.ward;
    const name = document.createElement('b');
    name.textContent = wardNames.get(s.ward) ?? s.ward;
    const snow = document.createElement('span');
    snow.className = 'snow';
    snow.textContent = formatSnowDepth(null);
    const temp = document.createElement('span');
    temp.className = 'temp t-none';
    temp.textContent = formatTemperature(null);
    el.append(name, snow, temp);
    layer.append(el);
    labels.set(s.ward, { el, snow, temp });
  }

  return {
    // positions: Map<ward, {x, y}>(観測点の画面座標)。ラベルは観測点の少し下に置く
    layout(positions) {
      for (const [ward, { el }] of labels) {
        const p = positions.get(ward);
        const d = LABEL_OFFSET[ward] ?? { x: 0, y: 0 };
        if (p) el.style.transform = `translate(${Math.round(p.x + d.x)}px, ${Math.round(p.y + 8 + d.y)}px) translateX(-50%)`;
      }
    },
    update(ward, state) {
      const l = labels.get(ward);
      if (!l) return;
      l.snow.textContent = formatSnowDepth(state.snowHeight);
      l.temp.textContent = formatTemperature(state.temperature);
      l.temp.className = `temp t-${temperatureClass(state.temperature)}`;
    },
  };
}
