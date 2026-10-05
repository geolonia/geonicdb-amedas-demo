// 条件ヒットの重複排除(純関数。タイマーを使わない。時刻は通知の receivedAt を使う)。
//
// ge3 と ge5 は別の購読なので、同じ書き込みの通知が別々に、順不同で届く
// (Stellio では ge5 → ge3 → live の順に約 430ms ずつ空いて届く。封筒のないブローカーでは、ほぼ同時で順序は決まらない)。
// 時間の窓ではなく、書き込みの識別子(区と、snowfall1h の観測時刻)で集約する。
// - 最初に届いた通知で演出を出す('show')
// - 強い購読(ge5)があとから届いたら、弱い方の演出を置き換える('upgrade')
// - 弱い購読や同じ購読があとから届いたら、無視する('ignore')
// - live の通知は、条件の演出を出さない('ignore')。live は面の更新だけに使う
// - 同じ識別子でも、最初の通知から repeatAfterMs より後に届いたら、setup をやり直した再生とみなして、もう一度出す('show')。
//   同じ書き込みの通知は、2秒以内にそろう(Stellio で約 0.9 秒)。
// 演出は届いた順に出す(観測時刻に合わせて遅らせない)。

const RANK = Object.freeze({ ge3: 1, ge5: 2 });

export function createHitDeduper({ maxKeys = 500, repeatAfterMs = 60_000 } = {}) {
  const seen = new Map(); // key -> { tier: 表示中の強さ, at: 最初に受けた時刻 }。古いキーから捨てる(件数で上限)
  return {
    offer(obs) {
      if (!(obs.kind in RANK)) return { action: 'ignore', reason: 'not-conditional' };
      const s = obs.attrs.snowfall1h;
      if (!s || s.observedAt === null) return { action: 'ignore', reason: 'no-snowfall' };
      // 正時の書き込みでない(snowfall1h が古い)通知は、その時間のヒットではない
      if (obs.dateObserved !== null && s.observedAt !== obs.dateObserved) return { action: 'ignore', reason: 'stale' };
      const key = `${obs.ward}|${s.observedAt}`;
      const prev = seen.get(key);
      if (prev === undefined || obs.receivedAt - prev.at > repeatAfterMs) {
        seen.delete(key);
        seen.set(key, { tier: obs.kind, at: obs.receivedAt });
        while (seen.size > maxKeys) seen.delete(seen.keys().next().value);
        return { action: 'show', key, tier: obs.kind, ward: obs.ward, value: s.value };
      }
      if (RANK[obs.kind] > RANK[prev.tier]) {
        prev.tier = obs.kind;
        return { action: 'upgrade', key, tier: obs.kind, ward: obs.ward, value: s.value };
      }
      return { action: 'ignore', key, reason: 'weaker-or-same' };
    },
    size: () => seen.size,
  };
}

// ヒット欄の行の並び(新しいものが先頭、最大 max 件)。keys: いまの並び(キーの配列)。
// show: 同じキーの古い行があれば消して、先頭に出す(setup をやり直した再生)。upgrade: 並びは変えない(行を書き換える)。
// ただし、弱い方の行が上限から押し出されたあとに upgrade が届いたときは、show と同じに扱う(行を作り直して先頭に出す)。
// 戻り値: { keys: 新しい並び, removed: 消すキーの配列 }
export function nextHitOrder(keys, decision, max = 8) {
  const asShow = decision.action === 'show' || (decision.action === 'upgrade' && !keys.includes(decision.key));
  if (!asShow) return { keys, removed: [] };
  const rest = keys.filter((k) => k !== decision.key);
  const next = [decision.key, ...rest];
  const removed = [...(rest.length < keys.length ? [decision.key] : []), ...next.slice(max)];
  return { keys: next.slice(0, max), removed };
}
