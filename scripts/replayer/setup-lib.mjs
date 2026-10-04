import { ok } from './client.mjs';
import { carryForward } from './schedule.mjs';
import { buildEntity, buildSubscriptions, entityId } from './payload.mjs';

// このデモの購読: 通知先が MQTT(mqtt: か mqtts:)で、トピック(パス)が /amedas/ で始まるもの。
// 同じブローカーにある、ほかの購読(HTTP の通知先の URL に /amedas/ を含むものなど)は消さない。
export function isDemoSubscription(s) {
  try {
    const u = new URL(String(s?.notification?.endpoint?.uri ?? ''));
    return (u.protocol === 'mqtt:' || u.protocol === 'mqtts:') && u.pathname.startsWith('/amedas/');
  } catch {
    return false;
  }
}

// 削除は 2xx か 404(すでにない)なら成功。それ以外(403、500 など)は、何を消せなかったかを示して止める。
function deletedOrThrow(r, what) {
  if (ok(r) || r.status === 404) return;
  throw new Error(`${what}を削除できません: ${r.status} ${String(r.text ?? '').slice(0, 200)}`);
}

// このデモが作った購読とエンティティを消して、作り直す。
// 削除をすべて終えてから作る(削除に失敗したときに、古いものと新しいものが混ざらないようにする)。
export async function setupDemo({ client, wards, context, from, mqttBase, mqttVersion, log = console.log, now = Date.now }) {
  for (const s of (await client.listAllSubscriptions()).filter(isDemoSubscription)) {
    const r = await client.deleteSubscription(s.id);
    deletedOrThrow(r, `購読 ${s.id}(${s.notification.endpoint.uri})`);
    log(`購読を削除: ${s.id} (${r.status})`);
  }
  for (const { ward } of wards) {
    const id = entityId(ward.id);
    deletedOrThrow(await client.deleteEntity(id), `エンティティ ${id}`);
  }

  for (const { ward, station, observations } of wards) {
    const entity = buildEntity({ ward, station, context, attrs: carryForward(observations, from), sentAt: new Date(now()).toISOString() });
    const r = await client.createEntity(entity);
    if (!ok(r)) throw new Error(`${ward.id} のエンティティを作れません: ${r.status} ${r.text.slice(0, 300)}`);
  }
  log(`エンティティを作成: ${wards.length} 件`);
  for (const sub of buildSubscriptions({ context, mqttBase, mqttVersion })) {
    const r = await client.createSubscription(sub);
    if (!ok(r)) throw new Error(`購読を作れません(${sub.notification.endpoint.uri}): ${r.status} ${r.text.slice(0, 300)}`);
    log(`購読を作成: ${sub.notification.endpoint.uri}${sub.q ? `  (q=${sub.q})` : ''}`);
  }
}
