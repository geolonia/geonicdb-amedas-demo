import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// 取得日は JST(UTC+9)の日付で扱う。
export function jstDate(now = new Date()) {
  return new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

// data/raw/retrieved-at.json に、キャッシュのファイル名ごとの取得日を記録する
// (例: { "N03-20250101_01_GML.zip": "2026-10-04", "sapporo-2025-kita.csv": "2026-10-04" })。
const file = (rawDir) => join(rawDir, 'retrieved-at.json');
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function load(rawDir) {
  try {
    const v = JSON.parse(readFileSync(file(rawDir), 'utf8'));
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

// 実際にダウンロードしたときに、そのファイルの取得日を記録する(ほかのファイルの記録は残す)。
// 記録がない、壊れている、以前の形式({ date })のときは、このファイルの分から作り直す。
export function recordRetrievedAt(rawDir, fileName, now = new Date()) {
  const { date, ...rest } = load(rawDir) ?? {};
  const entries = Object.fromEntries(Object.entries(rest).filter(([, v]) => typeof v === 'string' && DATE.test(v)));
  writeFileSync(file(rawDir), JSON.stringify({ ...entries, [fileName]: jstDate(now) }, null, 2) + '\n');
}

// キャッシュを再利用したときは、記録を読み戻す。複数のファイルなら、最も早い取得日を返す(控えめな側)。
// 記録がないファイルがあれば、取得日を推測せず(今日の日付などで補わず)、取得し直すよう促すエラーにする。
export function readRetrievedAt(rawDir, fileNames) {
  const recorded = load(rawDir) ?? {};
  const unknown = fileNames.filter((f) => !(typeof recorded[f] === 'string' && DATE.test(recorded[f])));
  if (unknown.length > 0) {
    throw new Error(
      `${file(rawDir)} に、次のファイルの取得日の記録がありません: ${unknown.join(', ')}。` +
        '`npm run build:data -- --refresh` で取得し直してください',
    );
  }
  return fileNames.map((f) => recorded[f]).sort()[0];
}
