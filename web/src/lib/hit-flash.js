// 条件ヒットの外周の強調の、残り時間(純関数。時刻は引数)。
// 地図のロード前に届いたヒットは、ロード後に、受信からの経過を引いた残りだけ強調する。期限切れは 0(強調しない)。
export const HIT_FLASH_MS = 1800;

export function hitFlashRemaining(startedAt, now, durationMs = HIT_FLASH_MS) {
  if (!Number.isFinite(startedAt) || !Number.isFinite(now)) return durationMs;
  return Math.min(durationMs, Math.max(0, startedAt + durationMs - now));
}

// ロード前に溜めたヒットは、区ごとに tier 別の候補(tier -> 最新の startedAt)で持つ。同じ tier は新しい方を残す(元の候補は変えない)。
export function addPendingHit(candidates, tier, startedAt) {
  const prev = candidates?.[tier];
  const keep = prev !== undefined && prev > startedAt ? prev : startedAt;
  return { ...candidates, [tier]: keep };
}

// ロード時に、期限が残っている候補のうち最も強い tier を選ぶ(強い方だけが期限切れなら、有効な弱い方を出す)。なければ null。
// level: tier -> 強さ(map-layer の HIT_LEVEL)。
export function pickPendingHit(candidates, now, level) {
  let best = null;
  for (const [tier, startedAt] of Object.entries(candidates ?? {})) {
    if (hitFlashRemaining(startedAt, now) <= 0) continue;
    if (best === null || (level[tier] ?? 0) > (level[best.tier] ?? 0)) best = { tier, startedAt };
  }
  return best;
}
