import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// 取得日は JST(UTC+9)の日付で扱う。
export function jstDate(now = new Date()) {
  return new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

const file = (rawDir) => join(rawDir, 'retrieved-at.json');

// 実際にダウンロードしたときに、その日付を記録する。
export function recordRetrievedAt(rawDir, now = new Date()) {
  writeFileSync(file(rawDir), JSON.stringify({ date: jstDate(now) }) + '\n');
}

// キャッシュを再利用したときは記録を読み戻す。記録がなければ今日(JST)。
export function readRetrievedAt(rawDir, now = new Date()) {
  try {
    const { date } = JSON.parse(readFileSync(file(rawDir), 'utf8'));
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  } catch {}
  return jstDate(now);
}
