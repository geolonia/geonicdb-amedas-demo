// 207(一部の属性だけ失敗)は、成功としない。
export const ok = (r) => r.status >= 200 && r.status < 300 && r.status !== 207;

const PAGE = 100;
const MAX_PAGES = 100;

export function createClient({ apiBase, tenant, token, context, fetchImpl = fetch, timeoutMs = 10000 }) {
  const link = `<${context}>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"`;

  // ld: true のとき、ボディが JSON-LD(@context を含む)。それ以外は application/json で、@context は Link ヘッダーで渡す。
  async function request(method, path, body, { ld = false } = {}) {
    const headers = {};
    if (tenant) headers['NGSILD-Tenant'] = tenant;
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = ld ? 'application/ld+json' : 'application/json';
    if (!ld) headers.Link = link;
    const res = await fetchImpl(`${apiBase}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { status: res.status, text: await res.text() };
  }

  const enc = encodeURIComponent;
  return {
    createEntity: (e) => request('POST', '/entities', e, { ld: true }),
    deleteEntity: (id) => request('DELETE', `/entities/${enc(id)}`),
    createSubscription: (s) => request('POST', '/subscriptions', s, { ld: true }),
    deleteSubscription: (id) => request('DELETE', `/subscriptions/${enc(id)}`),
    patchAttrs: (id, attrs) => request('PATCH', `/entities/${enc(id)}/attrs`, attrs),
    appendAttrs: (id, attrs) => request('POST', `/entities/${enc(id)}/attrs`, attrs),
    // 購読の一覧の1ページ(offset から最大 limit 件)
    async listSubscriptions({ offset = 0, limit = PAGE } = {}) {
      const r = await request('GET', `/subscriptions?limit=${limit}&offset=${offset}`);
      let json; // 読めなかったときは null(空配列と区別する)
      try {
        json = JSON.parse(r.text || '[]');
      } catch {
        json = null;
      }
      return { ...r, json };
    },
    // すべての購読。ページが PAGE 件より少なくなるまで、offset を進めて読む。
    async listAllSubscriptions() {
      const all = [];
      for (let page = 0; page < MAX_PAGES; page++) {
        const items = subscriptionsOrThrow(await this.listSubscriptions({ offset: page * PAGE }));
        all.push(...items);
        if (items.length < PAGE) return all;
      }
      throw new Error(`購読の一覧が ${MAX_PAGES} ページ(${MAX_PAGES * PAGE} 件)を超えたため、読むのをやめました`);
    },
  };
}

// 購読の一覧を安全に取り出す。2xx で、本文が配列でなければ、黙って進まず失敗させる。
export function subscriptionsOrThrow(list) {
  if (list.status < 200 || list.status >= 300) throw new Error(`購読の一覧を取得できません: ${list.status} ${list.text.slice(0, 200)}`);
  if (!Array.isArray(list.json)) throw new Error(`購読の一覧を読み取れません(JSON の配列ではありません): ${list.text.slice(0, 200)}`);
  return list.json;
}
