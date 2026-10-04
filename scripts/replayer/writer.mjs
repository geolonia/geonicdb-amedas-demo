import { ok } from './client.mjs';
import { entityId, planWrite, sentAtProperty } from './payload.mjs';

// 1区の1ステップ分の書き込みを行う関数を作る。依存(client、時計、ログ)は、テストで差し替えるために注入する。
// state: Map<wardId, { known: Set<string>, last: object }>(エンティティにある属性と、前回に書いた値)
//
// 全件の購読(amedas/live)は sentAt だけを監視する。sentAt を付けた PATCH を最後に送り、
// まだない属性の追加(append)を先に済ませる。こうしないと、そのステップで初めて現れる属性が、live の通知に入らない。
// 更新が append だけのときも、sentAt だけの PATCH を必ず送る(live の通知のきっかけ)。
export function createWriter({ client, state, changedOnly, log = null, now = Date.now, onWarn }) {
  return async function write(wardId, obs, t) {
    const st = state.get(wardId);
    const { patch, append } = planWrite({ known: st.known, last: st.last, obs, changedOnly });
    const id = entityId(wardId);
    let sentAt;
    const record = (status) => log?.write(`${JSON.stringify({ id, ward: wardId, t, sentAt, status })}\n`);
    const fail = (status) => {
      onWarn?.(`${wardId} ${t}: ${status}`);
      record(status);
      return false;
    };
    try {
      if (Object.keys(append).length > 0) {
        const r = await client.appendAttrs(id, append);
        if (!ok(r)) return fail(r.status);
      }
      sentAt = new Date(now()).toISOString();
      const r = await client.patchAttrs(id, { ...patch, sentAt: sentAtProperty(sentAt) });
      if (!ok(r)) return fail(r.status);
      for (const k of Object.keys(append)) st.known.add(k);
      for (const [k, p] of Object.entries({ ...patch, ...append })) st.last[k] = p.value;
      record(r.status);
      return true;
    } catch (e) {
      record('error');
      throw e;
    }
  };
}
