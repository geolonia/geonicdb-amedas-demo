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
// 想定外の形(null、配列でない data、null のエンティティなど)は、例外にせず、読めるものだけを返す
// (ローカルの MQTT ブローカーは匿名で publish できるため、別のクライアントのメッセージも届きうる)。
export function notificationKeys(message) {
  const n = message?.body ?? message;
  const out = [];
  for (const e of Array.isArray(n?.data) ? n.data : []) {
    const raw = e?.sentAt?.value;
    const sentAt = typeof raw === 'string' ? raw : raw?.['@value'];
    if (sentAt) out.push({ key: `${e.id}|${sentAt}`, sentAt });
  }
  return out;
}

// SUBACK で拒否されたトピックを返す。MQTT 3.1.1 では QoS 128(0x80)、MQTT 5 では 0x80 以上の理由コードが拒否。
export function refusedTopics(granted) {
  return granted.filter((g) => g.qos >= 128).map((g) => g.topic);
}

// 送った書き込み(sentKeys)の通知が、2回以上届いた分(余分な通知の件数)を数える。
// 設計では、成功した PATCH 1回につき、amedas/live の通知は1回。送っていないキー(setup の書き込みなど)の重複は数えない。
// receivedCounts: Map<key, 受信回数>。examples は、重複したキーの最初の5件。
export function countDuplicates(receivedCounts, sentKeys) {
  let count = 0;
  const keys = [];
  for (const [key, n] of receivedCounts) {
    if (n > 1 && sentKeys.has(key)) {
      count += n - 1;
      keys.push(key);
    }
  }
  return { count, examples: keys.slice(0, 5) };
}
