// 使い方: npm run setup -- [--from ISO] [--broker-url URL] [--tenant NAME] ...
// このデモが作ったエンティティと購読(トピックが amedas/ で始まるもの)だけを消して、作り直す。
import { parseConfig } from './config.mjs';
import { createClient, ok, subscriptionsOrThrow } from './client.mjs';
import { loadDemoData } from './data.mjs';
import { carryForward } from './schedule.mjs';
import { buildEntity, buildSubscriptions, entityId } from './payload.mjs';

const isDemoSubscription = (s) => String(s?.notification?.endpoint?.uri ?? '').includes('/amedas/');

let config;
try {
  config = parseConfig(process.argv.slice(2), process.env);
  const client = createClient(config);
  const { wards } = loadDemoData(config.dataDir);

  const list = await client.listSubscriptions();
  for (const s of subscriptionsOrThrow(list).filter(isDemoSubscription)) {
    const r = await client.deleteSubscription(s.id);
    console.log(`購読を削除: ${s.id} (${r.status})`);
  }

  for (const { ward, station, observations } of wards) {
    await client.deleteEntity(entityId(ward.id));
    const entity = buildEntity({
      ward,
      station,
      context: config.context,
      attrs: carryForward(observations, config.from),
      sentAt: new Date().toISOString(),
    });
    const r = await client.createEntity(entity);
    if (!ok(r)) throw new Error(`${ward.id} のエンティティを作れません: ${r.status} ${r.text.slice(0, 300)}`);
  }
  console.log(`エンティティを作成: ${wards.length} 件`);

  for (const sub of buildSubscriptions(config)) {
    const r = await client.createSubscription(sub);
    if (!ok(r)) throw new Error(`購読を作れません(${sub.notification.endpoint.uri}): ${r.status} ${r.text.slice(0, 300)}`);
    console.log(`購読を作成: ${sub.notification.endpoint.uri}${sub.q ? `  (q=${sub.q})` : ''}`);
  }
} catch (e) {
  console.error(`setup に失敗しました(ブローカー: ${config?.apiBase ?? '不明'}): ${e.message}${e.cause?.message ? ` (${e.cause.message})` : ''}`);
  process.exitCode = 1;
}
