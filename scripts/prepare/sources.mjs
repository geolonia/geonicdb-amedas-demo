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

export const CKAN_PACKAGE = 'https://ckan.pf-sapporo.jp/api/3/action/package_show?id=sapporo_weather';

// CKAN のリソース名は「2025年　中央区　気象観測記録」(区切りは全角スペース)。
// ファイル名の綴りは区ごとに揺れているため、名称から区を引く。
export async function ckanResources(year = 2025) {
  const res = await fetch(CKAN_PACKAGE);
  if (!res.ok) throw new Error(`CKAN の取得に失敗しました: ${res.status}`);
  const pkg = (await res.json()).result;
  const re = new RegExp(`^${year}年\\s*(.+?)\\s*気象観測記録$`);
  const byName = new Map();
  for (const r of pkg.resources) {
    const m = re.exec(r.name);
    if (m && r.format === 'CSV') byName.set(m[1], r.url);
  }
  return { pkg, byName };
}
