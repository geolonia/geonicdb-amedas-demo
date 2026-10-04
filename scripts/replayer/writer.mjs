import { ok } from './client.mjs';
import { dateObservedProperty, entityId, planWrite, sentAtProperty } from './payload.mjs';
import { carryForward } from './schedule.mjs';

// setup が作ったエンティティにある属性と、直前の値を、setup と同じ規則(carryForward)で再現する。
// setup は、引き継ぐ観測値があるときだけ dateObserved を付ける。
export function initialState(wards, fromIso) {
  return new Map(
    wards.map(({ ward, observations }) => {
      const prior = carryForward(observations, fromIso);
      const known = new Set(Object.keys(prior));
      if (known.size > 0) known.add('dateObserved');
      return [ward.id, { known, last: Object.fromEntries(Object.entries(prior).map(([k, v]) => [k, v.value])) }];
    }),
  );
}

// 1区の1ステップ分の書き込みを行う関数を作る。依存(client、時計、ログ)は、テストで差し替えるために注入する。
// state: Map<wardId, { known: Set<string>, last: object }>(エンティティにある属性と、前回に書いた値)
//
// 全件の購読(amedas/live)は sentAt だけを監視する。sentAt を付けた PATCH を最後に送り、
// まだない属性の追加(append)を先に済ませる。こうしないと、そのステップで初めて現れる属性が、live の通知に入らない。
// 更新が append だけのときも、sentAt だけの PATCH を必ず送る(live の通知のきっかけ)。
// 最後の PATCH には、毎回 dateObserved(そのステップの観測時刻)も付ける。エンティティにまだなければ、append でも追加する。
export function createWriter({ client, state, changedOnly, log = null, now = Date.now, onWarn }) {
  return async function write(wardId, obs, t) {
    const st = state.get(wardId);
    const { patch, append } = planWrite({ known: st.known, last: st.last, obs, changedOnly });
    const observed = dateObservedProperty(obs.t);
    const appendAll = st.known.has('dateObserved') ? append : { ...append, dateObserved: observed };
    const id = entityId(wardId);
    let sentAt;
    const record = (status) => log?.write(`${JSON.stringify({ id, ward: wardId, t, sentAt, status })}\n`);
    const fail = (status) => {
      onWarn?.(`${wardId} ${t}: ${status}`);
      record(status);
      return false;
    };
    try {
      if (Object.keys(appendAll).length > 0) {
        const r = await client.appendAttrs(id, appendAll);
        if (!ok(r)) return fail(r.status);
        // append はブローカーに反映済み。このあとの PATCH が失敗しても、次の書き込みで append し直さないよう、すぐに記録する
        // (すでにある属性の append を拒むブローカーがある)。dateObserved は last に入れない。
        for (const k of Object.keys(appendAll)) st.known.add(k);
        for (const [k, p] of Object.entries(append)) st.last[k] = p.value;
      }
      sentAt = new Date(now()).toISOString();
      const r = await client.patchAttrs(id, { ...patch, dateObserved: observed, sentAt: sentAtProperty(sentAt) });
      if (!ok(r)) return fail(r.status);
      for (const [k, p] of Object.entries(patch)) st.last[k] = p.value;
      record(r.status);
      return true;
    } catch (e) {
      record('error');
      throw e;
    }
  };
}
