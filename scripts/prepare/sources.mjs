import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

// 国土数値情報 行政区域データ(N03)。北海道の 2025 年 1 月 1 日時点。
export const N03 = Object.freeze({
  version: 'N03-20250101',
  url: 'https://nlftp.mlit.go.jp/ksj/gml/data/N03/N03-2025/N03-20250101_01_GML.zip',
  zip: 'N03-20250101_01_GML.zip',
  geojson: 'N03-20250101_01.geojson',
});

export async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} の取得に失敗しました: ${res.status}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

export async function ensureN03(rawDir, { refresh = false } = {}) {
  mkdirSync(rawDir, { recursive: true });
  const zip = join(rawDir, N03.zip);
  const geojson = join(rawDir, N03.geojson);
  if (refresh || !existsSync(zip)) await download(N03.url, zip);
  if (refresh || !existsSync(geojson)) execFileSync('unzip', ['-o', '-q', zip, N03.geojson, '-d', rawDir]);
  return geojson;
}
