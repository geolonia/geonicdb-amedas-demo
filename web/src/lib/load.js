// JSON の取得(純関数)。失敗は、何を読めなかったかが分かるメッセージの Error にする。
export async function loadJson(url, fetchImpl = fetch) {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`${url} を読めませんでした(HTTP ${res.status})`);
  try {
    return await res.json();
  } catch (cause) {
    throw new Error(`${url} を JSON として読めませんでした`, { cause });
  }
}
