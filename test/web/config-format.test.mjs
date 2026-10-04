import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readConfig, DEFAULT_MQTT_URL } from '../../web/src/lib/config.js';
import {
  formatJst, formatTimeOfDay, formatHourMinute, formatTemperature, formatSnowDepth, formatMs, temperatureClass, MISSING,
} from '../../web/src/lib/format.js';

test('readConfig: 既定値', () => {
  assert.deepEqual(readConfig(''), { mqttUrl: DEFAULT_MQTT_URL, debug: false, liveWidget: true, warnings: [] });
  assert.equal(DEFAULT_MQTT_URL, 'ws://127.0.0.1:9001');
});

test('readConfig: ?mqtt と ?debug と ?live=off', () => {
  const c = readConfig('?mqtt=ws://192.168.0.5:9001&debug&live=off');
  assert.equal(c.mqttUrl, 'ws://192.168.0.5:9001');
  assert.equal(c.debug, true);
  assert.equal(c.liveWidget, false);
  assert.equal(readConfig('?mqtt=wss://example.test/mqtt').mqttUrl, 'wss://example.test/mqtt');
});

test('readConfig: ws:// でない値は既定に戻し、警告を返す', () => {
  const c = readConfig('?mqtt=http://127.0.0.1:9001');
  assert.equal(c.mqttUrl, DEFAULT_MQTT_URL);
  assert.equal(c.warnings.length, 1);
  assert.equal(readConfig('?mqtt=').mqttUrl, DEFAULT_MQTT_URL);
});

test('formatJst: UTC を JST で表示する(日付をまたぐ)', () => {
  assert.equal(formatJst(Date.parse('2025-11-18T07:00:00Z')), '2025-11-18 16:00 JST');
  assert.equal(formatJst(Date.parse('2025-11-18T15:00:00Z')), '2025-11-19 00:00 JST');
  assert.equal(formatJst(Date.parse('2026-10-04T01:02:03.456Z'), { seconds: true }), '2026-10-04 10:02:03 JST');
  assert.equal(formatJst(null), MISSING);
  assert.equal(formatJst(NaN), MISSING);
});

test('formatTimeOfDay: JST の時刻(ミリ秒まで)', () => {
  assert.equal(formatTimeOfDay(Date.parse('2026-10-04T14:32:09.342Z')), '23:32:09.342');
  assert.equal(formatTimeOfDay(undefined), MISSING);
});

test('formatHourMinute: 観測時刻の時:分(JST)', () => {
  assert.equal(formatHourMinute(Date.parse('2025-11-17T22:00:00Z')), '07:00');
  assert.equal(formatHourMinute(null), MISSING);
});

test('formatTemperature: 小数1桁、欠測は「—」、-0 は 0.0', () => {
  assert.equal(formatTemperature(-1.2), '-1.2℃');
  assert.equal(formatTemperature(12), '12.0℃');
  assert.equal(formatTemperature(-0.04), '0.0℃');
  assert.equal(formatTemperature(null), '—');
  assert.equal(formatTemperature(undefined), '—');
});

test('formatSnowDepth / formatMs', () => {
  assert.equal(formatSnowDepth(35), '35cm');
  assert.equal(formatSnowDepth(0), '0cm');
  assert.equal(formatSnowDepth(null), '—');
  assert.equal(formatMs(383.4), '383');
  assert.equal(formatMs(null), '—');
});

test('temperatureClass: 欠測は none(色を付けない)', () => {
  assert.equal(temperatureClass(null), 'none');
  assert.equal(temperatureClass(-3), 'cold');
  assert.equal(temperatureClass(0), 'cold');
  assert.equal(temperatureClass(2.5), 'near');
  assert.equal(temperatureClass(3.1), 'warm');
});
