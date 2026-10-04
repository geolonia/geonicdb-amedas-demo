// 使い方: npm run smoke -- [--interval MS] [--from ISO] [--to ISO]
// 通知を待つ上限は、再生にかかった時間(最低 10 分)。環境変数 SMOKE_DRAIN_MAX_MS(ミリ秒)で変えられる。
// setup と replay を実行しながら MQTT を購読し、(ID, sentAt)で突き合わせる。
// 出力: 欠落の件数、配信の遅延(中央値、p95、最大)、前半と後半の遅延(滞留の兆候)、条件付き購読の件数。
import { spawn } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import mqtt from 'mqtt';
import { coverage, latencyStats, notificationKeys, refusedTopics } from './analyze.mjs';

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
client.on('message', (topic, payload) => {
  const bucket = received[topicOf(topic)];
  if (!bucket) return;
  const now = Date.now();
  let msg;
  try {
    msg = JSON.parse(payload.toString());
  } catch {
    console.warn(`JSON でない通知を無視しました: ${topic}`);
    return;
  }
  for (const { key } of notificationKeys(msg)) if (!bucket.has(key)) bucket.set(key, now);
});

// 購読が成立する(SUBACK が届く)まで待ってから、setup を始める。待たないと、最初の通知を取りこぼして欠落と誤判定しうる。
// メッセージの処理は、購読より前に登録しておく(SUBACK の直後に届く通知も受ける)。
try {
  const refused = refusedTopics(await client.subscribeAsync(['amedas/live', 'amedas/cond/#']));
  if (refused.length > 0) throw new Error(`ブローカーが購読を拒否しました: ${refused.join(', ')}`);
} catch (e) {
  console.error(`MQTT の購読に失敗しました(${mqttUrl}): ${e.message}`);
  client.end(true);
  process.exit(2);
}

const run = (script, extra = []) =>
  new Promise((resolve) => {
    const p = spawn(process.execPath, [script, ...args, ...extra], { stdio: 'inherit' });
    p.on('exit', (code) => resolve(code));
  });

if ((await run('scripts/replayer/setup.mjs')) !== 0) process.exit(2);
const replayStart = Date.now();
const replayCode = await run('scripts/replayer/replay.mjs', ['--log', logPath]);

// 通知が出そろうまで待つ(最後の通知から 15 秒、新しい通知がなくなるまで)。
// 長い再生では、滞留した通知が遅れて届くことがある。届く前に打ち切って「欠落」と誤判定しないよう、
// 上限は再生にかかった時間(最低 10 分)にする。
const drainMaxMs = Number(process.env.SMOKE_DRAIN_MAX_MS ?? Math.max(10 * 60 * 1000, Date.now() - replayStart));
let lastCount = -1;
let quietSince = Date.now();
const deadline = Date.now() + drainMaxMs;
while (Date.now() < deadline) {
  const n = received.live.size + received.ge5.size + received.ge3.size;
  if (n !== lastCount) {
    lastCount = n;
    quietSince = Date.now();
  } else if (Date.now() - quietSince > 15000) break;
  await new Promise((r) => setTimeout(r, 1000));
}
client.end();
const timedOut = Date.now() >= deadline;

const sent = readFileSync(logPath, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((r) => r.status >= 200 && r.status < 300);
const sentKeys = new Set(sent.map((r) => `${r.id}|${r.sentAt}`));
const { missing } = coverage(sentKeys, new Set(received.live.keys()));

const latencies = sent.map((r) => ({ at: Date.parse(r.sentAt), ms: received.live.get(`${r.id}|${r.sentAt}`) - Date.parse(r.sentAt) })).filter((x) => Number.isFinite(x.ms));
const q = Math.floor(latencies.length / 4);
const first = latencyStats(latencies.slice(0, q).map((x) => x.ms));
const last = latencyStats(q > 0 ? latencies.slice(-q).map((x) => x.ms) : []); // slice(-0) は全体になるため
const all = latencyStats(latencies.map((x) => x.ms));

console.log('--- 結果 ---');
console.log(`書き込み(成功): ${sent.length} 件、通知に現れなかったもの: ${missing.length} 件`);
console.log(`遅延 ms: 中央値 ${all.median}、p95 ${all.p95}、最大 ${all.max}`);
console.log(`遅延の中央値 ms: 最初の4分の1 ${first.median}、最後の4分の1 ${last.median}(後半が大きく増えていれば、通知が滞留している)`);
console.log(`条件付き購読の件数: 5cm 以上 ${received.ge5.size} 件、3cm 以上 ${received.ge3.size} 件`);
if (missing.length > 0) console.log('欠落の例:', missing.slice(0, 5));
if (timedOut) console.log(`通知を待つ上限(${drainMaxMs}ms)に達したため、打ち切りました(欠落には、遅れて届く通知が含まれる可能性があります)`);
process.exit(missing.length > 0 || replayCode !== 0 ? 1 : 0);
