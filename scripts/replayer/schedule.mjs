import { OBS_KEYS } from '../lib/observations.mjs';

// byWard: Map<wardId, Observation[]>(区の順に並べておく。t の昇順)
export function buildSteps(byWard, fromIso, toIso) {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  const index = new Map();
  const times = new Set();
  for (const [ward, list] of byWard) {
    const m = new Map();
    for (const o of list) {
      const ms = Date.parse(o.t);
      if (ms >= from && ms <= to) {
        m.set(o.t, o);
        times.add(o.t);
      }
    }
    index.set(ward, m);
  }
  if (times.size === 0) throw new Error(`${fromIso} 〜 ${toIso} の範囲に観測値がありません`);
  return [...times].sort().map((t) => ({
    t,
    writes: [...index].filter(([, m]) => m.has(t)).map(([ward, m]) => ({ ward, obs: m.get(t) })),
  }));
}

// beforeIso より前の、属性ごとの最後の値(エンティティの初期値と、「すでにある属性」の判定に使う)
export function carryForward(list, beforeIso) {
  const limit = Date.parse(beforeIso);
  const out = {};
  for (const o of list) {
    if (Date.parse(o.t) >= limit) break;
    for (const k of OBS_KEYS) if (o[k] !== undefined) out[k] = { value: o[k], t: o.t };
  }
  return out;
}
