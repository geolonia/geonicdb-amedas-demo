// 使い方: npm run setup -- [--from ISO] [--broker-url URL] [--tenant NAME] ...
// このデモが作ったエンティティと購読(通知先が mqtt(s)://…/amedas/… のもの)だけを消して、作り直す。
import { parseConfig } from './config.mjs';
import { createClient } from './client.mjs';
import { loadDemoData } from './data.mjs';
import { setupDemo } from './setup-lib.mjs';

let config;
try {
  config = parseConfig(process.argv.slice(2), process.env);
  const client = createClient({ ...config, timeoutMs: config.requestTimeoutMs });
  const { wards } = loadDemoData(config.dataDir);
  await setupDemo({ client, wards, ...config, log: (m) => console.log(m) });
} catch (e) {
  console.error(`setup に失敗しました(ブローカー: ${config?.apiBase ?? '不明'}): ${e.message}${e.cause?.message ? ` (${e.cause.message})` : ''}`);
  process.exitCode = 1;
}
