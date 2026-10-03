import { readFileSync } from 'node:fs';
import { WARDS } from '../lib/wards.mjs';
import { loadObservationFile } from '../lib/observations.mjs';

// 区の順に、観測地点と観測値を読み込む。
export function loadDemoData(dataDir) {
  const stations = JSON.parse(readFileSync(`${dataDir}/stations.json`, 'utf8'));
  const wards = WARDS.map((ward) => {
    const station = stations.find((s) => s.ward === ward.id);
    if (!station) throw new Error(`stations.json に ${ward.id} がありません`);
    const { observations } = loadObservationFile(`${dataDir}/observations/${ward.id}.json`);
    return { ward, station, observations };
  });
  return { wards, byWard: new Map(wards.map((w) => [w.ward.id, w.observations])) };
}
