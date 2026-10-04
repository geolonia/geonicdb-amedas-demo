// MQTT(WebSocket)で購読通知を受け、Observation に正規化して渡す。
// - トピックは amedas/live と amedas/cond/#、QoS 0
// - 切れたら 2 秒ごとに再接続する。clean session なので、接続のたびに購読し直す
//   (mqtt.js の自動の再購読は切る。二重の購読にしない)
// - 受信時刻は Date.now()(sentAt と同じ壁時計。配信の遅延 = 受信時刻 − sentAt)
import mqtt from 'mqtt';
import { normalizeMessage, SUBSCRIBE_TOPICS } from './lib/notification.js';

// onStatus(status): 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'refused' | 'error'
// debugLog: 配列を渡すと、受信した通知を1件ずつ記録する(?debug)
export function connectFeed({ url, wardIds, onObservations, onStatus = () => {}, debugLog = null }) {
  onStatus('connecting');
  const client = mqtt.connect(url, { reconnectPeriod: 2000, connectTimeout: 5000, clean: true, resubscribe: false });

  client.on('connect', () => {
    onStatus('connected');
    client.subscribe([...SUBSCRIBE_TOPICS], { qos: 0 }, (err, granted) => {
      if (err || granted?.some((g) => g.qos >= 128)) {
        console.error('MQTT の購読が拒否されました', err ?? granted);
        onStatus('refused');
      }
    });
  });
  client.on('reconnect', () => onStatus('reconnecting'));
  client.on('close', () => onStatus('disconnected'));
  client.on('error', (e) => {
    console.warn('MQTT のエラー', e?.message ?? e);
    onStatus('error');
  });
  client.on('message', (topic, payload) => {
    const receivedAt = Date.now();
    const list = normalizeMessage(topic, payload, receivedAt, wardIds);
    if (debugLog) {
      for (const o of list) {
        debugLog.push({
          topic,
          id: `urn:ngsi-ld:WeatherObserved:sapporo-${o.ward}`,
          sentAt: o.sentAt === null ? null : new Date(o.sentAt).toISOString(),
          dateObserved: o.dateObserved === null ? null : new Date(o.dateObserved).toISOString(),
          receivedAt,
        });
      }
    }
    if (list.length > 0) onObservations(list);
  });

  return { end: () => client.end(true) };
}
