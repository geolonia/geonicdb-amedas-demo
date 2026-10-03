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

export function buildEntity({ ward, station, context, attrs, sentAt }) {
  const entity = {
    '@context': context,
    id: entityId(ward.id),
    type: 'WeatherObserved',
    name: { type: 'Property', value: ward.name },
    location: { type: 'GeoProperty', value: { type: 'Point', coordinates: station.coordinates } },
  };
  for (const [key, { value, t }] of Object.entries(attrs)) entity[key] = attrProperty(key, value, t);
  entity.sentAt = sentAtProperty(sentAt);
  return entity;
}

function subscription(context, mqttBase, mqttVersion, topic, extra = {}) {
  return {
    '@context': context,
    type: 'Subscription',
    entities: [{ type: 'WeatherObserved' }],
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
  const mk = (topic, extra) => subscription(context, mqttBase, mqttVersion, topic, extra);
  const cond = (threshold) => ({ watchedAttributes: ['snowfall1h'], q: `snowfall1h>=${threshold}` });
  return [
    mk('amedas/live'),
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
