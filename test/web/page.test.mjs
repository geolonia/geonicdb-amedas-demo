import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync('web/index.html', 'utf8');
const attribution = /<footer id="attribution">([\s\S]*?)<\/footer>/.exec(html)?.[1] ?? '';

test('タイトルに札幌市と明示する(設計書 5.3)', () => {
  assert.match(/<title>([^<]*)<\/title>/.exec(html)?.[1] ?? '', /札幌市/);
  assert.match(/<h1>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? '', /札幌市/);
});

test('時計の見出しは「観測時刻」と「現在時刻」(設計書 5.2)', () => {
  const labels = [...html.matchAll(/<div class="clock-label">([^<]*)<\/div>/g)].map((m) => m[1]);
  assert.deepEqual(labels, ['観測時刻', '現在時刻']);
});

test('出典を常に表示する(札幌市 CC BY 4.0、国土数値情報、国土地理院)', () => {
  for (const s of ['札幌市', 'CC BY 4.0', '国土数値情報', '国土交通省', '国土地理院', '加工して作成']) {
    assert.ok(attribution.includes(s), `出典に「${s}」がありません`);
  }
});

test('外部のスクリプト、スタイル、フォントを読まない(オフラインで動かす)', () => {
  assert.doesNotMatch(html, /<(script|link)[^>]+(src|href)="(https?:)?\/\//);
  assert.doesNotMatch(readFileSync('web/src/style.css', 'utf8'), /@import|url\(\s*['"]?(https?:)?\/\//);
});

test('Vite: MapLibre の Worker を ES モジュールでビルドに含め、127.0.0.1 だけで待ち受ける', () => {
  const cfg = readFileSync('web/vite.config.js', 'utf8');
  assert.match(cfg, /worker: \{ format: 'es' \}/);
  assert.match(cfg, /host: '127\.0\.0\.1'/);
  assert.doesNotMatch(cfg, /host: (true|'0\.0\.0\.0')/);
});
