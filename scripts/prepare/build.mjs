import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { extractWards } from './wards-geojson.mjs';
import { ensureN03, N03, download, ckanResources } from './sources.mjs';
import { WARDS } from '../lib/wards.mjs';
import { parseObservationCsv } from './parse-csv.mjs';
import { packObservations, summarizeMissing } from '../lib/observations.mjs';
import { renderAttribution } from './attribution.mjs';

const refresh = process.argv.includes('--refresh');
const RAW = 'data/raw';
const OUT = 'data';

mkdirSync(OUT, { recursive: true });

// 1. 区の境界
const n03Path = await ensureN03(RAW, { refresh });
const wards = extractWards(JSON.parse(readFileSync(n03Path, 'utf8')));
writeFileSync(`${OUT}/wards.geojson`, JSON.stringify(wards));
console.log(`${OUT}/wards.geojson: ${wards.features.length} 区(${N03.version})`);

// 2. 観測値(2025年11月、10区)
const MONTH = '2025-11';
const { pkg, byName } = await ckanResources(2025);
mkdirSync(`${OUT}/observations`, { recursive: true });
const resources = {};
for (const w of WARDS) {
  const url = byName.get(w.name);
  if (!url) throw new Error(`CKAN に ${w.name} の 2025 年の CSV がありません`);
  resources[w.id] = url;
  const csvPath = `${RAW}/sapporo-2025-${w.id}.csv`;
  if (refresh || !existsSync(csvPath)) await download(url, csvPath);
  const observations = parseObservationCsv(readFileSync(csvPath, 'utf8'), { month: MONTH });
  const { rows, missing } = summarizeMissing(observations);
  const packed = packObservations(observations);
  const head = JSON.stringify({ ward: { code: w.code, id: w.id, name: w.name }, source: { resource: `2025年 ${w.name} 気象観測記録`, url }, columns: packed.columns });
  writeFileSync(`${OUT}/observations/${w.id}.json`, `${head.slice(0, -1)},"rows":[\n${packed.rows.map((r) => JSON.stringify(r)).join(',\n')}\n]}\n`);
  console.log(`${w.id}: ${rows} 行、欠測 ${JSON.stringify(missing)}`);
}

// 3. 出典
const meta = {
  retrievedAt: new Date().toISOString().slice(0, 10),
  ckan: {
    title: pkg.title,
    license: pkg.license_title,
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/deed.ja',
    // CKAN の author(2026-10 時点で「札幌市建設局雪対策室事業課」、データセットのページの作成者欄と一致)。
    author: pkg.author || pkg.maintainer || '札幌市',
    modified: String(pkg.metadata_modified).slice(0, 10),
    url: 'https://ckan.pf-sapporo.jp/dataset/sapporo_weather',
  },
  n03: { version: N03.version, url: N03.url },
  resources,
};
writeFileSync(`${OUT}/source-meta.json`, JSON.stringify(meta, null, 2) + '\n');
writeFileSync(`${OUT}/ATTRIBUTION.md`, renderAttribution(meta));
console.log('出典:', meta.ckan.author, meta.ckan.license);
