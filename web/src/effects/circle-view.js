// 円表示への切り替え(余裕があれば)。観測点に、積雪深の大きさと色の円を描く。面の塗りは隠す。
// 色は面と同じ式(lib/color.js)。円の値は map-layer の setSnow が stations の feature-state にも入れている。
import { snowColorExpression } from '../lib/color.js';

export function installCircleView(app) {
  const { map } = app.mapLayer;
  let view = 'area';
  app.mapLayer.ready.then(() => {
    map.addLayer(
      {
        id: 'station-circle',
        type: 'circle',
        source: 'stations',
        layout: { visibility: 'none' },
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['to-number', ['coalesce', ['feature-state', 'snow'], 0]], 0, 10, 35, 46],
          'circle-color': snowColorExpression(),
          'circle-opacity': 0.85,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5,
        },
      },
      'station-dot',
    );
  });
  app.controls?.addButton('表示: 面(区)', (button) => {
    if (!map.getLayer('station-circle')) return; // 地図の準備前は何もしない(レイヤーがまだない)
    view = view === 'area' ? 'circle' : 'area';
    map.setLayoutProperty('ward-fill', 'visibility', view === 'area' ? 'visible' : 'none');
    map.setLayoutProperty('station-circle', 'visibility', view === 'area' ? 'none' : 'visible');
    button.textContent = view === 'area' ? '表示: 面(区)' : '表示: 円(観測点)';
  });
}
