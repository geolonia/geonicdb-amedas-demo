// 表示用の文字列。時刻はすべて JST で表示する(実行する機のタイムゾーンに依存しない)。
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const jstIso = (ms) => new Date(ms + JST_OFFSET_MS).toISOString();

// 値がないときの表示
export const MISSING = '—';

// 2025-11-18 16:00 JST(seconds: true なら 2025-11-18 16:00:05 JST)
export function formatJst(ms, { seconds = false } = {}) {
  if (!Number.isFinite(ms)) return MISSING;
  const s = jstIso(ms);
  return `${s.slice(0, 10)} ${s.slice(11, seconds ? 19 : 16)} JST`;
}

// 受信時刻(ログとヒット欄): 16:00:05.123
export function formatTimeOfDay(ms) {
  if (!Number.isFinite(ms)) return MISSING;
  return jstIso(ms).slice(11, 23);
}

// 観測時刻の時:分(ヒット欄): 07:00
export function formatHourMinute(ms) {
  if (!Number.isFinite(ms)) return MISSING;
  return jstIso(ms).slice(11, 16);
}

// 気温: -1.2℃。欠測(null)は「—」
export function formatTemperature(v) {
  if (!Number.isFinite(v)) return MISSING;
  const r = Math.round(v * 10) / 10;
  return `${(Object.is(r, -0) ? 0 : r).toFixed(1)}℃`;
}

// 積雪深: 35cm。欠測(null)は「—」
export function formatSnowDepth(v) {
  return Number.isFinite(v) ? `${Math.round(v)}cm` : MISSING;
}

// ミリ秒の整数(HUD の遅延)。値がなければ「—」
export function formatMs(v) {
  return Number.isFinite(v) ? String(Math.round(v)) : MISSING;
}

// 気温の色分け(ラベルの文字色の CSS クラス)。欠測は 'none'(色を付けない)
export function temperatureClass(v) {
  if (!Number.isFinite(v)) return 'none';
  if (v <= 0) return 'cold';
  if (v <= 3) return 'near';
  return 'warm';
}
