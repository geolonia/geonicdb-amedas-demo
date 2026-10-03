import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { extractWards } from './wards-geojson.mjs';
import { ensureN03, N03 } from './sources.mjs';

const refresh = process.argv.includes('--refresh');
const RAW = 'data/raw';
const OUT = 'data';

mkdirSync(OUT, { recursive: true });

// 1. 区の境界
const n03Path = await ensureN03(RAW, { refresh });
const wards = extractWards(JSON.parse(readFileSync(n03Path, 'utf8')));
writeFileSync(`${OUT}/wards.geojson`, JSON.stringify(wards));
console.log(`${OUT}/wards.geojson: ${wards.features.length} 区(${N03.version})`);
