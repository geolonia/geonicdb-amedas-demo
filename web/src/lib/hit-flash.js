// 条件ヒットの外周の強調の、残り時間(純関数。時刻は引数)。
// 地図のロード前に届いたヒットは、ロード後に、受信からの経過を引いた残りだけ強調する。期限切れは 0(強調しない)。
export const HIT_FLASH_MS = 1800;

export function hitFlashRemaining(startedAt, now, durationMs = HIT_FLASH_MS) {
  if (!Number.isFinite(startedAt) || !Number.isFinite(now)) return durationMs;
  return Math.min(durationMs, Math.max(0, startedAt + durationMs - now));
}

// ロード前に溜めたヒットを、区ごとに強い方・新しい方で1件にまとめる(同じ区の弱い通知で、強い色を上書きしない)
export function mergePendingHit(prev, next, level) {
  if (!prev) return next;
  return level[next.tier] >= level[prev.tier] ? next : prev;
}
