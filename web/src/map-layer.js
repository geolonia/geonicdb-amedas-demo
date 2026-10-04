// 地図(MapLibre)。タイルは使わず、背景と区の GeoJSON だけで描く(外部通信なし)。
// 文字(text-field)は使わない: MapLibre の文字は、フォントのグリフを外部から取るため。区のラベルは DOM で描く(labels.js)。
import { Map as MapLibreMap, setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { snowColorExpression } from './lib/color.js';

// バンドルした Worker を使う(既定では、maplibre-gl.mjs の隣のファイルを探して失敗する)
setWorkerUrl(workerUrl);

const BACKGROUND = '#070d18';
const HIT_LEVEL = Object.freeze({ ge3: 1, ge5: 2 });
const HIT_FLASH_MS = 1800;

function stationBounds(stations) {
  const lngs = stations.map((s) => s.coordinates[0]);
  const lats = stations.map((s) => s.coordinates[1]);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}

const hitLevel = ['coalesce', ['feature-state', 'hit'], 0];

// wards: 区の境界の GeoJSON(properties.id が区の ID)、stations: data/stations.json
// padding: () => { top, bottom, left, right }(パネルに隠れない範囲に、観測点を収めるための余白。南区は途中で切れてよい。設計書 5.5)
export function createMapLayer({ container, wards, stations, padding }) {
  const bounds = stationBounds(stations);
  const map = new MapLibreMap({
    container,
    style: { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': BACKGROUND } }] },
    bounds,
    fitBoundsOptions: { padding: padding() },
    interactive: false,
    attributionControl: false,
    fadeDuration: 0,
  });

  let loaded = false;
  const pendingSnow = new Map();
  const hitTimers = new Map();

  const ready = new Promise((resolve) => {
    map.on('load', () => {
      map.addSource('wards', { type: 'geojson', data: wards, promoteId: 'id' });
      map.addSource('stations', {
        type: 'geojson',
        promoteId: 'ward',
        data: {
          type: 'FeatureCollection',
          features: stations.map((s) => ({ type: 'Feature', properties: { ward: s.ward }, geometry: { type: 'Point', coordinates: s.coordinates } })),
        },
      });
      map.addLayer({ id: 'ward-fill', type: 'fill', source: 'wards', paint: { 'fill-color': snowColorExpression() } });
      map.addLayer({
        id: 'ward-line',
        type: 'line',
        source: 'wards',
        paint: {
          'line-color': ['match', hitLevel, 2, '#ff3d7f', 1, '#ffb020', '#3d4f70'],
          'line-width': ['match', hitLevel, 0, 1, 3],
        },
      });
      map.addLayer({
        id: 'station-dot',
        type: 'circle',
        source: 'stations',
        paint: { 'circle-radius': 3.5, 'circle-color': '#ffffff', 'circle-stroke-color': '#0b1424', 'circle-stroke-width': 1.5 },
      });
      loaded = true;
      for (const [ward, cm] of pendingSnow) setSnow(ward, cm);
      pendingSnow.clear();
      resolve();
    });
  });

  // 積雪深(cm)で区を塗る。null は「値なし」の色
  function setSnow(ward, cm) {
    if (!loaded) {
      pendingSnow.set(ward, cm);
      return;
    }
    const snow = Number.isFinite(cm) ? cm : -1;
    map.setFeatureState({ source: 'wards', id: ward }, { snow });
    map.setFeatureState({ source: 'stations', id: ward }, { snow });
  }

  // 条件ヒットの区の外周を、しばらく強調する(強い購読があとから届いたら、色を上書きする)
  function flashHit(ward, tier) {
    if (!loaded) return;
    clearTimeout(hitTimers.get(ward));
    map.setFeatureState({ source: 'wards', id: ward }, { hit: HIT_LEVEL[tier] ?? 0 });
    hitTimers.set(ward, setTimeout(() => map.setFeatureState({ source: 'wards', id: ward }, { hit: 0 }), HIT_FLASH_MS));
  }

  function refit() {
    map.resize();
    map.fitBounds(bounds, { padding: padding(), animate: false });
  }

  return {
    map,
    ready,
    setSnow,
    flashHit,
    refit,
    project: (lngLat) => map.project(lngLat),
  };
}
