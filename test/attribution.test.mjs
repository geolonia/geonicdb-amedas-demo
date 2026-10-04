import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderAttribution } from '../scripts/prepare/attribution.mjs';

const meta = {
  retrievedAt: '2026-10-05',
  ckan: {
    title: '札幌市 気象観測データ',
    license: 'クリエイティブ・コモンズ 表示 4.0 国際',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/deed.ja',
    author: '札幌市建設局雪対策室事業課',
    modified: '2026-06-29',
    url: 'https://ckan.pf-sapporo.jp/dataset/sapporo_weather',
  },
  n03: { version: 'N03-20250101', retrievedAt: '2026-10-03', url: 'https://nlftp.mlit.go.jp/ksj/gml/data/N03/N03-2025/N03-20250101_01_GML.zip' },
};

test('CC BY 4.0 の表示要件(作成者、データセット名と URL、ライセンスと URL、取得日、改変)を含む', () => {
  const md = renderAttribution(meta);
  for (const s of [meta.ckan.author, meta.ckan.title, meta.ckan.url, meta.ckan.licenseUrl, '2026-10-05', '改変']) {
    assert.ok(md.includes(s), `${s} が含まれていません`);
  }
});

test('国土数値情報の年次版と、取得日と、加工した旨を含む', () => {
  const md = renderAttribution(meta);
  assert.ok(md.includes('N03-20250101'));
  assert.match(md.split('## 区の境界')[1], /取得日: 2026-10-03/);
  assert.ok(md.includes('加工して作成'));
});

test('気象庁の出典を含む', () => {
  assert.ok(renderAttribution(meta).includes('気象庁'));
});

test('観測地点の座標について、国土地理院の出典と加工した旨を含む', () => {
  const md = renderAttribution(meta);
  assert.ok(md.includes('出典:国土地理院ウェブサイト(https://www.gsi.go.jp/)'));
  assert.ok(md.includes('data/stations.json'));
  assert.ok(md.includes('住所'));
  assert.ok(md.includes('加工'));
});

test('国土数値情報のデータページと推奨の出典形式を含む', () => {
  const md = renderAttribution(meta);
  assert.ok(md.includes('https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2025.html'));
  assert.ok(md.includes(meta.n03.url));
  assert.ok(md.includes('「国土数値情報(行政区域データ)」(国土交通省)'));
  assert.ok(md.includes('を加工して作成'));
});

test('札幌市の節から、区ごとの CSV の URL の所在を示す', () => {
  const md = renderAttribution(meta);
  assert.ok(md.includes('data/source-meta.json'));
  assert.ok(md.includes('data/observations/*.json'));
});
