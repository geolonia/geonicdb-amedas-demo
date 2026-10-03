// 札幌市 CKAN の気象観測記録 CSV を、観測値の配列に変換する。
// 列: 日付,時刻,気温,風向,風速,降水量,積雪深,前1時間降雪量
// 欠測は全角の「×」(積雪深は「-」も)。降雪量の「-」は、正時以外で値がないという意味。
// どれも「その属性を持たない」として扱う。

const MISSING = new Set(['', '×', '-']);
const COLUMNS = [
  ['temperature', 2],
  ['windDirection', 3],
  ['windSpeed', 4],
  ['precipitation', 5],
  ['snowHeight', 6],
  ['snowfall1h', 7],
];

// 日付は YYYY-MM-DD、時刻は H:MM(ゼロ埋めなし。24:00 がある)。どちらも JST。
// Date.UTC は時の繰り上がりを扱うため、24:00 は自然に翌日の 00:00 になる。
export function toUtcIso(date, time, lineNo = 0) {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!d || !t) throw new Error(`${lineNo} 行目: 日時の形式が想定と異なります: ${date} ${time}`);
  const ms = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]) - 9, Number(t[2]));
  return new Date(ms).toISOString().replace('.000Z', 'Z');
}

export function parseObservationCsv(text, { month } = {}) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (!lines[0]?.startsWith('日付,時刻,')) throw new Error(`CSV のヘッダーが想定と異なります: ${lines[0]}`);
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const lineNo = i + 1;
    const cells = lines[i].split(',');
    if (cells.length !== 8) throw new Error(`${lineNo} 行目: 列数が 8 ではありません: ${lines[i]}`);
    const [date, time] = cells;
    if (month && !date.startsWith(month)) continue;
    const obs = { t: toUtcIso(date, time, lineNo) };
    for (const [key, idx] of COLUMNS) {
      const raw = cells[idx].trim();
      if (MISSING.has(raw)) continue;
      const n = Number(raw);
      if (!Number.isFinite(n)) throw new Error(`${lineNo} 行目: 数値として読めません: ${raw}`);
      obs[key] = n;
    }
    out.push(obs);
  }
  return out;
}
