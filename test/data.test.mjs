import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WARDS } from '../scripts/lib/wards.mjs';
import { loadObservationFile, summarizeMissing } from '../scripts/lib/observations.mjs';

const load = (id) => loadObservationFile(`data/observations/${id}.json`);

test('各区に 30 日 × 144 点 = 4,320 行があり、10 分刻みで欠けも重複もない', () => {
  for (const w of WARDS) {
    const { observations } = load(w.id);
    assert.equal(observations.length, 4320, `${w.id}: 行数`);
    assert.equal(observations[0].t, '2025-10-31T15:10:00Z', `${w.id}: 最初の行は JST 11/1 0:10`);
    assert.equal(observations.at(-1).t, '2025-11-30T15:00:00Z', `${w.id}: 最後の行は JST 11/30 24:00`);
    for (let i = 1; i < observations.length; i++) {
      const dt = Date.parse(observations[i].t) - Date.parse(observations[i - 1].t);
      assert.equal(dt, 600000, `${w.id}: ${observations[i].t} の間隔`);
    }
  }
});

test('属性別の欠測数が想定の範囲に収まる', () => {
  for (const w of WARDS) {
    const { missing } = summarizeMissing(load(w.id).observations);
    assert.ok(missing.temperature >= 0 && missing.temperature <= 1500, `${w.id}: 気温の欠測 ${missing.temperature}`);
    assert.ok(missing.snowHeight <= 20, `${w.id}: 積雪深の欠測 ${missing.snowHeight}`);
  }
});

test('出典(取得元 URL)が各ファイルに記録されている', () => {
  for (const w of WARDS) assert.ok(load(w.id).source.url.startsWith('https://ckan.pf-sapporo.jp/'));
});

test('発表の概要の主張: 北区は 11/18(JST)の1日で積雪深が 35cm に達する', () => {
  const { observations } = load('kita');
  const day = observations.filter((o) => {
    const jst = new Date(Date.parse(o.t) + 9 * 3600 * 1000).toISOString();
    return jst.startsWith('2025-11-18');
  });
  assert.equal(Math.max(...day.map((o) => o.snowHeight ?? -1)), 35);
});

test('降雪量の条件付き購読の件数: 既定の再生範囲で 5cm 以上が 5 件、3cm 以上が 16 件', () => {
  const from = Date.parse('2025-11-18T02:50:00+09:00');
  const to = Date.parse('2025-11-19T00:00:00+09:00');
  let ge5 = 0;
  let ge3 = 0;
  for (const w of WARDS) {
    for (const o of load(w.id).observations) {
      const t = Date.parse(o.t);
      if (t < from || t > to || o.snowfall1h === undefined) continue;
      if (o.snowfall1h >= 5) ge5++;
      if (o.snowfall1h >= 3) ge3++;
    }
  }
  assert.equal(ge5, 5);
  assert.equal(ge3, 16);
});
