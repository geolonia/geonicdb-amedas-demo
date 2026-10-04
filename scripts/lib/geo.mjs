// 光線法。境界上の点の扱いは問わない(観測点は区の内側にある前提のため)。
function inRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inPolygon(point, rings) {
  const [outer, ...holes] = rings;
  return inRing(point, outer) && !holes.some((h) => inRing(point, h));
}

export function pointInGeometry(point, geometry) {
  if (geometry.type === 'Polygon') return inPolygon(point, geometry.coordinates);
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.some((p) => inPolygon(point, p));
  throw new Error(`未対応のジオメトリです: ${geometry.type}`);
}
