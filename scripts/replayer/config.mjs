import { parseArgs } from 'node:util';

export const DEFAULTS = Object.freeze({
  brokerUrl: 'http://localhost:8080',
  context: 'http://context/weather.jsonld',
  mqttBase: 'mqtt://mosquitto:1883',
  mqttVersion: 'mqtt5.0',
  from: '2025-11-18T02:50:00+09:00',
  to: '2025-11-19T00:00:00+09:00',
  // 1 ステップ(観測 10 分)に当てる実時間のミリ秒。128 ステップで約 12 分 48 秒。
  // 2026-10-04 に Stellio 2.37.0(Apple M1 MacBook Air、Docker 8 CPU・7.75GB、1台での測定)で、
  // 128 ステップを通して、欠落 0 件、遅延の中央値 383ms、p95 813ms、最大 1,982ms(dateObserved を加えたあと。加える前は p95 541ms)。5000ms も 12 ステップでは基準を満たしたが、
  // Stellio は通知1件に約 0.4〜0.5 秒(観測した処理速度、毎秒 約 2.1〜2.4 件からの換算)かかり、区あたりの枠(interval / 10)との余裕が小さいため、余裕のある 6000ms にした。4000ms は滞留する。
  interval: 6000,
  dataDir: 'data',
  // ブローカーへの1回の HTTP 要求のタイムアウト(ミリ秒)
  requestTimeout: 10000,
});

const OPTIONS = {
  from: { type: 'string' },
  to: { type: 'string' },
  interval: { type: 'string' },
  tenant: { type: 'string' },
  'broker-url': { type: 'string' },
  context: { type: 'string' },
  'mqtt-base': { type: 'string' },
  'mqtt-version': { type: 'string' },
  'data-dir': { type: 'string' },
  log: { type: 'string' },
  'changed-only': { type: 'boolean' },
  'request-timeout': { type: 'string' },
};

export function parseConfig(argv, env = {}) {
  const { values } = parseArgs({ args: argv, options: OPTIONS, strict: true, allowPositionals: false });
  const pick = (opt, envKey, def) => values[opt] ?? env[envKey] ?? def;

  const brokerUrl = String(pick('broker-url', 'BROKER_URL', DEFAULTS.brokerUrl)).replace(/\/+$/, '');
  const from = pick('from', 'REPLAY_FROM', DEFAULTS.from);
  const to = pick('to', 'REPLAY_TO', DEFAULTS.to);
  const intervalMs = Number(pick('interval', 'REPLAY_INTERVAL_MS', DEFAULTS.interval));

  if (!Number.isFinite(intervalMs) || intervalMs <= 0) throw new Error('--interval は正の数(ミリ秒)で指定してください');
  const requestTimeoutMs = Number(pick('request-timeout', 'REPLAY_REQUEST_TIMEOUT_MS', DEFAULTS.requestTimeout));
  if (!Number.isFinite(requestTimeoutMs) || requestTimeoutMs <= 0) throw new Error('--request-timeout は正の数(ミリ秒)で指定してください');
  // タイムゾーンのない日時は、実行する機のタイムゾーンで解釈され、会場の機で再生範囲がずれる。必ず指定させる。
  const hasOffset = (s) => /(Z|[+-]\d{2}:?\d{2})$/.test(s);
  if (Number.isNaN(Date.parse(from)) || !hasOffset(from)) throw new Error(`--from を、+09:00 のようなタイムゾーンつきの日時で指定してください: ${from}`);
  if (Number.isNaN(Date.parse(to)) || !hasOffset(to)) throw new Error(`--to を、+09:00 のようなタイムゾーンつきの日時で指定してください: ${to}`);
  if (Date.parse(to) < Date.parse(from)) throw new Error('--to は --from 以降にしてください');

  // 認証のトークン(Bearer)。シェルの履歴に残らないよう、引数では受け付けず、環境変数からだけ読む。
  // ヘッダーに使えない文字があると、fetch のエラーにトークンがそのまま出るため、先に値を表示せずに止める。
  const token = env.BROKER_TOKEN?.trim() || undefined;
  if (token !== undefined && !/^[\x21-\x7E]+$/.test(token)) throw new Error('BROKER_TOKEN に、ヘッダーに使えない文字(空白、改行、ASCII 以外)が含まれています');
  // 暗号化されない HTTP では、経路上でトークンを読まれる。HTTPS か、自分の PC(loopback)への HTTP だけを許す。
  if (token !== undefined && !isHttpsOrLoopback(brokerUrl)) throw new Error('BROKER_TOKEN を使うときは、BROKER_URL を HTTPS か、自分の PC(localhost、127.0.0.1、[::1])への HTTP にしてください');

  return {
    brokerUrl,
    apiBase: `${brokerUrl}/ngsi-ld/v1`,
    tenant: values.tenant ?? env.TENANT,
    token,
    context: pick('context', 'CONTEXT', DEFAULTS.context),
    mqttBase: pick('mqtt-base', 'MQTT_URI_BASE', DEFAULTS.mqttBase),
    mqttVersion: pick('mqtt-version', 'MQTT_VERSION', DEFAULTS.mqttVersion),
    from,
    to,
    intervalMs,
    dataDir: pick('data-dir', 'DATA_DIR', DEFAULTS.dataDir),
    logPath: values.log,
    changedOnly: values['changed-only'] ?? false,
    requestTimeoutMs,
  };
}

function isHttpsOrLoopback(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  return u.protocol === 'https:' || (u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname));
}
