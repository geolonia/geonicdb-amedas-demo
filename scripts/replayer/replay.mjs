// 使い方: npm run replay -- [--from ISO] [--to ISO] [--interval MS] [--changed-only] [--log FILE] [--request-timeout MS] ...
import { createWriteStream } from 'node:fs';
import { parseConfig } from './config.mjs';
import { createClient } from './client.mjs';
import { loadDemoData } from './data.mjs';
import { buildSteps, carryForward } from './schedule.mjs';
import { createWriter } from './writer.mjs';
import { runReplay } from './run.mjs';

let log = null;
try {
  const config = parseConfig(process.argv.slice(2), process.env);
  const client = createClient({ ...config, timeoutMs: config.requestTimeoutMs });
  const { wards, byWard } = loadDemoData(config.dataDir);
  const steps = buildSteps(byWard, config.from, config.to);
  if (config.logPath) {
    log = createWriteStream(config.logPath);
    log.on('error', (e) => {
      console.error(`ログを書けません(${config.logPath}): ${e.message}`);
      process.exitCode = 1;
    });
  }

  // setup が作ったエンティティにある属性と、直前の値を、同じ規則(carryForward)で再現する。
  const state = new Map(
    wards.map(({ ward, observations }) => {
      const prior = carryForward(observations, config.from);
      return [ward.id, { known: new Set(Object.keys(prior)), last: Object.fromEntries(Object.entries(prior).map(([k, v]) => [k, v.value])) }];
    }),
  );
  const write = createWriter({ client, state, changedOnly: config.changedOnly, log, onWarn: (m) => console.warn(m) });

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
  console.log(`完了: ${stats.steps} ステップ、書き込み ${stats.writes} 件、失敗 ${stats.failed} 件`);
  if (stats.failed > 0) process.exitCode = 1;
} catch (e) {
  console.error(`replay に失敗しました: ${e.message}${e.cause?.message ? ` (${e.cause.message})` : ''}`);
  process.exitCode = 1;
} finally {
  log?.end();
}
