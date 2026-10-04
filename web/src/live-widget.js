// 当日の最新値(気象庁アメダス「札幌」)。右の欄の下に小さく出す(設計書 5.4)。
// 取れたときだけ表示し、出典(気象庁)と加工した旨を、すぐ下に書く。
// 取れなければ、出典も含めて何も出さない。主画面の動作には関わらない(受信や演出とは独立に動く)。
// ?live=off で取りに行かない(ネットワークのない会場、通しの確認)。
import { loadLatest, widgetText } from './lib/jma.js';

const REFRESH_MS = 10 * 60 * 1000;

export function installLiveWidget(app) {
  if (!app.config.liveWidget) return;
  const panel = document.createElement('section');
  panel.id = 'live-widget';
  panel.hidden = true;
  panel.setAttribute('aria-label', '当日の最新値');
  const heading = document.createElement('h2');
  heading.textContent = 'いまの札幌(気象庁アメダス)';
  const value = document.createElement('div');
  value.className = 'live-value';
  const meta = document.createElement('div');
  meta.className = 'live-meta';
  const source = document.createElement('div');
  source.className = 'live-source';
  source.textContent = '出典: 気象庁ホームページ(アメダス「札幌」)の値を加工して表示';
  panel.append(heading, value, meta, source);
  document.getElementById('side').append(panel);

  const refresh = async () => {
    const p = await loadLatest(globalThis.fetch, { nowMs: Date.now() });
    if (!p) {
      panel.hidden = true;
      return;
    }
    value.textContent = widgetText(p);
    meta.textContent = `${p.time} の観測`;
    panel.hidden = false;
  };
  refresh();
  setInterval(refresh, REFRESH_MS);
}
