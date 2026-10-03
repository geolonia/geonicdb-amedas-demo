import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseConfig, DEFAULTS } from '../scripts/replayer/config.mjs';

test('引数がなければ既定値(Stellio の compose に合わせた値)を返す', () => {
  const c = parseConfig([], {});
  assert.equal(c.brokerUrl, 'http://localhost:8080');
  assert.equal(c.apiBase, 'http://localhost:8080/ngsi-ld/v1');
  assert.equal(c.context, 'http://context/weather.jsonld');
  assert.equal(c.mqttBase, 'mqtt://mosquitto:1883');
  assert.equal(c.mqttVersion, 'mqtt5.0');
  assert.equal(c.from, '2025-11-18T02:50:00+09:00');
  assert.equal(c.to, '2025-11-19T00:00:00+09:00');
  assert.equal(c.intervalMs, DEFAULTS.interval);
  assert.equal(c.tenant, undefined);
  assert.equal(c.changedOnly, false);
});

test('引数は環境変数より優先され、環境変数は既定値より優先される', () => {
  const env = { BROKER_URL: 'http://broker:1026/', TENANT: 'demo', MQTT_VERSION: 'mqtt3.1.1' };
  const c = parseConfig(['--interval', '1500', '--mqtt-version', 'mqtt5.0', '--changed-only'], env);
  assert.equal(c.brokerUrl, 'http://broker:1026');
  assert.equal(c.apiBase, 'http://broker:1026/ngsi-ld/v1');
  assert.equal(c.tenant, 'demo');
  assert.equal(c.mqttVersion, 'mqtt5.0');
  assert.equal(c.intervalMs, 1500);
  assert.equal(c.changedOnly, true);
});

test('不正な値は、分かりやすいエラーにする', () => {
  assert.throws(() => parseConfig(['--interval', '0'], {}), /--interval/);
  assert.throws(() => parseConfig(['--interval', 'abc'], {}), /--interval/);
  assert.throws(() => parseConfig(['--from', 'xxx'], {}), /--from/);
  // タイムゾーンのない日時は受け付けない
  assert.throws(() => parseConfig(['--from', '2025-11-18'], {}), /--from.*タイムゾーン/);
  assert.throws(() => parseConfig(['--from', '2025-11-18T10:00:00'], {}), /--from.*タイムゾーン/);
  assert.throws(() => parseConfig(['--to', '2025-11-19T00:00:00'], {}), /--to.*タイムゾーン/);
  assert.equal(parseConfig(['--from', '2025-11-18T01:00:00Z'], {}).from, '2025-11-18T01:00:00Z');
  assert.throws(() => parseConfig(['--from', '2025-11-19T00:00:00+09:00', '--to', '2025-11-18T00:00:00+09:00'], {}), /--to.*--from/);
  assert.throws(() => parseConfig(['--unknown'], {}));
});
