// 使い方: npm run replay -- [--from ISO] [--to ISO] [--interval MS] [--changed-only] [--log FILE] [--request-timeout MS] ...
import { createWriteStream } from 'node:fs';
import { parseConfig } from './config.mjs';
import { createClient } from './client.mjs';
import { loadDemoData } from './data.mjs';
import { buildSteps } from './schedule.mjs';
import { createWriter, initialState } from './writer.mjs';
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

  const state = initialState(wards, config.from);
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
  const cause = e.cause?.message && !e.message.includes(e.cause.message) ? ` (${e.cause.message})` : '';
  console.error(`replay に失敗しました: ${e.message}${cause}`);
  process.exitCode = 1;
} finally {
  log?.end();
}
