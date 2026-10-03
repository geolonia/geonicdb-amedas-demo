// 使い方: npm run replay -- [--from ISO] [--to ISO] [--interval MS] [--changed-only] [--log FILE] ...
import { createWriteStream } from 'node:fs';
import { parseConfig } from './config.mjs';
import { createClient, ok } from './client.mjs';
import { loadDemoData } from './data.mjs';
import { buildSteps, carryForward } from './schedule.mjs';
import { entityId, planWrite, sentAtProperty } from './payload.mjs';
import { runReplay } from './run.mjs';

const config = parseConfig(process.argv.slice(2), process.env);
const client = createClient(config);
const { wards, byWard } = loadDemoData(config.dataDir);
const steps = buildSteps(byWard, config.from, config.to);
const log = config.logPath ? createWriteStream(config.logPath) : null;

// setup が作ったエンティティにある属性と、直前の値を、同じ規則(carryForward)で再現する。
const state = new Map(
  wards.map(({ ward, observations }) => {
    const prior = carryForward(observations, config.from);
    return [ward.id, { known: new Set(Object.keys(prior)), last: Object.fromEntries(Object.entries(prior).map(([k, v]) => [k, v.value])) }];
  }),
);

async function write(wardId, obs, t) {
  const st = state.get(wardId);
  const { patch, append } = planWrite({ known: st.known, last: st.last, obs, changedOnly: config.changedOnly });
  const id = entityId(wardId);
  const sentAt = new Date().toISOString();
  patch.sentAt = sentAtProperty(sentAt);
  const pr = await client.patchAttrs(id, patch);
  let status = pr.status;
  let success = ok(pr);
  if (success && Object.keys(append).length > 0) {
    const r = await client.appendAttrs(id, append);
    status = r.status;
    success = ok(r);
    if (success) for (const k of Object.keys(append)) st.known.add(k);
  }
  if (success) {
    for (const [k, p] of Object.entries({ ...patch, ...append })) {
      if (k !== 'sentAt') st.last[k] = p.value;
    }
  } else {
    console.warn(`${wardId} ${t}: ${status}`);
  }
  log?.write(`${JSON.stringify({ id, ward: wardId, t, sentAt, status })}\n`);
  return success;
}

console.log(`再生: ${steps.length} ステップ、${config.from} 〜 ${config.to}、${config.intervalMs}ms/ステップ`);
const stats = await runReplay({
  steps,
  intervalMs: config.intervalMs,
  write,
  onWarn: (m) => console.warn(m),
  onStep: ({ index, total, t, lag }) => {
    if ((index + 1) % 10 === 0 || index + 1 === total) console.log(`ステップ ${index + 1}/${total} ${t} 遅れ ${lag}ms`);
  },
});
log?.end();
console.log(`完了: ${stats.steps} ステップ、書き込み ${stats.writes} 件、失敗 ${stats.failed} 件`);
if (stats.failed > 0) process.exitCode = 1;
