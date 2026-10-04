// 区のラベル(区名、積雪深、気温)。地図の上の DOM で描く(MapLibre の文字は外部のグリフが要るため使わない)。
// 気温が欠測(または1時間以上古い)のときは「—」にして、色を付けない。
import { formatSnowDepth, formatTemperature, temperatureClass } from './lib/format.js';

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
        if (p) el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y + 8)}px) translateX(-50%)`;
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
