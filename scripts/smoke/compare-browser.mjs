// 地図アプリが受けた通知と、replay が送った書き込みを突き合わせる(設計書 5.6)。
// 使い方: node scripts/smoke/compare-browser.mjs <replay の --log のファイル> <ブラウザーの受信ログ(JSON)>
// ブラウザーの受信ログは、?debug で開いた地図アプリの window.__sapporo.received を JSON で保存したもの。
// 欠落か重複(amedas/live)が1件でもあれば、終了コードは 1。
import { readFileSync } from 'node:fs';
import { coverage, countDuplicates } from './analyze.mjs';

const [logPath, receivedPath] = process.argv.slice(2);
if (!logPath || !receivedPath) {
  console.error('使い方: node scripts/smoke/compare-browser.mjs <replay の --log のファイル> <ブラウザーの受信ログ(JSON)>');
  process.exit(2);
}

const sent = new Set(
  readFileSync(logPath, 'utf8')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l))
    .filter((r) => typeof r.status === 'number' && r.status >= 200 && r.status < 300)
    .map((r) => `${r.id}|${r.sentAt}`),
);
const received = JSON.parse(readFileSync(receivedPath, 'utf8'));
const counts = new Map();
for (const r of received) {
  if (r.topic !== 'amedas/live' || !r.sentAt) continue;
  const key = `${r.id}|${r.sentAt}`;
  counts.set(key, (counts.get(key) ?? 0) + 1);
}
const { missing } = coverage(sent, new Set(counts.keys()));
const duplicates = countDuplicates(counts, sent);
const cond = (suffix) => received.filter((r) => r.topic.endsWith(suffix)).length;
console.log(`送信 ${sent.size} 件、受信(amedas/live、送った書き込みの分)${[...counts.keys()].filter((k) => sent.has(k)).length} 件、欠落 ${missing.length} 件、重複 ${duplicates.count} 件`);
console.log(`条件付き購読の通知: 5cm 以上 ${cond('ge5')} 件、3cm 以上 ${cond('ge3')} 件`);
if (missing.length > 0) console.log(`欠落の例: ${missing.slice(0, 5).join(', ')}`);
if (duplicates.count > 0) console.log(`重複の例: ${duplicates.examples.join(', ')}`);
process.exit(missing.length > 0 || duplicates.count > 0 ? 1 : 0);
