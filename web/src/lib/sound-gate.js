// 音を鳴らしてよいかの判定(純関数)。大量の通知や、隠れたタブからの復帰で、音が一斉に鳴らないようにする。
export const MAX_AGE_MS = 2000; // 受信からこれより古い通知は鳴らさない(タブが止まっていた間に溜まった分)

export function isFresh(receivedAt, now, maxAgeMs = MAX_AGE_MS) {
  return Number.isFinite(receivedAt) && now - receivedAt <= maxAgeMs;
}

// 間引き(minGapMs に1回まで)と、同時に鳴る数の上限(maxVoices)。ge5 は間引きの対象にしない(同時数の上限だけ、1つ余分に持つ)。
// admit が true のときだけ鳴らし、そのとき鳴らし終わる時刻(now + durationMs)を覚える。
export function createChimeLimiter({ minGapMs = 250, maxVoices = 3, durationMs = 900 } = {}) {
  let ends = []; // 鳴っているチャイムの終わる時刻
  let last = -Infinity;
  return {
    admit(tier, now) {
      ends = ends.filter((t) => t > now);
      const strong = tier === 'ge5';
      if (ends.length >= (strong ? maxVoices + 1 : maxVoices)) return false;
      if (!strong && now - last < minGapMs) return false;
      ends.push(now + durationMs);
      last = now;
      return true;
    },
  };
}

// 鳴らす判定を済ませたキー(区と観測時刻)の記憶。判定のあとに同じ書き込みの ge5 が届いても(upgrade)、鳴らし直さない。
// ttlMs(dedupe の repeatAfterMs と同じ 60 秒)を過ぎたキーは、setup をやり直した再生とみなして、再び鳴らせる。
// 件数の上限(maxKeys)を超えたら古いものから捨て、期限切れも add のときに捨てる(増え続けない)。
export function createSoundedKeys({ maxKeys = 200, ttlMs = 60_000 } = {}) {
  const at = new Map(); // key -> 判定した時刻(挿入順 = 時刻順)
  return {
    has(key, now) {
      const t = at.get(key);
      return t !== undefined && now - t <= ttlMs;
    },
    add(key, now) {
      at.delete(key);
      at.set(key, now);
      for (const [k, t] of at) {
        if (now - t <= ttlMs && at.size <= maxKeys) break;
        at.delete(k);
      }
    },
    size: () => at.size,
  };
}
