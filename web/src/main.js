// 地図アプリの入口(Task 9 の段階: 地図、区のラベル、現在時刻だけ。受信は Task 10 でつなぐ)
import './style.css';
import stations from '../../data/stations.json';
import wardsUrl from '../../data/wards.geojson?url';
import { createHub } from './lib/hub.js';
import { legendGradientCss } from './lib/color.js';
import { createMapLayer } from './map-layer.js';
import { createWardLabels } from './labels.js';
import { createClocks } from './panels/clocks.js';

async function main() {
  const wards = await (await fetch(wardsUrl)).json();
  const wardNames = new Map(wards.features.map((f) => [f.properties.id, f.properties.name]));
  const hub = createHub();
  const positions = new Map(); // 区 -> 観測点の画面座標 {x, y}

  document.querySelector('.legend-bar').style.background = legendGradientCss();

  // 左の時計と HUD、右の通知の欄に、観測点が隠れないようにする
  const padding = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const left = Math.min(document.getElementById('hud').getBoundingClientRect().right + 90, w * 0.35);
    const right = Math.min(w - document.getElementById('side').getBoundingClientRect().left + 90, w * 0.4);
    return { top: Math.round(h * 0.12), bottom: Math.round(h * 0.1), left: Math.round(left), right: Math.round(right) };
  };
  const mapLayer = createMapLayer({ container: document.getElementById('map'), wards, stations, padding });
  const labels = createWardLabels(document.getElementById('fx'), stations, wardNames);
  const clocks = createClocks(document.getElementById('clocks'));

  const layout = () => {
    for (const s of stations) positions.set(s.ward, mapLayer.project(s.coordinates));
    labels.layout(positions);
    hub.emit('layout', positions);
  };
  mapLayer.map.on('move', layout);
  mapLayer.map.on('resize', layout);
  mapLayer.ready.then(layout);
  window.addEventListener('resize', () => mapLayer.refit());

  setInterval(() => clocks.render(null, Date.now()), 250);
  window.__sapporo = { mapLayer, positions };
}

main().catch((e) => {
  console.error(e);
  document.body.dataset.error = String(e?.message ?? e);
});
