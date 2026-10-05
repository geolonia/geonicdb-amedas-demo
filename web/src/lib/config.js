// 地図アプリの設定を、URL の検索文字列(location.search)から読む。
// ?mqtt=ws://host:port … MQTT の WebSocket(既定は ws://127.0.0.1:9001)
// ?debug               … 受信ログを残す(window.__sapporo.received)
// ?live=off            … 当日の最新値(気象庁)を取りに行かない
export const DEFAULT_MQTT_URL = 'ws://127.0.0.1:9001';

// new URL で読める ws: / wss: で、ホスト名があるものだけ(壊れた値で WebSocket の生成が例外になるのを防ぐ)
function isWebSocketUrl(raw) {
  try {
    const u = new URL(raw);
    return (u.protocol === 'ws:' || u.protocol === 'wss:') && u.hostname !== '';
  } catch {
    return false;
  }
}

export function readConfig(search) {
  const params = new URLSearchParams(search);
  const warnings = [];
  let mqttUrl = DEFAULT_MQTT_URL;
  const raw = params.get('mqtt');
  if (raw !== null && raw !== '') {
    if (isWebSocketUrl(raw)) mqttUrl = raw;
    else warnings.push(`mqtt の値が ws:// か wss:// の正しい URL でないため、既定の ${DEFAULT_MQTT_URL} を使います: ${raw}`);
  }
  return {
    mqttUrl,
    debug: params.has('debug'),
    liveWidget: params.get('live') !== 'off',
    warnings,
  };
}
