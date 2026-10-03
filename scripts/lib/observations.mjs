import { readFileSync } from 'node:fs';

export const OBS_KEYS = Object.freeze(['temperature', 'windDirection', 'windSpeed', 'precipitation', 'snowHeight', 'snowfall1h']);
const COLUMNS = ['t', ...OBS_KEYS];

export function packObservations(list) {
  return { columns: [...COLUMNS], rows: list.map((o) => [o.t, ...OBS_KEYS.map((k) => o[k] ?? null)]) };
}

export function unpackObservations({ columns, rows }) {
  if (JSON.stringify(columns) !== JSON.stringify(COLUMNS)) throw new Error(`columns が想定と異なります: ${JSON.stringify(columns)}`);
  return rows.map((r) => {
    const o = { t: r[0] };
    OBS_KEYS.forEach((k, i) => {
      if (r[i + 1] !== null) o[k] = r[i + 1];
    });
    return o;
  });
}

// 観測は 10 分刻みで、JST(+9:00)と UTC は分が一致するため、t の分で正時を判定できる。
const isHourly = (o) => o.t.slice(14, 16) === '00';

export function summarizeMissing(list) {
  const missing = Object.fromEntries(OBS_KEYS.map((k) => [k, 0]));
  for (const o of list) {
    for (const k of OBS_KEYS) {
      if (k === 'snowfall1h' && !isHourly(o)) continue;
      if (o[k] === undefined) missing[k]++;
    }
  }
  return { rows: list.length, missing };
}

export function loadObservationFile(path) {
  const doc = JSON.parse(readFileSync(path, 'utf8'));
  return { ward: doc.ward, source: doc.source, observations: unpackObservations(doc) };
}
