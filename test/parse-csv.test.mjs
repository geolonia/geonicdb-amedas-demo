import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseObservationCsv, toUtcIso } from '../scripts/prepare/parse-csv.mjs';

const HEADER = '日付,時刻,気温(℃),風向(度:0～359),風速(m/s),降水量(mm),積雪深(cm),前１時間降雪量(cm)';
const csv = (...rows) => '﻿' + [HEADER, ...rows].join('\r\n') + '\r\n';

test('BOM と CRLF を取り除き、数値に変換する', () => {
  const out = parseObservationCsv(csv('2025-11-01,1:00,-0.5,140,1.0,0.0,2.0,1.0'));
  assert.deepEqual(out, [
    { t: '2025-10-31T16:00:00Z', temperature: -0.5, windDirection: 140, windSpeed: 1, precipitation: 0, snowHeight: 2, snowfall1h: 1 },
  ]);
});

test('JST の H:MM(ゼロ埋めなし)を UTC に変換する', () => {
  assert.equal(toUtcIso('2025-11-01', '0:10'), '2025-10-31T15:10:00Z');
  assert.equal(toUtcIso('2025-11-18', '9:00'), '2025-11-18T00:00:00Z');
});

test('24:00 は翌日の 00:00 として扱う(11/30 の 24:00 は UTC で 11/30T15:00Z)', () => {
  assert.equal(toUtcIso('2025-11-30', '24:00'), '2025-11-30T15:00:00Z');
  assert.equal(toUtcIso('2025-12-31', '24:00'), '2025-12-31T15:00:00Z');
});

test('欠測 × は、その属性だけを省略する', () => {
  const [o] = parseObservationCsv(csv('2025-11-01,0:10,×,146,1.5,0.0,0.0,-'));
  assert.deepEqual(o, { t: '2025-10-31T15:10:00Z', windDirection: 146, windSpeed: 1.5, precipitation: 0, snowHeight: 0 });
  assert.ok(!('temperature' in o));
});

test('積雪深の - も欠測として省略する', () => {
  const [o] = parseObservationCsv(csv('2025-11-01,0:10,1.0,146,1.5,0.0,-,-'));
  assert.ok(!('snowHeight' in o));
});

test('正時の行の降雪量が × のときも欠測(省略)', () => {
  const [o] = parseObservationCsv(csv('2025-11-01,1:00,1.0,146,1.5,0.0,0.0,×'));
  assert.ok(!('snowfall1h' in o));
});

test('正時以外の降雪量 - は省略、正時の 0.0 は 0 として残す', () => {
  const out = parseObservationCsv(csv('2025-11-01,0:50,1.0,146,1.5,0.0,0.0,-', '2025-11-01,1:00,1.0,146,1.5,0.0,0.0,0.0'));
  assert.ok(!('snowfall1h' in out[0]));
  assert.equal(out[1].snowfall1h, 0);
});

test('month を指定すると、その月(JST の日付)の行だけを返す', () => {
  const out = parseObservationCsv(
    csv('2025-10-31,23:50,1,1,1,0,0,-', '2025-11-01,0:10,1,1,1,0,0,-', '2025-11-30,24:00,1,1,1,0,0,0.0', '2025-12-01,0:10,1,1,1,0,0,-'),
    { month: '2025-11' },
  );
  assert.deepEqual(out.map((o) => o.t), ['2025-10-31T15:10:00Z', '2025-11-30T15:00:00Z']);
});

test('想定外の入力は、行番号つきのエラーにする', () => {
  assert.throws(() => parseObservationCsv('a,b\n1,2'), /ヘッダー/);
  assert.throws(() => parseObservationCsv(csv('2025-11-01,0:10,1,1')), /2 行目.*列数/);
  assert.throws(() => parseObservationCsv(csv('2025-11-01,0:10,abc,1,1,0,0,-')), /2 行目.*数値/);
  assert.throws(() => parseObservationCsv(csv('2025/11/01,0:10,1,1,1,0,0,-')), /2 行目.*日時/);
});

test('範囲外の日時(存在しない日、24:01 以降、60 分以上)は、正規化せずに行番号つきのエラーにする', () => {
  for (const [date, time] of [
    ['2025-02-30', '0:10'],
    ['2025-02-29', '0:10'], // 平年
    ['2025-04-31', '0:10'],
    ['2025-00-10', '0:10'],
    ['2025-13-01', '0:10'],
    ['2025-11-00', '0:10'],
    ['2025-11-01', '24:10'],
    ['2025-11-01', '24:01'],
    ['2025-11-01', '25:00'],
    ['2025-11-01', '12:60'],
  ]) {
    assert.throws(() => toUtcIso(date, time, 7), new RegExp(`7 行目: 日時の値が範囲外です: ${date} ${time}`), `${date} ${time}`);
  }
  assert.throws(() => parseObservationCsv(csv('2025-11-31,0:10,1,1,1,0,0,-')), /2 行目: 日時の値が範囲外/);
});

test('範囲の境界(閏年の 2/29、0:00、23:59、24:00)は受け付ける', () => {
  assert.equal(toUtcIso('2024-02-29', '0:10'), '2024-02-28T15:10:00Z');
  assert.equal(toUtcIso('2025-11-01', '0:00'), '2025-10-31T15:00:00Z');
  assert.equal(toUtcIso('2025-11-01', '23:59'), '2025-11-01T14:59:00Z');
  assert.equal(toUtcIso('2025-11-01', '24:00'), '2025-11-01T15:00:00Z');
});
