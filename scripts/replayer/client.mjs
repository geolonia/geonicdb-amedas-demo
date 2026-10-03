// 207(一部の属性だけ失敗)は、成功としない。
export const ok = (r) => r.status >= 200 && r.status < 300 && r.status !== 207;

export function createClient({ apiBase, tenant, context, fetchImpl = fetch, timeoutMs = 10000 }) {
  const link = `<${context}>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"`;

  // ld: true のとき、ボディが JSON-LD(@context を含む)。それ以外は application/json で、@context は Link ヘッダーで渡す。
  async function request(method, path, body, { ld = false } = {}) {
    const headers = {};
    if (tenant) headers['NGSILD-Tenant'] = tenant;
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
    async listSubscriptions() {
      const r = await request('GET', '/subscriptions?limit=100');
      let json = [];
      try {
        json = JSON.parse(r.text || '[]');
      } catch {
        json = [];
      }
      return { ...r, json };
    },
  };
}
