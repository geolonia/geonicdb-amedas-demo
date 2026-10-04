// 気象庁アメダス「札幌」(観測所 14163)の最新値の読み取り(純関数)。
// 取得元は気象庁ホームページの bosai の JSON。公式の API 仕様ではないため、形が変わる可能性がある。
// 読めない形のときは null を返し、ウィジェットを出さない(主画面には影響させない)。
//
// 1. latest_time.txt: 「2026-10-04T21:00:00+09:00」のような最新の観測時刻(JST)
// 2. point/14163/<YYYYMMDD>_<HH>.json: 3時間ごとのファイル(HH は 00、03、…、21)。
//    キーは「YYYYMMDDhhmmss」(JST)、値は { temp: [値, 品質], wind: [...], windDirection: [...], snow: [...], … }。
//    品質の 0 だけを採用する(2026-10-04 の実データでは、積雪は snow: [null, 5]、snow1h: [0, 6] のように 0 以外)。
// 積雪は、冬季の観測が再開してから形を確かめる(設計書 5.4)。それまでは気温と風だけを表示する。

export const JMA_AMEDAS_BASE = 'https://www.jma.go.jp/bosai/amedas/data';
export const SAPPORO_STATION = '14163';
export const LATEST_TIME_URL = `${JMA_AMEDAS_BASE}/latest_time.txt`;

const LATEST_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\+09:00$/;

// 16方位(風向の値は 0〜16。0 は静穏、16 は北)
export const WIND_DIRECTIONS = Object.freeze([
  '静穏', '北北東', '北東', '東北東', '東', '東南東', '南東', '南南東',
  '南', '南南西', '南西', '西南西', '西', '西北西', '北西', '北北西', '北',
]);

// latest_time.txt の本文から、観測時刻のキー(YYYYMMDDhhmmss)と、点のファイルの URL を作る
export function parseLatestTime(text, station = SAPPORO_STATION) {
  const m = LATEST_RE.exec(String(text ?? '').trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const block = String(Math.floor(Number(h) / 3) * 3).padStart(2, '0');
  return {
    key: `${y}${mo}${d}${h}${mi}${s}`,
    url: `${JMA_AMEDAS_BASE}/point/${station}/${y}${mo}${d}_${block}.json`,
  };
}

// 観測時刻(「2026-10-05T01:50:00+09:00」の形。タイムゾーンつきの文字列だけ)が、nowMs から見て新しいか。
// 古すぎる(既定: 3時間 = 更新間隔 1時間の3倍を超える)ときと、未来(10分より先)のときは false。純関数(now は引数)。
export function isFresh(observedAtIso, nowMs, maxAgeMs = 3 * 3600_000) {
  const text = String(observedAtIso ?? '').trim();
  if (!LATEST_RE.test(text) || !Number.isFinite(nowMs)) return false;
  const age = nowMs - Date.parse(text);
  return Number.isFinite(age) && age <= maxAgeMs && age >= -10 * 60_000;
}

// [値, 品質] の組から、品質 0 の数だけを取り出す
function good(pair) {
  if (!Array.isArray(pair) || pair[1] !== 0) return null;
  return typeof pair[0] === 'number' && Number.isFinite(pair[0]) ? pair[0] : null;
}

// 点のファイルの JSON から、latestKey 以前で最も新しい観測を読む。
// 戻り値: { time: '2026-10-04 21:00 JST', temperature, wind, windDirection } | null(気温も風もなければ null)
export function parsePoint(json, latestKey) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  const keys = Object.keys(json).filter((k) => /^\d{14}$/.test(k) && (!latestKey || k <= latestKey)).sort();
  const key = keys.at(-1);
  if (!key) return null;
  const r = json[key];
  const temperature = good(r?.temp);
  const wind = good(r?.wind);
  if (temperature === null && wind === null) return null;
  const dir = good(r?.windDirection);
  const windDirection = Number.isInteger(dir) && dir >= 0 && dir <= 16 ? WIND_DIRECTIONS[dir] : null;
  return {
    time: `${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6, 8)} ${key.slice(8, 10)}:${key.slice(10, 12)} JST`,
    temperature,
    wind,
    windDirection,
  };
}

// ウィジェットの本文: 「気温 12.0℃ ・ 風 南 0.9m/s」
export function widgetText(p) {
  const t = Number.isFinite(p.temperature) ? `${p.temperature.toFixed(1)}℃` : '—';
  const w = Number.isFinite(p.wind) ? `${p.windDirection ?? ''} ${p.wind.toFixed(1)}m/s`.trim() : '—';
  return `気温 ${t} ・ 風 ${w}`;
}

// 取得して読む。どんな失敗(ネットワーク、タイムアウト、HTTP の失敗、形の違い)でも null を返し、例外にしない。
// fetchImpl はテストで差し替える。タイマーは、応答のあとに必ず止める(テストのプロセスを残さない)。
export async function loadLatest(fetchImpl = globalThis.fetch, { timeoutMs = 8000, nowMs = Date.now() } = {}) {
  const get = async (url) => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const r = await fetchImpl(url, { signal: ctl.signal, cache: 'no-store' });
      if (!r.ok) return null;
      return await r.text();
    } finally {
      clearTimeout(timer);
    }
  };
  try {
    const latestText = await get(LATEST_TIME_URL);
    const latest = parseLatestTime(latestText);
    // JMA が止まっているときに、古い値を「いま」として見せない
    if (!latest || !isFresh(latestText, nowMs)) return null;
    const text = await get(latest.url);
    if (text === null) return null;
    return parsePoint(JSON.parse(text), latest.key);
  } catch {
    return null;
  }
}
