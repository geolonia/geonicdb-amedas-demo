import { WARDS } from '../lib/wards.mjs';

const roundCoords = (c, d) => (typeof c[0] === 'number' ? c.map((n) => Number(n.toFixed(d))) : c.map((x) => roundCoords(x, d)));

// N03 の 2025 年版では、市が N03_004、区が N03_005、団体コードが N03_007。
// 年次版で列の意味が変わるため、団体コード(N03_007)で選ぶ。
export function extractWards(fc, { decimals = 4 } = {}) {
  const byCode = new Map(fc.features.map((f) => [f.properties.N03_007, f]));
  const features = WARDS.map((w) => {
    const f = byCode.get(w.code);
    if (!f) throw new Error(`N03 に区コード ${w.code}(${w.name})がありません`);
    return {
      type: 'Feature',
      properties: { code: w.code, id: w.id, name: w.name },
      geometry: { type: f.geometry.type, coordinates: roundCoords(f.geometry.coordinates, decimals) },
    };
  });
  return { type: 'FeatureCollection', features };
}
