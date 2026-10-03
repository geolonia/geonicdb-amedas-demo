export function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1];
}

export function latencyStats(values) {
  const v = [...values].sort((a, b) => a - b);
  if (v.length === 0) return { count: 0, median: null, p95: null, max: null };
  return { count: v.length, median: percentile(v, 50), p95: percentile(v, 95), max: v.at(-1) };
}

export function coverage(sentKeys, receivedKeys) {
  return { missing: [...sentKeys].filter((k) => !receivedKeys.has(k)) };
}

// 通知のメッセージから、(エンティティ ID, sentAt)の組を取り出す。
// ブローカーによって、通知が {"body":{…},"metadata":{…}} の封筒に入っている場合と、そうでない場合がある。
export function notificationKeys(message) {
  const n = message.body ?? message;
  const out = [];
  for (const e of n.data ?? []) {
    const raw = e.sentAt?.value;
    const sentAt = typeof raw === 'string' ? raw : raw?.['@value'];
    if (sentAt) out.push({ key: `${e.id}|${sentAt}`, sentAt });
  }
  return out;
}
