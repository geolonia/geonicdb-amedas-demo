// 地図アプリの単体テストで使う、通知とエンティティの組み立て。
// 形は docs/superpowers/plans/2026-10-04-plan-b-inputs-from-stage2.md の実測(Stellio 2.37.0)に合わせる。

const dt = (iso) => ({ type: 'Property', value: { type: 'DateTime', '@value': iso } });
const prop = (value, unitCode, observedAt) => ({ type: 'Property', value, unitCode, observedAt });

// attrs: { snowHeight: [値, observedAt], temperature: [...], snowfall1h: [...], windSpeed: [...] }
export function entity({ ward = 'kita', dateObserved, sentAt, attrs = {} }) {
  const unit = { temperature: 'CEL', snowHeight: 'CMT', snowfall1h: 'CMT', windSpeed: 'MTS', windDirection: 'DEG', precipitation: 'MMT' };
  const e = {
    id: `urn:ngsi-ld:WeatherObserved:sapporo-${ward}`,
    type: 'WeatherObserved',
    name: { type: 'Property', value: '北区' },
    location: { type: 'GeoProperty', value: { type: 'Point', coordinates: [141.3517, 43.13982] } },
  };
  for (const [k, [v, t]] of Object.entries(attrs)) e[k] = prop(v, unit[k], t);
  if (dateObserved) e.dateObserved = dt(dateObserved);
  if (sentAt) e.sentAt = dt(sentAt);
  return e;
}

// Stellio(ETSI の MQTT バインディング)の封筒
export function stellioMessage(...entities) {
  return JSON.stringify({
    body: {
      id: 'urn:ngsi-ld:Notification:e49ca7fd',
      type: 'Notification',
      subscriptionId: 'urn:ngsi-ld:Subscription:7f26949d',
      notifiedAt: '2026-10-04T01:00:35.384372Z',
      data: entities,
    },
    metadata: {
      Link: '<http://localhost:8080/ngsi-ld/v1/subscriptions/urn:ngsi-ld:Subscription:7f26949d/context>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"',
      'Content-Type': 'application/json',
    },
  });
}

// 封筒のないブローカー(1通知に1エンティティ)
export function bareMessage(entity1) {
  return JSON.stringify({ id: 'urn:ngsi-ld:Notification:1', type: 'Notification', subscriptionId: 'urn:ngsi-ld:Subscription:1', notifiedAt: '2026-10-04T01:00:35Z', data: [entity1] });
}

// 正規化したあとの Observation を直接作る(dedupe、store、stats のテスト用)
const ms = (iso) => (iso ? Date.parse(iso) : null);
export function observation({ kind = 'live', ward = 'kita', receivedAt = 0, sentAt = null, dateObserved = null, attrs = {} }) {
  const all = { temperature: null, snowHeight: null, snowfall1h: null, windSpeed: null, windDirection: null, precipitation: null };
  for (const [k, [v, t]] of Object.entries(attrs)) all[k] = { value: v, observedAt: ms(t) };
  return { kind, ward, receivedAt, sentAt: ms(sentAt), dateObserved: ms(dateObserved), attrs: all };
}
