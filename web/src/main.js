// 地図アプリの入口。受信 → 正規化 → 区の値と統計の更新 → 演出、の順につなぐ。
// 演出は app.on(...) で受け取る(lib/hub.js)。次点・余裕の演出は、末尾の「演出の組み込み」に1行ずつ足す。
import './style.css';
import stations from '../../data/stations.json';
import wardsUrl from '../../data/wards.geojson?url';
import { loadJson } from './lib/load.js';
import { readConfig } from './lib/config.js';
import { createHub } from './lib/hub.js';
import { createWardStore } from './lib/store.js';
import { createStats } from './lib/stats.js';
import { safely } from './lib/safely.js';
import { createHitDeduper } from './lib/dedupe.js';
import { legendGradientCss } from './lib/color.js';
import { createMapLayer } from './map-layer.js';
import { createWardLabels } from './labels.js';
import { connectFeed } from './mqtt-feed.js';
import { createClocks } from './panels/clocks.js';
import { createHud } from './panels/hud.js';
import { installHitEffects } from './effects/hit-effects.js';

async function main() {
  // 現在時刻の時計は、データを読む前に始める(読み込みに失敗しても止めない)
  const clocks = createClocks(document.getElementById('clocks'));
  let observedClock = () => null; // データを読めたら store.clock に差し替える
  setInterval(() => clocks.render(observedClock(), Date.now()), 250);

  const config = readConfig(location.search);
  for (const w of config.warnings) console.warn(w);

  const wards = await loadJson(wardsUrl);
  const wardNames = new Map(wards.features.map((f) => [f.properties.id, f.properties.name]));
  const wardIds = new Set(wardNames.keys());
  const hub = createHub();
  const store = createWardStore([...wardIds]);
  const stats = createStats();
  const deduper = createHitDeduper();
  observedClock = () => store.clock();
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
  const fx = document.getElementById('fx');
  const labels = createWardLabels(fx, stations, wardNames);
  const hud = createHud(document.getElementById('hud'));

  const layout = () => {
    for (const s of stations) positions.set(s.ward, mapLayer.project(s.coordinates));
    labels.layout(positions);
    hub.emit('layout', positions);
  };
  mapLayer.map.on('move', layout);
  mapLayer.map.on('resize', layout);
  mapLayer.ready.then(layout);
  window.addEventListener('resize', () => mapLayer.refit());

  // 演出が共有するもの
  const app = { config, on: hub.on, stations, wardNames, positions, mapLayer, fx };

  function handle(obs) {
    if (obs.kind === 'live') {
      stats.recordLive(obs);
      const state = store.applyLive(obs);
      if (!state) return;
      mapLayer.setSnow(obs.ward, state.snowHeight);
      labels.update(obs.ward, state);
      hub.emit('live', obs, state);
      return;
    }
    stats.recordConditional(obs);
    hub.emit('conditional', obs);
    const hit = deduper.offer(obs);
    if (hit.action === 'show' || hit.action === 'upgrade') hub.emit('hit', hit, obs);
  }

  const debugLog = config.debug ? [] : null;
  // 1件の処理が失敗しても、次の1件へ進む(mqtt.js のコールバックへ例外を届けない)
  const onError = (e) => console.error('通知の処理に失敗しました', e);
  try {
    connectFeed({
      url: config.mqttUrl,
      wardIds,
      debugLog,
      onStatus: (s) => hud.setStatus(s),
      onObservations: (list) => {
        for (const obs of list) safely(() => handle(obs), onError);
      },
    });
  } catch (e) {
    // 接続の失敗でアプリを止めない(HUD と演出は動かす)
    console.error('MQTT の開始に失敗しました', e);
    hud.setStatus('error');
  }

  // HUD は 4回/秒で描き直す(通知ごとには描かない。時計は上の setInterval)
  setInterval(() => {
    const now = Date.now();
    hud.render(stats.snapshot(now));
    hub.emit('tick', now);
  }, 250);

  // Playwright と手動の確認用(?debug のときは受信ログも)
  window.__sapporo = { app, stats: () => stats.snapshot(Date.now()), clock: () => store.clock(), ward: (w) => store.get(w), received: debugLog };

  // ---- 演出の組み込み(1行ずつ。削るときは、その行を消す) ----
  installHitEffects(app);
}

main().catch((e) => {
  console.error(e);
  const message = String(e?.message ?? e);
  document.body.dataset.error = message;
  const fatal = document.getElementById('fatal');
  fatal.textContent = `読み込みに失敗しました: ${message}`;
  fatal.hidden = false;
});
