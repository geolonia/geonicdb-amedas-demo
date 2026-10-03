// 使い方: npm run smoke -- [--interval MS] [--from ISO] [--to ISO]
// setup と replay を実行しながら MQTT を購読し、(ID, sentAt)で突き合わせる。
// 出力: 欠落の件数、配信の遅延(中央値、p95、最大)、前半と後半の遅延(滞留の兆候)、条件付き購読の件数。
import { spawn } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import mqtt from 'mqtt';
import { coverage, latencyStats, notificationKeys } from './analyze.mjs';

const args = process.argv.slice(2);
const mqttUrl = process.env.SMOKE_MQTT_WS ?? 'ws://127.0.0.1:9001';
const logPath = join(mkdtempSync(join(tmpdir(), 'smoke-')), 'replay.jsonl');

const received = { live: new Map(), ge5: new Map(), ge3: new Map() }; // key -> 受信時刻(最初のもの)
const topicOf = (t) => (t === 'amedas/live' ? 'live' : t.endsWith('ge5') ? 'ge5' : t.endsWith('ge3') ? 'ge3' : null);

const client = mqtt.connect(mqttUrl);
await new Promise((res, rej) => {
  client.on('connect', res);
  client.on('error', rej);
});
client.subscribe(['amedas/live', 'amedas/cond/#']);
client.on('message', (topic, payload) => {
  const bucket = received[topicOf(topic)];
  if (!bucket) return;
  const now = Date.now();
  for (const { key } of notificationKeys(JSON.parse(payload.toString()))) if (!bucket.has(key)) bucket.set(key, now);
});

const run = (script, extra = []) =>
  new Promise((resolve) => {
    const p = spawn('node', [script, ...args, ...extra], { stdio: 'inherit' });
    p.on('exit', (code) => resolve(code));
  });

if ((await run('scripts/replayer/setup.mjs')) !== 0) process.exit(2);
const replayCode = await run('scripts/replayer/replay.mjs', ['--log', logPath]);

// 通知が出そろうまで待つ(最後の通知から 15 秒、新しい通知がなくなるまで。最長 10 分)
let lastCount = -1;
let quietSince = Date.now();
const deadline = Date.now() + 10 * 60 * 1000;
while (Date.now() < deadline) {
  const n = received.live.size + received.ge5.size + received.ge3.size;
  if (n !== lastCount) {
    lastCount = n;
    quietSince = Date.now();
  } else if (Date.now() - quietSince > 15000) break;
  await new Promise((r) => setTimeout(r, 1000));
}
client.end();

const sent = readFileSync(logPath, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((r) => r.status >= 200 && r.status < 300);
const sentKeys = new Set(sent.map((r) => `${r.id}|${r.sentAt}`));
const { missing } = coverage(sentKeys, new Set(received.live.keys()));

const latencies = sent.map((r) => ({ at: Date.parse(r.sentAt), ms: received.live.get(`${r.id}|${r.sentAt}`) - Date.parse(r.sentAt) })).filter((x) => Number.isFinite(x.ms));
const q = Math.floor(latencies.length / 4);
const first = latencyStats(latencies.slice(0, q).map((x) => x.ms));
const last = latencyStats(latencies.slice(-q).map((x) => x.ms));
const all = latencyStats(latencies.map((x) => x.ms));

console.log('--- 結果 ---');
console.log(`書き込み(成功): ${sent.length} 件、通知に現れなかったもの: ${missing.length} 件`);
console.log(`遅延 ms: 中央値 ${all.median}、p95 ${all.p95}、最大 ${all.max}`);
console.log(`遅延の中央値 ms: 最初の4分の1 ${first.median}、最後の4分の1 ${last.median}(後半が大きく増えていれば、通知が滞留している)`);
console.log(`条件付き購読の件数: 5cm 以上 ${received.ge5.size} 件、3cm 以上 ${received.ge3.size} 件`);
if (missing.length > 0) console.log('欠落の例:', missing.slice(0, 5));
process.exit(missing.length > 0 || replayCode !== 0 ? 1 : 0);
