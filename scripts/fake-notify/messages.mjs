// 地図アプリの確認用: ブローカーの代わりに、購読通知と同じ形の MQTT メッセージを作る(純関数)。
// 形は、工程2で Stellio から実際に届いた通知に合わせる(docs/superpowers/plans/2026-10-04-plan-b-inputs-from-stage2.md)。
// - DateTime は {"type":"DateTime","@value":…}(通知では "@type" が "type" になる)
// - 通知にはエンティティの全属性が入る(snowfall1h は前回の正時の値が残る)
// bare: true なら封筒なし(封筒を使わないブローカーの形)。
import { OBS_KEYS } from '../lib/observations.mjs';
import { attrProperty, entityId } from '../replayer/payload.mjs';

export const TOPIC = Object.freeze({
  live: 'amedas/live',
  ge5: 'amedas/cond/snowfall1h_ge5',
  ge3: 'amedas/cond/snowfall1h_ge3',
});

const dateTime = (iso) => ({ type: 'Property', value: { type: 'DateTime', '@value': iso } });

// エンティティの属性の状態(attrs: { key: { value, t } })に、1行の観測値を反映した新しい状態を返す
export function applyObservation(attrs, obs) {
  const next = { ...attrs };
  for (const k of OBS_KEYS) if (obs[k] !== undefined) next[k] = { value: obs[k], t: obs.t };
  return next;
}

// 通知に入るエンティティ
export function notifiedEntity({ ward, station, attrs, dateObserved, sentAt }) {
  const e = {
    id: entityId(ward.id),
    type: 'WeatherObserved',
    name: { type: 'Property', value: ward.name },
    location: { type: 'GeoProperty', value: { type: 'Point', coordinates: station.coordinates } },
  };
  for (const [k, { value, t }] of Object.entries(attrs)) e[k] = attrProperty(k, value, t);
  e.dateObserved = dateTime(dateObserved);
  e.sentAt = dateTime(sentAt);
  return e;
}

export function notificationMessage(entity, { bare = false, seq = 0, notifiedAt }) {
  const body = {
    id: `urn:ngsi-ld:Notification:fake-${seq}`,
    type: 'Notification',
    subscriptionId: 'urn:ngsi-ld:Subscription:fake',
    notifiedAt,
    data: [entity],
  };
  return bare ? body : { body, metadata: { 'Content-Type': 'application/json' } };
}

// 1回の書き込みで届く通知のトピックの順序。
// strong-first: ge5 → ge3 → live(Stellio で観測した順)、weak-first: ge3 → ge5 → live、live-first: live → ge5 → ge3
// 条件付きの通知は、その書き込みで snowfall1h を書いたとき(正時の行)だけ出す。
export function topicsForWrite(obs, order = 'strong-first') {
  const v = obs.snowfall1h;
  const cond = [];
  if (v !== undefined && v >= 5) cond.push(TOPIC.ge5);
  if (v !== undefined && v >= 3) cond.push(TOPIC.ge3);
  if (order === 'weak-first') cond.reverse();
  return order === 'live-first' ? [TOPIC.live, ...cond] : [...cond, TOPIC.live];
}
// 接続が切れている間の QoS 0 の配信を、キューに溜めずにエラーにする(既定では再接続まで publishAsync が終わらず、終了処理に進めない)
export const CLIENT_OPTIONS = Object.freeze({ queueQoSZero: false });
