import { parseArgs } from 'node:util';

export const DEFAULTS = Object.freeze({
  brokerUrl: 'http://localhost:8080',
  context: 'http://context/weather.jsonld',
  mqttBase: 'mqtt://mosquitto:1883',
  mqttVersion: 'mqtt5.0',
  from: '2025-11-18T02:50:00+09:00',
  to: '2025-11-19T00:00:00+09:00',
  // 1 ステップ(観測 10 分)に当てる実時間のミリ秒。**暫定値**。
  // Stellio 2.37.0 では、この速度だと通知が滞留する。2026-10-04 に Apple M1 / Docker 8 CPU・7.75GB で測ったところ、
  // 30000ms でも遅延の p95 が 16〜24 秒で、基準(p95 2 秒以下)を満たす間隔は見つかっていない(README の「再生の速度」)。
  interval: 4000,
  dataDir: 'data',
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
};

export function parseConfig(argv, env = {}) {
  const { values } = parseArgs({ args: argv, options: OPTIONS, strict: true, allowPositionals: false });
  const pick = (opt, envKey, def) => values[opt] ?? env[envKey] ?? def;

  const brokerUrl = String(pick('broker-url', 'BROKER_URL', DEFAULTS.brokerUrl)).replace(/\/+$/, '');
  const from = pick('from', 'REPLAY_FROM', DEFAULTS.from);
  const to = pick('to', 'REPLAY_TO', DEFAULTS.to);
  const intervalMs = Number(pick('interval', 'REPLAY_INTERVAL_MS', DEFAULTS.interval));

  if (!Number.isFinite(intervalMs) || intervalMs <= 0) throw new Error('--interval は正の数(ミリ秒)で指定してください');
  // タイムゾーンのない日時は、実行する機のタイムゾーンで解釈され、会場の機で再生範囲がずれる。必ず指定させる。
  const hasOffset = (s) => /(Z|[+-]\d{2}:?\d{2})$/.test(s);
  if (Number.isNaN(Date.parse(from)) || !hasOffset(from)) throw new Error(`--from を、+09:00 のようなタイムゾーンつきの日時で指定してください: ${from}`);
  if (Number.isNaN(Date.parse(to)) || !hasOffset(to)) throw new Error(`--to を、+09:00 のようなタイムゾーンつきの日時で指定してください: ${to}`);
  if (Date.parse(to) < Date.parse(from)) throw new Error('--to は --from 以降にしてください');

  return {
    brokerUrl,
    apiBase: `${brokerUrl}/ngsi-ld/v1`,
    tenant: values.tenant ?? env.TENANT,
    context: pick('context', 'CONTEXT', DEFAULTS.context),
    mqttBase: pick('mqtt-base', 'MQTT_URI_BASE', DEFAULTS.mqttBase),
    mqttVersion: pick('mqtt-version', 'MQTT_VERSION', DEFAULTS.mqttVersion),
    from,
    to,
    intervalMs,
    dataDir: pick('data-dir', 'DATA_DIR', DEFAULTS.dataDir),
    logPath: values.log,
    changedOnly: values['changed-only'] ?? false,
  };
}
