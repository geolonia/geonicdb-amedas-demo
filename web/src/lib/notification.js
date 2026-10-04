// MQTT の通知を、地図アプリの Observation に正規化する(純関数。DOM も時計も使わない)。
//
// 通知の形はブローカーによって異なる:
// - ETSI の MQTT バインディング(Stellio): {"body":{…,"data":[…]},"metadata":{…}} の封筒
// - 封筒のないブローカー: {"data":[…], …}
// どちらも msg.body ?? msg で受ける。data は配列として扱う(1件とは限らない)。
// 想定外の形(JSON でない、data がない、ID が違う、値が数でない)は、例外にせず無視する
// (ローカルの MQTT は匿名で publish できるため、別のクライアントのメッセージも届きうる)。

export const TOPIC_LIVE = 'amedas/live';
export const TOPIC_GE5 = 'amedas/cond/snowfall1h_ge5';
export const TOPIC_GE3 = 'amedas/cond/snowfall1h_ge3';
export const SUBSCRIBE_TOPICS = Object.freeze([TOPIC_LIVE, 'amedas/cond/#']);

export const ATTRS = Object.freeze(['temperature', 'snowHeight', 'snowfall1h', 'windSpeed', 'windDirection', 'precipitation']);

// 表示に使う値の古さの上限(気温は欠測のステップで書かれず、古い値がエンティティに残る)
export const FRESH_MS = 60 * 60 * 1000;

export function kindOfTopic(topic) {
  if (topic === TOPIC_LIVE) return 'live';
  if (topic === TOPIC_GE5) return 'ge5';
  if (topic === TOPIC_GE3) return 'ge3';
  return null;
}

const decoder = new TextDecoder();

// mqtt.js はブラウザーでは Uint8Array(Buffer)を渡す。文字列も受ける。読めなければ null。
export function parsePayload(payload) {
  try {
    const text = typeof payload === 'string' ? payload : decoder.decode(payload);
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// DateTime の Property の値をミリ秒にする。
// 通知では {"type":"DateTime","@value":"…"}(書き込みの "@type" が "type" に置き換わる)。文字列の値も読む。
export function readDateTime(prop) {
  const v = prop?.value;
  const s = typeof v === 'string' ? v : v?.['@value'];
  if (typeof s !== 'string') return null;
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? ms : null;
}

// 観測値の属性: { value: 数, observedAt: ミリ秒 | null }。値が数でなければ null。
function readAttr(prop) {
  const v = prop?.value;
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const t = typeof prop.observedAt === 'string' ? Date.parse(prop.observedAt) : NaN;
  return { value: v, observedAt: Number.isFinite(t) ? t : null };
}

const ENTITY_ID = /^urn:ngsi-ld:WeatherObserved:sapporo-([a-z]+)$/;

export function wardOfEntityId(id) {
  const m = typeof id === 'string' ? ENTITY_ID.exec(id) : null;
  return m ? m[1] : null;
}

// topic: MQTT のトピック、payload: 受信したメッセージ、receivedAt: 受信時刻(エポックミリ秒)、
// wardIds: 知っている区の ID の Set(省略すると、ID の形だけで判定する)。
// 戻り値: Observation の配列
//   { kind: 'live'|'ge5'|'ge3', ward, receivedAt, sentAt: ミリ秒|null, dateObserved: ミリ秒|null,
//     attrs: { temperature, snowHeight, snowfall1h, windSpeed, windDirection, precipitation }(各 {value, observedAt} | null) }
export function normalizeMessage(topic, payload, receivedAt, wardIds) {
  const kind = kindOfTopic(topic);
  if (!kind) return [];
  const msg = parsePayload(payload);
  const n = msg?.body ?? msg;
  const data = Array.isArray(n?.data) ? n.data : [];
  const out = [];
  for (const e of data) {
    const ward = wardOfEntityId(e?.id);
    if (!ward || (wardIds && !wardIds.has(ward))) continue;
    const attrs = {};
    for (const k of ATTRS) attrs[k] = readAttr(e[k]);
    out.push({ kind, ward, receivedAt, sentAt: readDateTime(e.sentAt), dateObserved: readDateTime(e.dateObserved), attrs });
  }
  return out;
}

// snowfall1h は正時の書き込みにだけ書くが、エンティティに残るため、live の通知には毎回入る。
// snowfall1h の observedAt が dateObserved と一致するとき(正時の行)だけ、新しい値として扱う。
export function isNewSnowfall(obs) {
  const s = obs.attrs.snowfall1h;
  return s !== null && s.observedAt !== null && obs.dateObserved !== null && s.observedAt === obs.dateObserved;
}

// 表示に使う値。observedAt が dateObserved から maxAgeMs より古ければ null(欠測として「—」にする)。
// dateObserved か observedAt がなければ、値をそのまま使う。
export function freshValue(attr, dateObserved, maxAgeMs = FRESH_MS) {
  if (!attr) return null;
  if (dateObserved === null || attr.observedAt === null) return attr.value;
  const age = dateObserved - attr.observedAt;
  return age >= 0 && age < maxAgeMs ? attr.value : null;
}
