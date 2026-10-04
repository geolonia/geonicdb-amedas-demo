// 地図アプリの確認用: ブローカーなしで、購読通知と同じ形のメッセージを Mosquitto に流す。
// 使い方: npm run fake-notify -- [--from ISO] [--to ISO] [--interval MS] [--bare] [--order strong-first|weak-first|live-first]
//                                [--gap MS] [--setup-notice] [--mqtt mqtt://127.0.0.1:1883]
// --bare:          封筒なしの形(封筒を使わないブローカー)。省略すると {body, metadata} の封筒(Stellio)
// --order:         1回の書き込みの通知の順序(既定 strong-first = ge5 → ge3 → live)
// --gap:           同じ書き込みの通知の間隔(ミリ秒。既定 430。Stellio の実測。0 なら間を空けない)
// --setup-notice:  再生の前に、setup のときと同じ「余分な live の通知」(清田区、開始より前の観測時刻)を1件出す
// ブローカーへの書き込みは行わない。地図アプリの見た目と、通知の形の違いの確認だけに使う(配信の遅延の測定には使わない)。
import { parseArgs } from 'node:util';
import mqtt from 'mqtt';
import { loadDemoData } from '../replayer/data.mjs';
import { buildSteps, carryForward } from '../replayer/schedule.mjs';
import { DEFAULTS } from '../replayer/config.mjs';
import { applyObservation, notifiedEntity, notificationMessage, topicsForWrite, TOPIC } from './messages.mjs';

const { values } = parseArgs({
  options: {
    from: { type: 'string', default: DEFAULTS.from },
    to: { type: 'string', default: DEFAULTS.to },
    interval: { type: 'string', default: '1000' },
    bare: { type: 'boolean', default: false },
    order: { type: 'string', default: 'strong-first' },
    gap: { type: 'string', default: '430' },
    'setup-notice': { type: 'boolean', default: false },
    mqtt: { type: 'string', default: 'mqtt://127.0.0.1:1883' },
  },
});
const intervalMs = Number(values.interval);
const gapMs = Number(values.gap);
if (!(intervalMs > 0) || !(gapMs >= 0)) throw new Error('--interval は正の数、--gap は 0 以上の数(ミリ秒)で指定してください');
if (!['strong-first', 'weak-first', 'live-first'].includes(values.order)) throw new Error(`--order が不正です: ${values.order}`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const { wards, byWard } = loadDemoData('data');
const steps = buildSteps(byWard, values.from, values.to);
const state = new Map(wards.map((w) => [w.ward.id, Object.fromEntries(Object.entries(carryForward(w.observations, values.from)))]));
const meta = new Map(wards.map((w) => [w.ward.id, w]));

const client = await mqtt.connectAsync(values.mqtt);
let seq = 0;
const publish = async (topic, wardId, dateObserved) => {
  const { ward, station } = meta.get(wardId);
  const now = new Date().toISOString();
  const e = notifiedEntity({ ward, station, attrs: state.get(wardId), dateObserved, sentAt: now });
  await client.publishAsync(topic, JSON.stringify(notificationMessage(e, { bare: values.bare, seq: ++seq, notifiedAt: now })), { qos: 0 });
};

if (values['setup-notice']) {
  const attrs = state.get('kiyota');
  const latest = Object.values(attrs).map((a) => a.t).sort().at(-1);
  await publish(TOPIC.live, 'kiyota', latest);
  console.log(`setup の余分な通知(清田区、${latest})を出しました。3秒後に再生を始めます`);
  await sleep(3000);
}

const t0 = Date.now();
const counts = { live: 0, ge5: 0, ge3: 0 };
for (let i = 0; i < steps.length; i++) {
  const { t, writes } = steps[i];
  for (const [k, { ward, obs }] of writes.entries()) {
    const due = t0 + i * intervalMs + (k * intervalMs) / writes.length;
    await sleep(Math.max(0, due - Date.now()));
    state.set(ward, applyObservation(state.get(ward), obs));
    const topics = topicsForWrite(obs, values.order);
    for (const [j, topic] of topics.entries()) {
      if (j > 0 && gapMs > 0) await sleep(gapMs);
      await publish(topic, ward, t);
      counts[topic === TOPIC.live ? 'live' : topic === TOPIC.ge5 ? 'ge5' : 'ge3']++;
    }
  }
}
console.log(`完了: ${steps.length} ステップ、live ${counts.live} 件、ge5 ${counts.ge5} 件、ge3 ${counts.ge3} 件`);
await client.endAsync();
