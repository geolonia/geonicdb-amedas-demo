import { OBS_KEYS } from '../lib/observations.mjs';

export const UNIT = Object.freeze({
  temperature: 'CEL',
  windDirection: 'DEG',
  windSpeed: 'MTS',
  precipitation: 'MMT',
  snowHeight: 'CMT',
  snowfall1h: 'CMT',
});

export const entityId = (wardId) => `urn:ngsi-ld:WeatherObserved:sapporo-${wardId}`;

export const attrProperty = (key, value, observedAt) => ({ type: 'Property', value, unitCode: UNIT[key], observedAt });

// 配信の遅延を測るための、書き込み時刻。
export const sentAtProperty = (iso) => ({ type: 'Property', value: { '@type': 'DateTime', '@value': iso } });

// 観測時刻(FIWARE の WeatherObserved の dateObserved)。書き込みのたびに付ける。
// 属性ごとの observedAt は、値を書いた属性でしか新しくならない(--changed-only で値が変わらないステップなど)。
// dateObserved は、それとは別に、そのステップの観測時刻を明示する。
export const dateObservedProperty = (iso) => ({ type: 'Property', value: { '@type': 'DateTime', '@value': iso } });

export function buildEntity({ ward, station, context, attrs, sentAt }) {
  const entity = {
    '@context': context,
    id: entityId(ward.id),
    type: 'WeatherObserved',
    name: { type: 'Property', value: ward.name },
    location: { type: 'GeoProperty', value: { type: 'Point', coordinates: station.coordinates } },
  };
  let latest = null;
  for (const [key, { value, t }] of Object.entries(attrs)) {
    entity[key] = attrProperty(key, value, t);
    if (latest === null || Date.parse(t) > Date.parse(latest)) latest = t;
  }
  if (latest !== null) entity.dateObserved = dateObservedProperty(latest);
  entity.sentAt = sentAtProperty(sentAt);
  return entity;
}

function subscription(context, mqttBase, mqttVersion, topic, extra = {}) {
  return {
    '@context': context,
    type: 'Subscription',
    // このデモのエンティティだけ(同じブローカーにある、別のデータの WeatherObserved を混ぜない)
    entities: [{ type: 'WeatherObserved', idPattern: '^urn:ngsi-ld:WeatherObserved:sapporo-' }],
    ...extra,
    notification: {
      format: 'normalized',
      endpoint: {
        uri: `${mqttBase}/${topic}`,
        accept: 'application/json',
        notifierInfo: [
          { key: 'MQTT-Version', value: mqttVersion },
          { key: 'MQTT-QoS', value: '0' },
        ],
      },
    },
  };
}

// 条件付き購読は、条件が成立している間は書き込みのたびに通知される。
// snowfall1h を正時にだけ書き、watchedAttributes で絞ることで、「その時間に条件を満たした」通知になる。
export function buildSubscriptions({ context, mqttBase, mqttVersion }) {
  const base = String(mqttBase).replace(/\/+$/, ''); // 末尾の / を除く(mqtt://host:1883/ → mqtt://host:1883/amedas/live)
  const mk = (topic, extra) => subscription(context, base, mqttVersion, topic, extra);
  const cond = (threshold) => ({ watchedAttributes: ['snowfall1h'], q: `snowfall1h>=${threshold}` });
  return [
    // replay は書き込みごとに sentAt を更新する。sentAt だけを監視すれば、PATCH 1回につき通知は1回になる
    // (書き込んだ属性ごとに通知するブローカーで、通知の数を約6分の1にする)。通知には、エンティティの全属性が入る。
    mk('amedas/live', { watchedAttributes: ['sentAt'] }),
    mk('amedas/cond/snowfall1h_ge5', cond(5)),
    mk('amedas/cond/snowfall1h_ge3', cond(3)),
  ];
}

// known: エンティティにすでにある属性。last: 前回に書いた値。
// すでにある属性は PATCH、まだない属性は追加(append)する。
// changedOnly のとき、前回と同じ値の属性は省く。ただし snowfall1h は常に書く
// (同じ値が続いても、毎正時に条件付き購読の通知が出るようにするため)。
export function planWrite({ known, last, obs, changedOnly }) {
  const patch = {};
  const append = {};
  for (const key of OBS_KEYS) {
    if (obs[key] === undefined) continue;
    if (changedOnly && key !== 'snowfall1h' && last[key] === obs[key]) continue;
    (known.has(key) ? patch : append)[key] = attrProperty(key, obs[key], obs.t);
  }
  return { patch, append };
}
