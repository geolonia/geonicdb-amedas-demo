// 条件ヒット欄(主役)。新しいものを上に、最大 max 件(並びは lib/dedupe.js の nextHitOrder)。
// 強い購読(ge5)の通知があとから届いたら、同じ行を書き換える(行を増やさない)。
// setup をやり直した再生で同じヒットがまた届いたら、古い行を消して、新しい行として上に出す。
import { formatHourMinute, formatTimeOfDay } from '../lib/format.js';
import { nextHitOrder } from '../lib/dedupe.js';

const TIER_TEXT = Object.freeze({ ge5: '5cm 以上', ge3: '3cm 以上' });

export function createHitList(root, { max = 8 } = {}) {
  const rows = new Map(); // hit.key -> li
  let keys = [];
  return {
    // hit: dedupe の戻り値(action が show か upgrade)、wardName: 区名、obs: その通知の Observation
    render(hit, wardName, obs) {
      const order = nextHitOrder(keys, hit, max);
      keys = order.keys;
      for (const k of order.removed) {
        rows.get(k)?.remove();
        rows.delete(k);
      }
      let li = rows.get(hit.key);
      if (!li) {
        li = document.createElement('li');
        root.prepend(li);
        rows.set(hit.key, li);
      }
      li.className = hit.tier;
      const time = document.createElement('time');
      time.textContent = formatTimeOfDay(obs.receivedAt);
      const observedAt = obs.attrs.snowfall1h?.observedAt ?? obs.dateObserved;
      li.replaceChildren(time, `観測 ${formatHourMinute(observedAt)} ${wardName} ${hit.value}cm/h(${TIER_TEXT[hit.tier]})`);
    },
  };
}
