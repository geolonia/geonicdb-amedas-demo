# 札幌積雪タイムラプス 実装計画A(工程0〜2: 下地・データ・リプレイ)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 札幌市10区の2025年11月の観測データを NGSI-LD に変換し、OSS のブローカー(Stellio)へ加速した時計で書き込み、MQTT の通知として取り出せるところまでを作る。

**Architecture:** Node.js(ESM、依存なし)の小さなスクリプト群。変換・スケジュール・ペイロード組み立ては純関数にして `node:test` でテストし、HTTP と時計は注入して差し替える。ブローカーの違い(URL、`@context`、MQTT の宛先とバージョン)は、引数と環境変数で吸収する。

**Tech Stack:** Node.js 22 以上(開発環境は 24)、`node:test`、`mqtt`(スモークテストのみ。devDependency)、Docker Compose(Stellio 2.37.0、Mosquitto 2、nginx)。

**Spec:** `docs/superpowers/specs/2026-10-04-sapporo-snow-timelapse-design.md`(以下「設計書」)。計画B(工程3〜4: 地図アプリ、当日の最新値、README の仕上げ)は、この計画のレビューと工程2の測定結果のあとで別に書く。

## Global Constraints

- Node.js は 22 以上。ESM(`"type": "module"`)。TypeScript は使わない。テストは `node --test`。ランタイムの依存パッケージは持たない。
- 時刻は JST で解釈し、`observedAt` と `t` は **UTC の ISO 8601**(`2025-11-18T02:50:00Z` のように、ミリ秒なし)で持つ。
- ブローカーへの書き込みは、**区の間も含めて逐次**。並列にしない。
- 再生用の購読は、トピックが `amedas/` で始まる MQTT の3本(`amedas/live`、`amedas/cond/snowfall1h_ge5`、`amedas/cond/snowfall1h_ge3`)。`snowfall1h` は**正時の行にだけ**書き、条件付き購読は `watchedAttributes: ["snowfall1h"]` を付ける。
- 区の ID は固定の綴り: `chuo` `kita` `higashi` `shiroishi` `toyohira` `minami` `nishi` `atsubetsu` `teine` `kiyota`。エンティティ ID は `urn:ngsi-ld:WeatherObserved:sapporo-<ward>`。
- 欠測は全角の `×`(積雪深は `-` も)。欠測の属性は省略する(0 や NaN にしない)。`snowfall1h` の `-` は「正時以外で値がない」の意味。
- 公開リポジトリには、特定のブローカー製品の内部情報、ソース、SDK、調査レポート、`.env`、認証情報、試作のコード・データ・スクリーンショットを入れない。製品固有の根拠は、文書にも書かない。
- 区の境界は国土数値情報(N03)の元データから作る。ライセンス不明の配布物は使わない。
- コードのライセンスは MIT(Task 1 で確認)。データの出典は `data/ATTRIBUTION.md` に、CC BY 4.0 の要件(作成者、データセット名と URL、ライセンスと URL、取得日、改変の内容)を満たす形で書く。
- 公開リポジトリは履歴も公開される。最初に `.gitignore` とシークレットのスキャンを入れる。
- コミットメッセージは日本語。作業は `design/sapporo-snow-timelapse` から切ったブランチで行い、`main` へ直接コミットしない。

## Review Focus

設計書が暗黙に求めているが、各タスクのテストが主題にしていない入力と、期待される振る舞い。各行のテストは、担当するタスクの中に入れてある。

1. 正時の行の `snowfall1h` が `×` のとき: 欠測として省略する(Task 4)。
2. 日付をまたぐ `24:00`、11/30 の `24:00`(UTC で 11/30T15:00Z)(Task 4)。
3. `--from` が、ある属性の最初の観測より前のとき: エンティティにまだない属性は、PATCH ではなく追加(append)で書く。PATCH の失敗にしない(Task 6)。
4. ある区の行が、あるステップに存在しないとき: その区をそのステップで飛ばし、他の区は書く(Task 6)。
5. ブローカーが 4xx/5xx/207 を返す、または接続できない(例外)とき: 失敗として数え、連続5回で中断する。例外でプロセスが落ちない(Task 6、7)。
6. `setup` を再実行したとき: このデモの購読とエンティティだけを消して作り直す。他のデータは消さない(Task 7)。
7. `--to` が `--from` より前、または範囲に観測値がないとき: 分かりやすいエラーで終了する(Task 6)。
8. `--changed-only` でも、`snowfall1h` は値が同じでも毎回書く(同じ5cmが2時間続いても、毎正時の条件付き通知が出る)(Task 6)。

---

## ファイル構成

| パス | 役割 |
|---|---|
| `.gitignore`、`LICENSE`、`package.json`、`.pinact.yml` | 下地 |
| `.github/workflows/test.yml`、`security-suite.yml` | CI |
| `README.md` | 暫定版(Task 1)。クイックスタートは Task 9 |
| `scripts/lib/wards.mjs` | 10区の表(コード、ID、名称) |
| `scripts/lib/geo.mjs` | 点が多角形の中にあるかの判定(純関数) |
| `scripts/lib/observations.mjs` | 観測値の属性名、保存形式の変換、読み込み、欠測の集計 |
| `scripts/prepare/parse-csv.mjs` | 札幌市 CKAN の CSV の変換(純関数) |
| `scripts/prepare/wards-geojson.mjs` | N03 から10区の抽出(純関数) |
| `scripts/prepare/sources.mjs` | N03 と CKAN の取得(ネットワーク) |
| `scripts/prepare/attribution.mjs` | `data/ATTRIBUTION.md` の生成(純関数) |
| `scripts/prepare/build.mjs` | 上記をつなぐ CLI(`npm run build:data`) |
| `scripts/replayer/config.mjs` | 引数と環境変数の解釈(純関数) |
| `scripts/replayer/schedule.mjs` | 再生するステップの組み立てと、直前までの値の引き継ぎ(純関数) |
| `scripts/replayer/payload.mjs` | エンティティ、購読、書き込みのボディの組み立て(純関数) |
| `scripts/replayer/client.mjs` | NGSI-LD の HTTP クライアント(`fetch` を注入できる) |
| `scripts/replayer/run.mjs` | 逐次の書き込みの実行ループ(時計を注入できる) |
| `scripts/replayer/setup.mjs`、`replay.mjs` | CLI |
| `scripts/smoke/analyze.mjs`、`smoke.mjs` | スモークテストと遅延の測定 |
| `compose/` | Stellio、Mosquitto、context 配信の docker-compose |
| `data/` | 変換後のデータ(コミットする)と `data/raw/`(コミットしない) |
| `test/` | 単体テスト |

---

## 工程0: リポジトリの下地

### Task 1: 下地(`.gitignore`、LICENSE、CI、README の暫定版)

**Files:**
- Create: `.gitignore`、`LICENSE`、`package.json`、`package-lock.json`、`.pinact.yml`
- Create: `.github/workflows/test.yml`、`.github/workflows/security-suite.yml`
- Create: `test/repo.test.mjs`
- Modify: `README.md`

**Interfaces:**
- Produces: `npm test`(`node --test "test/**/*.test.mjs"`)。以降のすべてのタスクがこのコマンドでテストを実行する。

- [ ] **Step 1: 作業ブランチを切る**

```bash
cd "$(git rev-parse --show-toplevel)"
git checkout design/sapporo-snow-timelapse
git checkout -b feat/foundation-data-replay
```

- [ ] **Step 2: `.gitignore` を書く(他のファイルより先)**

```gitignore
node_modules/
.env
.env.*
data/raw/
.playwright-mcp/
dist/
*.log
replay-*.jsonl
.DS_Store
```

確認:

```bash
git check-ignore -v .env data/raw/x.csv node_modules/x .playwright-mcp/x replay-1.jsonl
```

期待: 5つのパスすべてが、`.gitignore` のどれかの行にマッチして表示される。

- [ ] **Step 3: 失敗するテストを書く(公開前の安全チェック)**

`test/repo.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

test('LICENSE がある', () => {
  assert.ok(existsSync('LICENSE'));
});

test('.gitignore が秘密情報と生データを除外している', () => {
  const lines = readFileSync('.gitignore', 'utf8').split('\n').map((l) => l.trim());
  for (const required of ['.env', 'data/raw/', 'node_modules/', '.playwright-mcp/']) {
    assert.ok(lines.includes(required), `.gitignore に ${required} がありません`);
  }
});
```

- [ ] **Step 4: `package.json` を書き、テストを実行して失敗を確認する**

```json
{
  "name": "sapporo-snow-timelapse",
  "version": "0.1.0",
  "private": true,
  "description": "札幌市10区の積雪を、NGSI-LD ブローカーの購読通知でタイムラプス表示するデモ",
  "type": "module",
  "engines": { "node": ">=22" },
  "scripts": {
    "test": "node --test \"test/**/*.test.mjs\"",
    "build:data": "node scripts/prepare/build.mjs",
    "setup": "node scripts/replayer/setup.mjs",
    "replay": "node scripts/replayer/replay.mjs",
    "smoke": "node scripts/smoke/smoke.mjs"
  },
  "devDependencies": {
    "mqtt": "^5.16.0"
  }
}
```

```bash
npm install
npm test
```

期待: `LICENSE がある` が FAIL(`.gitignore` のテストは PASS)。

- [ ] **Step 5: LICENSE を置く**

組織の標準を確認する:

```bash
gh repo list geolonia --limit 100 --json name,licenseInfo --jq '.[] | select(.licenseInfo != null) | "\(.name)\t\(.licenseInfo.spdxId)"' | head -20
```

多数が MIT なら MIT にする。著作権表記は、同じ組織の MIT のリポジトリの `LICENSE` に合わせる(分からなければ `Copyright (c) 2026 Geolonia Inc.`)。標準が MIT でなかった場合は、作業を止めてユーザーに確認する。MIT の本文:

```
MIT License

Copyright (c) 2026 Geolonia Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

```bash
npm test
```

期待: 2件とも PASS。

- [ ] **Step 6: CI を置く(Geolonia の標準に従う)**

組織の「Security Suite」のルールセットが、このリポジトリにすでに適用されているかを確認する:

```bash
gh api repos/geolonia/geonicdb-amedas-demo/rulesets --jq '.[].name'
gh api orgs/geolonia/rulesets --jq '.[].name' 2>&1 | head
```

「Security Suite」を含むルールセットがあれば `security-suite.yml` は不要(二重実行になる)。なければ、組織のテンプレートをそのまま置く:

```bash
gh api repos/geolonia/.github/contents/workflow-templates/security-suite.yml --jq .content | base64 -d > .github/workflows/security-suite.yml
gh api repos/geolonia/.github/contents/.pinact.yml --jq .content | base64 -d > .pinact.yml
```

`.github/workflows/test.yml`:

```yaml
name: Test

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          persist-credentials: false
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
```

アクションの SHA ピン留めは、手で書かず pinact に任せる:

```bash
which pinact || brew install pinact
pinact run
git diff .github/workflows/test.yml
```

期待: `actions/checkout@v4` と `actions/setup-node@v4` が、40桁の SHA とバージョンのコメントに置き換わる。

- [ ] **Step 7: README を暫定版にする**

`README.md`:

```markdown
# 札幌積雪タイムラプス

札幌市10区の2025年11月の観測データ(10分ごと)を、NGSI-LD の形式でブローカーに書き込み直し、
購読通知(MQTT)で地図に届けるデモです。FOSS4G Hokkaido 2026(2026-11-28)の発表のために作っています。

> 作業中です。動かし方は、実装の完了後にここへ書きます。設計は
> [docs/superpowers/specs/2026-10-04-sapporo-snow-timelapse-design.md](docs/superpowers/specs/2026-10-04-sapporo-snow-timelapse-design.md)
> を参照してください。

## データの出典

札幌市の気象観測データ(CC BY 4.0)などを加工して使っています。出典と加工の内容は
[data/ATTRIBUTION.md](data/ATTRIBUTION.md)(データの作成後に追加)を参照してください。

## ライセンス

コードは MIT ライセンスです([LICENSE](LICENSE))。データは、それぞれの出典のライセンスに従います。
```

- [ ] **Step 8: テストを通してコミットする**

```bash
npm test
git add .gitignore LICENSE package.json package-lock.json .pinact.yml .github test README.md
git commit -m "chore: リポジトリの下地(gitignore、LICENSE、CI、README の暫定版)を追加"
```

期待: テストが通る。`git status` に `node_modules/` が出ない。

- [ ] **Step 9: リポジトリの説明文を更新する(外に出る変更。ユーザーの確認を取ってから)**

ユーザーに「公開リポジトリの説明文を次のように変更してよいか」を確認する。承認が取れたら実行する:

```bash
gh repo edit geolonia/geonicdb-amedas-demo --description "札幌市10区の積雪を、NGSI-LD ブローカーの購読通知(MQTT)でタイムラプス表示するデモ(FOSS4G Hokkaido 2026)"
```

### レビューゲート A(工程0)

- [ ] **Step 10:** サブエージェントに、この工程のレビューを依頼する(`git diff main...HEAD` と、設計書の 6.2、6.3、6.5 を渡す)。観点: (1) 公開されて困る内容が入っていないか、(2) `.gitignore` の抜け、(3) CI の設定が Geolonia の標準に沿っているか(SHA ピン留め、`permissions`)、(4) LICENSE。指摘を直してから、Task 2 に進む。

---

## 工程1: データ

### Task 2: 10区の表と、区の境界(N03)

**Files:**
- Create: `scripts/lib/wards.mjs`、`scripts/lib/geo.mjs`、`scripts/prepare/wards-geojson.mjs`、`scripts/prepare/sources.mjs`、`scripts/prepare/build.mjs`
- Create: `test/wards-geojson.test.mjs`、`test/geo.test.mjs`
- Create(生成物): `data/wards.geojson`

**Interfaces:**
- Produces: `WARDS`(`{ code, id, name }[]`、並びは区コード順)、`wardById(id)`、`extractWards(featureCollection, { decimals }) → FeatureCollection`(各 feature の `properties` は `{ code, id, name }`)、`pointInGeometry([lon, lat], geometry) → boolean`。

- [ ] **Step 1: 区の表を書く**

`scripts/lib/wards.mjs`(区コードは、国土数値情報 N03-20250101 で確認済み):

```js
// 札幌市10区。code は全国地方公共団体コード(N03_007)。id はエンティティ ID と URL に使う綴り。
export const WARDS = Object.freeze([
  { code: '01101', id: 'chuo', name: '中央区' },
  { code: '01102', id: 'kita', name: '北区' },
  { code: '01103', id: 'higashi', name: '東区' },
  { code: '01104', id: 'shiroishi', name: '白石区' },
  { code: '01105', id: 'toyohira', name: '豊平区' },
  { code: '01106', id: 'minami', name: '南区' },
  { code: '01107', id: 'nishi', name: '西区' },
  { code: '01108', id: 'atsubetsu', name: '厚別区' },
  { code: '01109', id: 'teine', name: '手稲区' },
  { code: '01110', id: 'kiyota', name: '清田区' },
]);

export const wardById = (id) => {
  const w = WARDS.find((x) => x.id === id);
  if (!w) throw new Error(`未知の区 ID: ${id}`);
  return w;
};
```

- [ ] **Step 2: 失敗するテストを書く(点と多角形の判定)**

`test/geo.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pointInGeometry } from '../scripts/lib/geo.mjs';

const square = { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] };
const withHole = {
  type: 'Polygon',
  coordinates: [
    [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
    [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]],
  ],
};
const multi = {
  type: 'MultiPolygon',
  coordinates: [square.coordinates, [[[20, 20], [30, 20], [30, 30], [20, 30], [20, 20]]]],
};

test('多角形の内側と外側を判定する', () => {
  assert.equal(pointInGeometry([5, 5], square), true);
  assert.equal(pointInGeometry([11, 5], square), false);
});

test('穴の中は外側として扱う', () => {
  assert.equal(pointInGeometry([5, 5], withHole), false);
  assert.equal(pointInGeometry([2, 2], withHole), true);
});

test('MultiPolygon はどれかに含まれればよい', () => {
  assert.equal(pointInGeometry([25, 25], multi), true);
  assert.equal(pointInGeometry([15, 15], multi), false);
});

test('Polygon と MultiPolygon 以外はエラー', () => {
  assert.throws(() => pointInGeometry([0, 0], { type: 'Point', coordinates: [0, 0] }), /未対応/);
});
```

- [ ] **Step 3: 失敗を確認し、実装する**

```bash
npm test
```

期待: `Cannot find module .../geo.mjs` で FAIL。

`scripts/lib/geo.mjs`:

```js
// 光線法。境界上の点の扱いは問わない(観測点は区の内側にある前提のため)。
function inRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inPolygon(point, rings) {
  const [outer, ...holes] = rings;
  return inRing(point, outer) && !holes.some((h) => inRing(point, h));
}

export function pointInGeometry(point, geometry) {
  if (geometry.type === 'Polygon') return inPolygon(point, geometry.coordinates);
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.some((p) => inPolygon(point, p));
  throw new Error(`未対応のジオメトリです: ${geometry.type}`);
}
```

```bash
npm test
```

期待: `geo.test.mjs` の4件が PASS。

- [ ] **Step 4: 失敗するテストを書く(区の抽出)**

`test/wards-geojson.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractWards } from '../scripts/prepare/wards-geojson.mjs';
import { WARDS } from '../scripts/lib/wards.mjs';

const feature = (code, name, coordinates) => ({
  type: 'Feature',
  properties: { N03_001: '北海道', N03_004: '札幌市', N03_005: name, N03_007: code },
  geometry: { type: 'Polygon', coordinates },
});
const ring = [[141.123456789, 43.123456789], [141.2, 43.1], [141.15, 43.2], [141.123456789, 43.123456789]];

const sample = () => ({
  type: 'FeatureCollection',
  features: [
    feature('01100', '札幌市(ノイズ)', [ring]),
    feature('01202', '函館市', [ring]),
    ...[...WARDS].reverse().map((w) => feature(w.code, w.name, [ring])),
  ],
});

test('札幌市10区だけを、区コードの順に取り出す', () => {
  const fc = extractWards(sample());
  assert.equal(fc.type, 'FeatureCollection');
  assert.deepEqual(fc.features.map((f) => f.properties.code), WARDS.map((w) => w.code));
  assert.deepEqual(fc.features[1].properties, { code: '01102', id: 'kita', name: '北区' });
});

test('座標を指定の桁数に丸める(既定は4桁)', () => {
  const fc = extractWards(sample());
  assert.deepEqual(fc.features[0].geometry.coordinates[0][0], [141.1235, 43.1235]);
  const fc6 = extractWards(sample(), { decimals: 6 });
  assert.deepEqual(fc6.features[0].geometry.coordinates[0][0], [141.123457, 43.123457]);
});

test('区が欠けていればエラー', () => {
  const s = sample();
  s.features = s.features.filter((f) => f.properties.N03_007 !== '01106');
  assert.throws(() => extractWards(s), /01106/);
});
```

- [ ] **Step 5: 失敗を確認し、実装する**

`scripts/prepare/wards-geojson.mjs`:

```js
import { WARDS } from '../lib/wards.mjs';

const roundCoords = (c, d) => (typeof c[0] === 'number' ? c.map((n) => Number(n.toFixed(d))) : c.map((x) => roundCoords(x, d)));

// N03 の 2025 年版では、市が N03_004、区が N03_005、団体コードが N03_007。
// 年次版で列の意味が変わるため、団体コード(N03_007)で選ぶ。
export function extractWards(fc, { decimals = 4 } = {}) {
  const byCode = new Map(fc.features.map((f) => [f.properties.N03_007, f]));
  const features = WARDS.map((w) => {
    const f = byCode.get(w.code);
    if (!f) throw new Error(`N03 に区コード ${w.code}(${w.name})がありません`);
    return {
      type: 'Feature',
      properties: { code: w.code, id: w.id, name: w.name },
      geometry: { type: f.geometry.type, coordinates: roundCoords(f.geometry.coordinates, decimals) },
    };
  });
  return { type: 'FeatureCollection', features };
}
```

```bash
npm test
```

期待: `wards-geojson.test.mjs` の3件が PASS。

- [ ] **Step 6: N03 の取得と、境界データの生成(CLI)**

`scripts/prepare/sources.mjs`:

```js
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

// 国土数値情報 行政区域データ(N03)。北海道の 2025 年 1 月 1 日時点。
export const N03 = Object.freeze({
  version: 'N03-20250101',
  url: 'https://nlftp.mlit.go.jp/ksj/gml/data/N03/N03-2025/N03-20250101_01_GML.zip',
  zip: 'N03-20250101_01_GML.zip',
  geojson: 'N03-20250101_01.geojson',
});

export async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} の取得に失敗しました: ${res.status}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

export async function ensureN03(rawDir, { refresh = false } = {}) {
  mkdirSync(rawDir, { recursive: true });
  const zip = join(rawDir, N03.zip);
  const geojson = join(rawDir, N03.geojson);
  if (refresh || !existsSync(zip)) await download(N03.url, zip);
  if (refresh || !existsSync(geojson)) execFileSync('unzip', ['-o', '-q', zip, N03.geojson, '-d', rawDir]);
  return geojson;
}
```

`scripts/prepare/build.mjs`:

```js
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { extractWards } from './wards-geojson.mjs';
import { ensureN03, N03 } from './sources.mjs';

const refresh = process.argv.includes('--refresh');
const RAW = 'data/raw';
const OUT = 'data';

mkdirSync(OUT, { recursive: true });

// 1. 区の境界
const n03Path = await ensureN03(RAW, { refresh });
const wards = extractWards(JSON.parse(readFileSync(n03Path, 'utf8')));
writeFileSync(`${OUT}/wards.geojson`, JSON.stringify(wards));
console.log(`${OUT}/wards.geojson: ${wards.features.length} 区(${N03.version})`);
```

```bash
npm run build:data
ls -la data/wards.geojson
```

期待: `10 区(N03-20250101)` と表示され、`data/wards.geojson` は約 300〜400KB。`data/raw/` は `git status` に出ない。

- [ ] **Step 7: 生成物を検証して、コミットする**

```bash
node -e "
const fc = JSON.parse(require('fs').readFileSync('data/wards.geojson','utf8'));
console.log(fc.features.map(f => f.properties.code + ' ' + f.properties.id + ' ' + f.properties.name + ' ' + f.geometry.type).join('\n'));
"
git add scripts test data/wards.geojson
git commit -m "feat: 札幌市10区の表と、N03 から作った区の境界を追加"
```

期待: 10行が区コード順に並び、`id` が設計書の表と一致する。

### Task 3: 観測地点(`data/stations.json`)

**Files:**
- Create: `data/stations.json`、`test/stations.test.mjs`

**Interfaces:**
- Consumes: `WARDS`(Task 2)、`pointInGeometry`(Task 2)、`data/wards.geojson`(Task 2)。
- Produces: `data/stations.json` — 次の形の配列(10要素、`WARDS` の順)。
  ```json
  [{ "ward": "kita", "station": "北区土木センター", "address": "…", "coordinates": [141.35, 43.14],
     "sources": { "address": "https://…", "coordinates": "https://…" }, "note": "" }]
  ```

- [ ] **Step 1: 失敗するテストを書く**

`test/stations.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WARDS } from '../scripts/lib/wards.mjs';
import { pointInGeometry } from '../scripts/lib/geo.mjs';

const stations = JSON.parse(readFileSync('data/stations.json', 'utf8'));
const wards = JSON.parse(readFileSync('data/wards.geojson', 'utf8'));

test('10区ぶんの観測地点が、区の表の順にある', () => {
  assert.deepEqual(stations.map((s) => s.ward), WARDS.map((w) => w.id));
});

test('各観測地点に、住所、座標、出典がある', () => {
  for (const s of stations) {
    assert.ok(s.station && s.address, `${s.ward}: 名称と住所が必要です`);
    assert.ok(s.sources?.address?.startsWith('http'), `${s.ward}: 住所の出典 URL が必要です`);
    assert.ok(s.sources?.coordinates, `${s.ward}: 座標の出典が必要です`);
    assert.equal(s.coordinates.length, 2);
  }
});

test('各観測地点の座標は、その区の境界の内側にある', () => {
  for (const s of stations) {
    const ward = wards.features.find((f) => f.properties.id === s.ward);
    assert.ok(pointInGeometry(s.coordinates, ward.geometry), `${s.ward}: 座標 ${s.coordinates} が区の外です`);
  }
});
```

```bash
npm test
```

期待: `ENOENT ... data/stations.json` で FAIL。

- [ ] **Step 2: 北区の観測点を確認する**

発表者の事前調査では、北区に観測点が2か所あるとされている(公開資料での裏付けは未確認)。次を調べる:

```bash
curl -s 'https://ckan.pf-sapporo.jp/api/3/action/package_show?id=sapporo_weather' | python3 -c "
import sys, json
d = json.load(sys.stdin)['result']
print(d.get('notes'))
print(d.get('author'), d.get('maintainer'), d.get('metadata_modified'))
"
```

加えて、札幌市の公式サイトで「土木センター」「気象観測」「積雪」の観測点の一覧(地点名、所在地)を検索する。

- 北区の観測点が1か所と確認できた → そのまま進む。
- 2か所あり、CSV(`2025kansokukirokukita.csv`)がどちらのものか確認できた → 該当する観測点を採用し、`note` に判断の根拠を書く。
- **確認できない** → 作業を止め、調べた内容をユーザーに報告して指示を仰ぐ。推測で決めない。

- [ ] **Step 3: 各区の土木センターの所在地と座標を調べる**

札幌市の公式サイトで、10区それぞれの観測点(土木センター)の所在地を確認し、URL を記録する。座標は、国土地理院の住所検索(`https://msearch.gsi.go.jp/address-search/AddressSearch?q=<住所>`)で求める。使う前に、国土地理院の利用規約を確認し、出典の表記が必要な場合は `ATTRIBUTION.md`(Task 5)に含める。座標は `[経度, 緯度]` の順。

- [ ] **Step 4: `data/stations.json` を書く**

Step 2〜3 で調べた値で、10区ぶんを書く。1要素の例(値は調べたものに置き換える):

```json
{
  "ward": "kita",
  "station": "<調べた名称>",
  "address": "<調べた所在地>",
  "coordinates": [141.0, 43.0],
  "sources": { "address": "https://<札幌市の公式ページ>", "coordinates": "国土地理院 住所検索 <取得日>" },
  "note": ""
}
```

- [ ] **Step 5: テストを通す**

```bash
npm test
```

期待: `stations.test.mjs` の3件が PASS。座標が区の外になる区があれば、住所か座標を調べ直す。

- [ ] **Step 6: コミットする**

```bash
git add data/stations.json test/stations.test.mjs
git commit -m "feat: 札幌市10区の観測地点(土木センター)を追加"
```

### Task 4: 観測値の変換(CSV → 観測値)

**Files:**
- Create: `scripts/lib/observations.mjs`、`scripts/prepare/parse-csv.mjs`
- Create: `test/parse-csv.test.mjs`、`test/observations.test.mjs`

**Interfaces:**
- Produces(`scripts/lib/observations.mjs`):
  - `OBS_KEYS = ['temperature','windDirection','windSpeed','precipitation','snowHeight','snowfall1h']`
  - `packObservations(list) → { columns, rows }`、`unpackObservations({ columns, rows }) → list`
  - `summarizeMissing(list) → { rows, missing: { [key]: number } }`(`snowfall1h` は、正時の行だけを数える)
  - `loadObservationFile(path) → { ward, source, observations }`
- Produces(`scripts/prepare/parse-csv.mjs`):
  - `parseObservationCsv(text, { month? }) → Observation[]`。`Observation` は `{ t: 'YYYY-MM-DDTHH:MM:SSZ', temperature?, windDirection?, windSpeed?, precipitation?, snowHeight?, snowfall1h? }`(欠測のキーは持たない)。
  - `toUtcIso(date, time, lineNo?) → string`(JST の日付と `H:MM` を UTC に変換)。

- [ ] **Step 1: 失敗するテストを書く(CSV の変換)**

`test/parse-csv.test.mjs`:

```js
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
```

```bash
npm test
```

期待: `Cannot find module .../parse-csv.mjs` で FAIL。

- [ ] **Step 2: 実装する**

`scripts/prepare/parse-csv.mjs`:

```js
// 札幌市 CKAN の気象観測記録 CSV を、観測値の配列に変換する。
// 列: 日付,時刻,気温,風向,風速,降水量,積雪深,前1時間降雪量
// 欠測は全角の「×」(積雪深は「-」も)。降雪量の「-」は、正時以外で値がないという意味。
// どれも「その属性を持たない」として扱う。

const MISSING = new Set(['', '×', '-']);
const COLUMNS = [
  ['temperature', 2],
  ['windDirection', 3],
  ['windSpeed', 4],
  ['precipitation', 5],
  ['snowHeight', 6],
  ['snowfall1h', 7],
];

// 日付は YYYY-MM-DD、時刻は H:MM(ゼロ埋めなし。24:00 がある)。どちらも JST。
// Date.UTC は時の繰り上がりを扱うため、24:00 は自然に翌日の 00:00 になる。
export function toUtcIso(date, time, lineNo = 0) {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!d || !t) throw new Error(`${lineNo} 行目: 日時の形式が想定と異なります: ${date} ${time}`);
  const ms = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]) - 9, Number(t[2]));
  return new Date(ms).toISOString().replace('.000Z', 'Z');
}

export function parseObservationCsv(text, { month } = {}) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (!lines[0]?.startsWith('日付,時刻,')) throw new Error(`CSV のヘッダーが想定と異なります: ${lines[0]}`);
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const lineNo = i + 1;
    const cells = lines[i].split(',');
    if (cells.length !== 8) throw new Error(`${lineNo} 行目: 列数が 8 ではありません: ${lines[i]}`);
    const [date, time] = cells;
    if (month && !date.startsWith(month)) continue;
    const obs = { t: toUtcIso(date, time, lineNo) };
    for (const [key, idx] of COLUMNS) {
      const raw = cells[idx].trim();
      if (MISSING.has(raw)) continue;
      const n = Number(raw);
      if (!Number.isFinite(n)) throw new Error(`${lineNo} 行目: 数値として読めません: ${raw}`);
      obs[key] = n;
    }
    out.push(obs);
  }
  return out;
}
```

```bash
npm test
```

期待: `parse-csv.test.mjs` の9件が PASS。

- [ ] **Step 3: 失敗するテストを書く(保存形式と欠測の集計)**

`test/observations.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OBS_KEYS, packObservations, unpackObservations, summarizeMissing } from '../scripts/lib/observations.mjs';

const list = [
  { t: '2025-11-18T00:00:00Z', temperature: -1.5, snowHeight: 3, snowfall1h: 2 },
  { t: '2025-11-18T00:10:00Z', windSpeed: 1.2 },
];

test('保存形式は、欠測を null で持つ列指向の配列', () => {
  const packed = packObservations(list);
  assert.deepEqual(packed.columns, ['t', ...OBS_KEYS]);
  assert.deepEqual(packed.rows[0], ['2025-11-18T00:00:00Z', -1.5, null, null, null, 3, 2]);
  assert.deepEqual(packed.rows[1], ['2025-11-18T00:10:00Z', null, null, 1.2, null, null, null]);
});

test('pack → unpack で元に戻る(欠測はキーを持たない)', () => {
  assert.deepEqual(unpackObservations(packObservations(list)), list);
});

test('列が想定と違う保存データはエラー', () => {
  assert.throws(() => unpackObservations({ columns: ['t', 'x'], rows: [] }), /columns/);
});

test('欠測の集計: snowfall1h は正時の行だけを数える', () => {
  const rows = [
    { t: '2025-11-18T00:00:00Z', snowHeight: 1 },
    { t: '2025-11-18T00:10:00Z', snowHeight: 1 },
    { t: '2025-11-18T01:00:00Z', snowHeight: 1, snowfall1h: 0 },
  ];
  const s = summarizeMissing(rows);
  assert.equal(s.rows, 3);
  assert.equal(s.missing.snowfall1h, 1);
  assert.equal(s.missing.snowHeight, 0);
  assert.equal(s.missing.temperature, 3);
});
```

- [ ] **Step 4: 失敗を確認し、実装する**

`scripts/lib/observations.mjs`:

```js
import { readFileSync } from 'node:fs';

export const OBS_KEYS = Object.freeze(['temperature', 'windDirection', 'windSpeed', 'precipitation', 'snowHeight', 'snowfall1h']);
const COLUMNS = ['t', ...OBS_KEYS];

export function packObservations(list) {
  return { columns: [...COLUMNS], rows: list.map((o) => [o.t, ...OBS_KEYS.map((k) => o[k] ?? null)]) };
}

export function unpackObservations({ columns, rows }) {
  if (JSON.stringify(columns) !== JSON.stringify(COLUMNS)) throw new Error(`columns が想定と異なります: ${JSON.stringify(columns)}`);
  return rows.map((r) => {
    const o = { t: r[0] };
    OBS_KEYS.forEach((k, i) => {
      if (r[i + 1] !== null) o[k] = r[i + 1];
    });
    return o;
  });
}

// 観測は 10 分刻みで、JST(+9:00)と UTC は分が一致するため、t の分で正時を判定できる。
const isHourly = (o) => o.t.slice(14, 16) === '00';

export function summarizeMissing(list) {
  const missing = Object.fromEntries(OBS_KEYS.map((k) => [k, 0]));
  for (const o of list) {
    for (const k of OBS_KEYS) {
      if (k === 'snowfall1h' && !isHourly(o)) continue;
      if (o[k] === undefined) missing[k]++;
    }
  }
  return { rows: list.length, missing };
}

export function loadObservationFile(path) {
  const doc = JSON.parse(readFileSync(path, 'utf8'));
  return { ward: doc.ward, source: doc.source, observations: unpackObservations(doc) };
}
```

```bash
npm test
```

期待: `observations.test.mjs` の4件と `parse-csv.test.mjs` の9件が PASS。

- [ ] **Step 5: コミットする**

```bash
git add scripts test
git commit -m "feat: 札幌市 CSV の変換(欠測、24:00、JST→UTC)と観測値の保存形式を追加"
```

### Task 5: 観測データの取得と生成(CLI、出典)

**Files:**
- Modify: `scripts/prepare/sources.mjs`、`scripts/prepare/build.mjs`
- Create: `scripts/prepare/attribution.mjs`、`test/attribution.test.mjs`、`test/data.test.mjs`
- Create(生成物): `data/observations/<ward>.json`(10個)、`data/ATTRIBUTION.md`、`data/source-meta.json`

**Interfaces:**
- Consumes: `WARDS`、`parseObservationCsv`、`packObservations`、`summarizeMissing`、`loadObservationFile`、`N03`。
- Produces: `data/observations/<ward>.json` — `{ ward: { code, id, name }, source: { resource, url }, columns, rows }`。`data/source-meta.json` — `{ retrievedAt, ckan: { title, license, licenseUrl, author, modified, url }, n03: { version, url }, resources: { [wardId]: url } }`。`renderAttribution(meta) → string`。

- [ ] **Step 1: 失敗するテストを書く(出典の文面)**

`test/attribution.test.mjs`:

```js
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
  n03: { version: 'N03-20250101', url: 'https://nlftp.mlit.go.jp/ksj/gml/data/N03/N03-2025/N03-20250101_01_GML.zip' },
};

test('CC BY 4.0 の表示要件(作成者、データセット名と URL、ライセンスと URL、取得日、改変)を含む', () => {
  const md = renderAttribution(meta);
  for (const s of [meta.ckan.author, meta.ckan.title, meta.ckan.url, meta.ckan.licenseUrl, '2026-10-05', '改変']) {
    assert.ok(md.includes(s), `${s} が含まれていません`);
  }
});

test('国土数値情報の年次版と、加工した旨を含む', () => {
  const md = renderAttribution(meta);
  assert.ok(md.includes('N03-20250101'));
  assert.ok(md.includes('加工して作成'));
});

test('気象庁の出典を含む', () => {
  assert.ok(renderAttribution(meta).includes('気象庁'));
});
```

- [ ] **Step 2: 失敗を確認し、実装する**

`scripts/prepare/attribution.mjs`:

```js
export function renderAttribution(meta) {
  const { ckan, n03, retrievedAt } = meta;
  return `# データの出典とライセンス

このリポジトリのデータは、次の出典を加工して作成しています。

## 札幌市の気象観測データ

- 作成者: ${ckan.author}
- データセット: [${ckan.title}](${ckan.url})
- ライセンス: ${ckan.license}([CC BY 4.0](${ckan.licenseUrl}))
- 取得日: ${retrievedAt}(データセットの最終更新日: ${ckan.modified})
- 改変: 2025年のうち 2025-11-01 〜 2025-11-30 の分(10区、10分ごと)だけを抽出し、CSV から JSON に形式を変換しました。
  欠測(「×」など)は、その属性を持たない形にしました。時刻は JST から UTC に変換し、24:00 は翌日の 00:00 として扱いました。
  数値の変更はしていません。変換後のデータは \`data/observations/\` にあります。

## 区の境界(国土数値情報)

- 出典: 国土数値情報(行政区域データ ${n03.version})(国土交通省)
- 取得元: ${n03.url}
- 加工: 札幌市10区だけを抽出し、座標を小数点以下4桁に丸めて GeoJSON にしました(国土数値情報を加工して作成)。
  結果は \`data/wards.geojson\` にあります。

## 当日の最新の気象値(気象庁)

地図アプリは、会場のネットワークがあるとき、気象庁のホームページで公開されているアメダスの観測値(札幌)を取得して表示します。
表示するときは、出典(気象庁)と、加工した旨を画面に示します。
`;
}
```

```bash
npm test
```

期待: `attribution.test.mjs` の3件が PASS。

- [ ] **Step 3: CKAN の取得を実装する**

`scripts/prepare/sources.mjs` に追記する:

```js
export const CKAN_PACKAGE = 'https://ckan.pf-sapporo.jp/api/3/action/package_show?id=sapporo_weather';

// CKAN のリソース名は「2025年　中央区　気象観測記録」(区切りは全角スペース)。
// ファイル名の綴りは区ごとに揺れているため、名称から区を引く。
export async function ckanResources(year = 2025) {
  const res = await fetch(CKAN_PACKAGE);
  if (!res.ok) throw new Error(`CKAN の取得に失敗しました: ${res.status}`);
  const pkg = (await res.json()).result;
  const re = new RegExp(`^${year}年\\s*(.+?)\\s*気象観測記録$`);
  const byName = new Map();
  for (const r of pkg.resources) {
    const m = re.exec(r.name);
    if (m && r.format === 'CSV') byName.set(m[1], r.url);
  }
  return { pkg, byName };
}
```

- [ ] **Step 4: ビルドに観測データを加える**

`scripts/prepare/build.mjs` の末尾に追記する(先頭の import も追加):

```js
// --- import に追加 ---
import { existsSync } from 'node:fs';
import { WARDS } from '../lib/wards.mjs';
import { parseObservationCsv } from './parse-csv.mjs';
import { packObservations, summarizeMissing } from '../lib/observations.mjs';
import { download, ckanResources } from './sources.mjs';
import { renderAttribution } from './attribution.mjs';

// --- 末尾に追加 ---
// 2. 観測値(2025年11月、10区)
const MONTH = '2025-11';
const { pkg, byName } = await ckanResources(2025);
mkdirSync(`${OUT}/observations`, { recursive: true });
const resources = {};
for (const w of WARDS) {
  const url = byName.get(w.name);
  if (!url) throw new Error(`CKAN に ${w.name} の 2025 年の CSV がありません`);
  resources[w.id] = url;
  const csvPath = `${RAW}/sapporo-2025-${w.id}.csv`;
  if (refresh || !existsSync(csvPath)) await download(url, csvPath);
  const observations = parseObservationCsv(readFileSync(csvPath, 'utf8'), { month: MONTH });
  const { rows, missing } = summarizeMissing(observations);
  const packed = packObservations(observations);
  const head = JSON.stringify({ ward: { code: w.code, id: w.id, name: w.name }, source: { resource: `2025年 ${w.name} 気象観測記録`, url }, columns: packed.columns });
  writeFileSync(`${OUT}/observations/${w.id}.json`, `${head.slice(0, -1)},"rows":[\n${packed.rows.map((r) => JSON.stringify(r)).join(',\n')}\n]}\n`);
  console.log(`${w.id}: ${rows} 行、欠測 ${JSON.stringify(missing)}`);
}

// 3. 出典
const meta = {
  retrievedAt: new Date().toISOString().slice(0, 10),
  ckan: {
    title: pkg.title,
    license: pkg.license_title,
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/deed.ja',
    author: pkg.author || pkg.maintainer || '札幌市',
    modified: String(pkg.metadata_modified).slice(0, 10),
    url: 'https://ckan.pf-sapporo.jp/dataset/sapporo_weather',
  },
  n03: { version: N03.version, url: N03.url },
  resources,
};
writeFileSync(`${OUT}/source-meta.json`, JSON.stringify(meta, null, 2) + '\n');
writeFileSync(`${OUT}/ATTRIBUTION.md`, renderAttribution(meta));
console.log('出典:', meta.ckan.author, meta.ckan.license);
```

注: `author` が空のとき `'札幌市'` になる。CKAN の `author` に作成者(札幌市建設局雪対策室事業課)が入っているかを、次の Step で確認し、入っていなければ `meta.ckan.author` を、データセットのページに書かれた作成者の名称に直す。

- [ ] **Step 5: 実行して確認する**

```bash
npm run build:data
cat data/ATTRIBUTION.md | head -20
du -sh data/observations
```

期待: 10区ぶんの行数(4320)と欠測数が表示される。気温の欠測は各区で 823〜1,402 行の範囲に収まる。`ATTRIBUTION.md` の作成者が、データセットのページ(`https://ckan.pf-sapporo.jp/dataset/sapporo_weather`)の記載と一致する。

- [ ] **Step 6: 失敗するテストを書く(生成されたデータの検証)**

`test/data.test.mjs`:

```js
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
```

```bash
npm test
```

期待: すべて PASS。**件数のテストが FAIL する場合**は、変換のバグ、または試作の件数との食い違いを意味する。実データで数え直し、(a) 変換のバグなら直す、(b) 試作の記録が誤りなら、実測の値に直したうえで、設計書 4.2 の件数も同じコミットで直す。

- [ ] **Step 7: コミットする**

```bash
git add scripts test data
git commit -m "feat: 札幌市10区の2025年11月の観測データと出典を生成"
```

注: `data/raw/` はコミットされない。`git status` で確認する。

### レビューゲート B(工程1)

- [ ] **Step 8:** サブエージェントに、この工程のレビューを依頼する(`git diff main...HEAD`、設計書の3章、`data/` を渡す)。観点: (1) 変換が実データと一致するか(CSV の数行を手で照合させる)、(2) 出典の表記が CC BY 4.0 と国土数値情報の要件を満たすか、(3) 欠測、24:00、JST→UTC の扱い、(4) 観測地点と北区の判断の根拠、(5) 公開されて困るものが入っていないか。指摘を直してから、Task 6 に進む。

---

## 工程2: リプレイと購読

### Task 6: リプレイの中核(純関数と実行ループ)

**Files:**
- Create: `scripts/replayer/config.mjs`、`schedule.mjs`、`payload.mjs`、`run.mjs`
- Create: `test/config.test.mjs`、`schedule.test.mjs`、`payload.test.mjs`、`run.test.mjs`

**Interfaces:**
- Consumes: `OBS_KEYS`(Task 4)、`wardById`(Task 2)。
- Produces:
  - `config.mjs`: `DEFAULTS`、`parseConfig(argv: string[], env: object) → Config`。`Config` は `{ brokerUrl, apiBase, tenant?, context, mqttBase, mqttVersion, from, to, intervalMs, dataDir, logPath?, changedOnly }`。
  - `schedule.mjs`: `buildSteps(byWard: Map<wardId, Observation[]>, fromIso, toIso) → Step[]`(`Step = { t, writes: { ward, obs }[] }`)、`carryForward(list, beforeIso) → { [key]: { value, t } }`。
  - `payload.mjs`: `UNIT`、`attrProperty(key, value, observedAt)`、`sentAtProperty(iso)`、`buildEntity({ ward, station, context, attrs, sentAt }) → object`、`buildSubscriptions({ context, mqttBase, mqttVersion }) → object[]`、`planWrite({ known: Set, last: object, obs, changedOnly }) → { patch, append }`。
  - `run.mjs`: `runReplay({ steps, intervalMs, write, now, sleep, onStep, onWarn, maxConsecutiveFailures }) → { writes, failed, steps }`。`write(ward, obs, t)` は `Promise<boolean>`。

- [ ] **Step 1: 失敗するテストを書く(引数の解釈)**

`test/config.test.mjs`:

```js
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
```

- [ ] **Step 2: 失敗を確認し、実装する**

`scripts/replayer/config.mjs`:

```js
import { parseArgs } from 'node:util';

export const DEFAULTS = Object.freeze({
  brokerUrl: 'http://localhost:8080',
  context: 'http://context/weather.jsonld',
  mqttBase: 'mqtt://mosquitto:1883',
  mqttVersion: 'mqtt5.0',
  from: '2025-11-18T02:50:00+09:00',
  to: '2025-11-19T00:00:00+09:00',
  // 1 ステップ(観測 10 分)に当てる実時間のミリ秒。**測定前の暫定値**。Stellio での測定結果で、Task 9 で更新する。
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
```

```bash
npm test
```

期待: `config.test.mjs` の3件が PASS。

- [ ] **Step 3: 失敗するテストを書く(ステップの組み立て、値の引き継ぎ)**

`test/schedule.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSteps, carryForward } from '../scripts/replayer/schedule.mjs';

const obs = (t, extra = {}) => ({ t, ...extra });
const byWard = new Map([
  ['chuo', [obs('2025-11-18T00:00:00Z', { snowHeight: 1 }), obs('2025-11-18T00:10:00Z', { snowHeight: 2 }), obs('2025-11-18T00:20:00Z', { snowHeight: 3 })]],
  ['kita', [obs('2025-11-18T00:00:00Z', { snowHeight: 5 }), obs('2025-11-18T00:20:00Z', { snowHeight: 7 })]],
]);

test('範囲内の時刻ごとに、区の順で書き込みを並べる(両端を含む)', () => {
  const steps = buildSteps(byWard, '2025-11-18T09:00:00+09:00', '2025-11-18T09:10:00+09:00');
  assert.deepEqual(steps.map((s) => s.t), ['2025-11-18T00:00:00Z', '2025-11-18T00:10:00Z']);
  assert.deepEqual(steps[0].writes.map((w) => w.ward), ['chuo', 'kita']);
});

test('ある区の行がないステップでは、その区を飛ばし、他の区は書く', () => {
  const steps = buildSteps(byWard, '2025-11-18T09:10:00+09:00', '2025-11-18T09:10:00+09:00');
  assert.equal(steps.length, 1);
  assert.deepEqual(steps[0].writes.map((w) => w.ward), ['chuo']);
});

test('範囲に観測値がなければ、分かりやすいエラーにする', () => {
  assert.throws(() => buildSteps(byWard, '2026-01-01T00:00:00+09:00', '2026-01-02T00:00:00+09:00'), /観測値がありません/);
});

test('carryForward: 指定時刻より前の、属性ごとの最後の値を、その観測時刻つきで返す', () => {
  const list = [
    obs('2025-11-18T00:00:00Z', { temperature: -1, snowfall1h: 2 }),
    obs('2025-11-18T00:10:00Z', { temperature: -2 }),
    obs('2025-11-18T00:20:00Z', { temperature: -3 }),
  ];
  const c = carryForward(list, '2025-11-18T00:20:00Z');
  assert.deepEqual(c, {
    temperature: { value: -2, t: '2025-11-18T00:10:00Z' },
    snowfall1h: { value: 2, t: '2025-11-18T00:00:00Z' },
  });
});

test('carryForward: 前の観測がなければ空', () => {
  assert.deepEqual(carryForward([obs('2025-11-18T00:00:00Z', { temperature: 1 })], '2025-11-18T00:00:00Z'), {});
});
```

- [ ] **Step 4: 失敗を確認し、実装する**

`scripts/replayer/schedule.mjs`:

```js
import { OBS_KEYS } from '../lib/observations.mjs';

// byWard: Map<wardId, Observation[]>(区の順に並べておく。t の昇順)
export function buildSteps(byWard, fromIso, toIso) {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  const index = new Map();
  const times = new Set();
  for (const [ward, list] of byWard) {
    const m = new Map();
    for (const o of list) {
      const ms = Date.parse(o.t);
      if (ms >= from && ms <= to) {
        m.set(o.t, o);
        times.add(o.t);
      }
    }
    index.set(ward, m);
  }
  if (times.size === 0) throw new Error(`${fromIso} 〜 ${toIso} の範囲に観測値がありません`);
  return [...times].sort().map((t) => ({
    t,
    writes: [...index].filter(([, m]) => m.has(t)).map(([ward, m]) => ({ ward, obs: m.get(t) })),
  }));
}

// beforeIso より前の、属性ごとの最後の値(エンティティの初期値と、「すでにある属性」の判定に使う)
export function carryForward(list, beforeIso) {
  const limit = Date.parse(beforeIso);
  const out = {};
  for (const o of list) {
    if (Date.parse(o.t) >= limit) break;
    for (const k of OBS_KEYS) if (o[k] !== undefined) out[k] = { value: o[k], t: o.t };
  }
  return out;
}
```

```bash
npm test
```

期待: `schedule.test.mjs` の5件が PASS。

- [ ] **Step 5: 失敗するテストを書く(ペイロード)**

`test/payload.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attrProperty, sentAtProperty, buildEntity, buildSubscriptions, planWrite } from '../scripts/replayer/payload.mjs';

const CTX = 'http://context/weather.jsonld';

test('属性は、値、単位コード、観測時刻を持つ Property', () => {
  assert.deepEqual(attrProperty('snowHeight', 35, '2025-11-18T07:00:00Z'), {
    type: 'Property', value: 35, unitCode: 'CMT', observedAt: '2025-11-18T07:00:00Z',
  });
  assert.equal(attrProperty('temperature', -1, 't').unitCode, 'CEL');
  assert.equal(attrProperty('windDirection', 90, 't').unitCode, 'DEG');
});

test('sentAt は DateTime 型の Property', () => {
  assert.deepEqual(sentAtProperty('2026-11-28T01:00:00.123Z'), {
    type: 'Property', value: { '@type': 'DateTime', '@value': '2026-11-28T01:00:00.123Z' },
  });
});

test('エンティティ: ID、型、名前、位置、引き継いだ属性、sentAt を持つ', () => {
  const e = buildEntity({
    ward: { id: 'kita', name: '北区' },
    station: { coordinates: [141.35, 43.14] },
    context: CTX,
    attrs: { snowHeight: { value: 30, t: '2025-11-18T05:00:00Z' } },
    sentAt: '2026-10-05T00:00:00.000Z',
  });
  assert.equal(e['@context'], CTX);
  assert.equal(e.id, 'urn:ngsi-ld:WeatherObserved:sapporo-kita');
  assert.equal(e.type, 'WeatherObserved');
  assert.deepEqual(e.name, { type: 'Property', value: '北区' });
  assert.deepEqual(e.location, { type: 'GeoProperty', value: { type: 'Point', coordinates: [141.35, 43.14] } });
  assert.equal(e.snowHeight.value, 30);
  assert.equal(e.snowHeight.observedAt, '2025-11-18T05:00:00Z');
  assert.ok(e.sentAt);
});

test('購読は3本: 全件、5cm 以上、3cm 以上(条件付きは watchedAttributes を持つ)', () => {
  const subs = buildSubscriptions({ context: CTX, mqttBase: 'mqtt://mosquitto:1883', mqttVersion: 'mqtt5.0' });
  assert.deepEqual(
    subs.map((s) => s.notification.endpoint.uri),
    ['mqtt://mosquitto:1883/amedas/live', 'mqtt://mosquitto:1883/amedas/cond/snowfall1h_ge5', 'mqtt://mosquitto:1883/amedas/cond/snowfall1h_ge3'],
  );
  assert.equal(subs[0].q, undefined);
  assert.equal(subs[1].q, 'snowfall1h>=5');
  assert.equal(subs[2].q, 'snowfall1h>=3');
  assert.deepEqual(subs[1].watchedAttributes, ['snowfall1h']);
  for (const s of subs) {
    assert.equal(s.type, 'Subscription');
    assert.deepEqual(s.entities, [{ type: 'WeatherObserved' }]);
    assert.equal(s.notification.format, 'normalized');
    assert.deepEqual(s.notification.endpoint.notifierInfo, [
      { key: 'MQTT-Version', value: 'mqtt5.0' },
      { key: 'MQTT-QoS', value: '0' },
    ]);
  }
});

test('planWrite: すでにある属性は patch、まだない属性は append に分ける', () => {
  const obs = { t: '2025-11-18T00:00:00Z', temperature: -1, snowHeight: 3 };
  const { patch, append } = planWrite({ known: new Set(['snowHeight']), last: {}, obs, changedOnly: false });
  assert.deepEqual(Object.keys(patch), ['snowHeight']);
  assert.deepEqual(Object.keys(append), ['temperature']);
});

test('planWrite: 欠測の属性は、どちらにも入れない', () => {
  const { patch, append } = planWrite({ known: new Set(['temperature']), last: {}, obs: { t: 'x', snowHeight: 1 }, changedOnly: false });
  assert.deepEqual(Object.keys(patch), []);
  assert.deepEqual(Object.keys(append), ['snowHeight']);
});

test('planWrite(changedOnly): 前回と同じ値の属性を省く', () => {
  const known = new Set(['temperature', 'snowHeight']);
  const { patch } = planWrite({ known, last: { temperature: -1, snowHeight: 3 }, obs: { t: 'x', temperature: -1, snowHeight: 4 }, changedOnly: true });
  assert.deepEqual(Object.keys(patch), ['snowHeight']);
});

test('planWrite(changedOnly): snowfall1h は、値が同じでも毎回書く', () => {
  const known = new Set(['snowfall1h']);
  const { patch } = planWrite({ known, last: { snowfall1h: 5 }, obs: { t: 'x', snowfall1h: 5 }, changedOnly: true });
  assert.deepEqual(Object.keys(patch), ['snowfall1h']);
});
```

- [ ] **Step 6: 失敗を確認し、実装する**

`scripts/replayer/payload.mjs`:

```js
import { OBS_KEYS } from '../lib/observations.mjs';

export const UNIT = Object.freeze({
  temperature: 'CEL',
  windDirection: 'DEG',
  windSpeed: 'MTS',
  precipitation: 'MMT',
  snowHeight: 'CMT',
  snowfall1h: 'CMT',
});

export const entityId = (wardId) => `urn:ngsi-ld:WeatherObserved:sapporo-${wardId}`;

export const attrProperty = (key, value, observedAt) => ({ type: 'Property', value, unitCode: UNIT[key], observedAt });

// 配信の遅延を測るための、書き込み時刻。
export const sentAtProperty = (iso) => ({ type: 'Property', value: { '@type': 'DateTime', '@value': iso } });

export function buildEntity({ ward, station, context, attrs, sentAt }) {
  const entity = {
    '@context': context,
    id: entityId(ward.id),
    type: 'WeatherObserved',
    name: { type: 'Property', value: ward.name },
    location: { type: 'GeoProperty', value: { type: 'Point', coordinates: station.coordinates } },
  };
  for (const [key, { value, t }] of Object.entries(attrs)) entity[key] = attrProperty(key, value, t);
  entity.sentAt = sentAtProperty(sentAt);
  return entity;
}

function subscription(context, mqttBase, mqttVersion, topic, extra = {}) {
  return {
    '@context': context,
    type: 'Subscription',
    entities: [{ type: 'WeatherObserved' }],
    ...extra,
    notification: {
      format: 'normalized',
      endpoint: {
        uri: `${mqttBase}/${topic}`,
        accept: 'application/json',
        notifierInfo: [
          { key: 'MQTT-Version', value: mqttVersion },
          { key: 'MQTT-QoS', value: '0' },
        ],
      },
    },
  };
}

// 条件付き購読は、条件が成立している間は書き込みのたびに通知される。
// snowfall1h を正時にだけ書き、watchedAttributes で絞ることで、「その時間に条件を満たした」通知になる。
export function buildSubscriptions({ context, mqttBase, mqttVersion }) {
  const mk = (topic, extra) => subscription(context, mqttBase, mqttVersion, topic, extra);
  const cond = (threshold) => ({ watchedAttributes: ['snowfall1h'], q: `snowfall1h>=${threshold}` });
  return [
    mk('amedas/live'),
    mk('amedas/cond/snowfall1h_ge5', cond(5)),
    mk('amedas/cond/snowfall1h_ge3', cond(3)),
  ];
}

// known: エンティティにすでにある属性。last: 前回に書いた値。
// すでにある属性は PATCH、まだない属性は追加(append)する。
// changedOnly のとき、前回と同じ値の属性は省く。ただし snowfall1h は常に書く
// (同じ値が続いても、毎正時に条件付き購読の通知が出るようにするため)。
export function planWrite({ known, last, obs, changedOnly }) {
  const patch = {};
  const append = {};
  for (const key of OBS_KEYS) {
    if (obs[key] === undefined) continue;
    if (changedOnly && key !== 'snowfall1h' && last[key] === obs[key]) continue;
    (known.has(key) ? patch : append)[key] = attrProperty(key, obs[key], obs.t);
  }
  return { patch, append };
}
```

```bash
npm test
```

期待: `payload.test.mjs` の8件が PASS。

- [ ] **Step 7: 失敗するテストを書く(実行ループ)**

`test/run.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runReplay } from '../scripts/replayer/run.mjs';

// 偽の時計: sleep が時刻を進める。write は 1ms かかるものとして時刻を進める。
function fakeClock() {
  let t = 1_000_000;
  return { now: () => t, sleep: async (ms) => { t += ms; }, advance: (ms) => { t += ms; } };
}
const steps = (n, wards = ['a', 'b']) =>
  Array.from({ length: n }, (_, i) => ({ t: `t${i}`, writes: wards.map((ward) => ({ ward, obs: { t: `t${i}` } })) }));

test('ステップは intervalMs の間隔で、区は順に1つずつ書く(並列にしない)', async () => {
  const clock = fakeClock();
  const calls = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const write = async (ward, obs) => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    calls.push([clock.now(), ward, obs.t]);
    await Promise.resolve();
    inFlight--;
    return true;
  };
  const stats = await runReplay({ steps: steps(3), intervalMs: 1000, write, ...clock });
  assert.equal(maxInFlight, 1);
  assert.deepEqual(calls.map((c) => c[1] + c[2]), ['at0', 'bt0', 'at1', 'bt1', 'at2', 'bt2']);
  assert.deepEqual(calls.map((c) => c[0]), [1_000_000, 1_000_000, 1_001_000, 1_001_000, 1_002_000, 1_002_000]);
  assert.deepEqual(stats, { writes: 6, failed: 0, steps: 3 });
});

test('書き込みに時間がかかっても、ステップの時刻は遅れを累積させない', async () => {
  const clock = fakeClock();
  const starts = [];
  const write = async (ward, obs) => {
    if (ward === 'a') starts.push([obs.t, clock.now()]);
    clock.advance(300);
    return true;
  };
  await runReplay({ steps: steps(3), intervalMs: 1000, write, ...clock });
  assert.deepEqual(starts.map((s) => s[1]), [1_000_000, 1_001_000, 1_002_000]);
});

test('遅れが大きいときは警告する', async () => {
  const clock = fakeClock();
  const warns = [];
  const write = async () => { clock.advance(5000); return true; };
  await runReplay({ steps: steps(3, ['a']), intervalMs: 1000, write, onWarn: (m) => warns.push(m), ...clock });
  assert.ok(warns.length >= 1);
});

test('連続して5回失敗したら中断する', async () => {
  const clock = fakeClock();
  let n = 0;
  const write = async () => { n++; return false; };
  await assert.rejects(() => runReplay({ steps: steps(10), intervalMs: 1000, write, ...clock }), /連続 5 回/);
  assert.equal(n, 5);
});

test('成功が挟まれば、連続の失敗は数え直す', async () => {
  const clock = fakeClock();
  let n = 0;
  const write = async () => { n++; return n % 3 === 0; };
  const stats = await runReplay({ steps: steps(4), intervalMs: 10, write, ...clock });
  // 8 回の書き込みのうち、n が 3 の倍数(3、6)だけが成功する。失敗は 6 回で、連続は最大 2 回。
  assert.equal(stats.steps, 4);
  assert.equal(stats.writes, 2);
  assert.equal(stats.failed, 6);
});

test('write が例外を投げても、失敗として数える(プロセスを落とさない)', async () => {
  const clock = fakeClock();
  const write = async () => { throw new Error('ECONNREFUSED'); };
  await assert.rejects(() => runReplay({ steps: steps(10), intervalMs: 10, write, ...clock }), /連続 5 回/);
});
```

- [ ] **Step 8: 失敗を確認し、実装する**

`scripts/replayer/run.mjs`:

```js
// steps を intervalMs の間隔で再生する。各ステップの中では、区を1つずつ順に書く(並列にしない)。
// now と sleep は、テストで差し替えるために注入する。
export async function runReplay({
  steps,
  intervalMs,
  write,
  now = Date.now,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  onStep,
  onWarn,
  maxConsecutiveFailures = 5,
}) {
  const t0 = now();
  const stats = { writes: 0, failed: 0, steps: 0 };
  let consecutive = 0;
  for (let i = 0; i < steps.length; i++) {
    const due = t0 + i * intervalMs;
    const wait = due - now();
    if (wait > 0) await sleep(wait);
    const lag = Math.max(0, now() - due);
    if (lag > Math.max(1000, 2 * intervalMs)) onWarn?.(`ステップ ${i + 1}/${steps.length}: ${lag}ms 遅れています`);
    for (const { ward, obs } of steps[i].writes) {
      let ok = false;
      try {
        ok = await write(ward, obs, steps[i].t);
      } catch {
        ok = false;
      }
      if (ok) {
        consecutive = 0;
        stats.writes++;
      } else {
        stats.failed++;
        consecutive++;
        if (consecutive >= maxConsecutiveFailures) {
          throw new Error(`書き込みが連続 ${maxConsecutiveFailures} 回失敗したため中断しました(ステップ ${i + 1}/${steps.length}、区: ${ward})`);
        }
      }
    }
    stats.steps++;
    onStep?.({ index: i, total: steps.length, t: steps[i].t, lag });
  }
  return stats;
}
```

```bash
npm test
```

期待: `run.test.mjs` の6件を含め、すべて PASS。

- [ ] **Step 9: コミットする**

```bash
git add scripts test
git commit -m "feat: リプレイの中核(引数、ステップ、ペイロード、逐次の実行ループ)を追加"
```

### Task 7: NGSI-LD クライアントと CLI(`setup`、`replay`)

**Files:**
- Create: `scripts/replayer/client.mjs`、`scripts/replayer/setup.mjs`、`scripts/replayer/replay.mjs`、`scripts/replayer/data.mjs`
- Create: `test/client.test.mjs`

**Interfaces:**
- Consumes: Task 2〜6 のすべて。
- Produces:
  - `client.mjs`: `createClient({ apiBase, tenant?, context, fetchImpl? }) → { createEntity(e), deleteEntity(id), listSubscriptions(), deleteSubscription(id), createSubscription(s), patchAttrs(id, attrs), appendAttrs(id, attrs) }`。どれも `Promise<{ status: number, text: string }>`(`listSubscriptions` は `Promise<{ status, text, json }>`)。`ok(r)` は `r.status >= 200 && r.status < 300`(207 は成功としない)。
  - `data.mjs`: `loadDemoData(dataDir) → { wards: {ward, station, observations}[] , byWard: Map }`(区の順)。

- [ ] **Step 1: 失敗するテストを書く(クライアント)**

`test/client.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient, ok } from '../scripts/replayer/client.mjs';

function fake(responses = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, ...init });
    const r = responses[`${init.method} ${new URL(url).pathname}`] ?? { status: 204, body: '' };
    return { status: r.status, text: async () => r.body ?? '' };
  };
  return { calls, fetchImpl };
}
const base = { apiBase: 'http://b/ngsi-ld/v1', context: 'http://context/weather.jsonld' };

test('エンティティの作成は application/ld+json で、@context はボディに入れる(Link は付けない)', async () => {
  const { calls, fetchImpl } = fake();
  await createClient({ ...base, fetchImpl }).createEntity({ '@context': 'x', id: 'urn:a', type: 'T' });
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].url, 'http://b/ngsi-ld/v1/entities');
  assert.equal(calls[0].headers['Content-Type'], 'application/ld+json');
  assert.equal(calls[0].headers.Link, undefined);
});

test('属性の更新は application/json で、@context は Link ヘッダーで渡す', async () => {
  const { calls, fetchImpl } = fake();
  await createClient({ ...base, fetchImpl }).patchAttrs('urn:ngsi-ld:X:1', { a: { type: 'Property', value: 1 } });
  assert.equal(calls[0].method, 'PATCH');
  assert.equal(calls[0].url, 'http://b/ngsi-ld/v1/entities/urn%3Angsi-ld%3AX%3A1/attrs');
  assert.equal(calls[0].headers['Content-Type'], 'application/json');
  assert.equal(calls[0].headers.Link, '<http://context/weather.jsonld>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"');
});

test('属性の追加は POST /entities/{id}/attrs', async () => {
  const { calls, fetchImpl } = fake();
  await createClient({ ...base, fetchImpl }).appendAttrs('urn:a', { a: { type: 'Property', value: 1 } });
  assert.equal(calls[0].method, 'POST');
  assert.ok(calls[0].url.endsWith('/entities/urn%3Aa/attrs'));
});

test('テナントを指定したときだけ NGSILD-Tenant ヘッダーを付ける', async () => {
  const a = fake();
  await createClient({ ...base, tenant: 'demo', fetchImpl: a.fetchImpl }).deleteEntity('urn:a');
  assert.equal(a.calls[0].headers['NGSILD-Tenant'], 'demo');
  const b = fake();
  await createClient({ ...base, fetchImpl: b.fetchImpl }).deleteEntity('urn:a');
  assert.equal(b.calls[0].headers['NGSILD-Tenant'], undefined);
});

test('購読の一覧は JSON として返す', async () => {
  const { fetchImpl } = fake({ 'GET /ngsi-ld/v1/subscriptions': { status: 200, body: '[{"id":"urn:s"}]' } });
  const r = await createClient({ ...base, fetchImpl }).listSubscriptions();
  assert.deepEqual(r.json, [{ id: 'urn:s' }]);
});

test('ok(): 2xx だけが成功。207(一部失敗)と 4xx/5xx は失敗', () => {
  assert.equal(ok({ status: 204 }), true);
  assert.equal(ok({ status: 201 }), true);
  assert.equal(ok({ status: 207 }), false);
  assert.equal(ok({ status: 404 }), false);
  assert.equal(ok({ status: 500 }), false);
});
```

- [ ] **Step 2: 失敗を確認し、実装する**

`scripts/replayer/client.mjs`:

```js
// 207(一部の属性だけ失敗)は、成功としない。
export const ok = (r) => r.status >= 200 && r.status < 300 && r.status !== 207;

export function createClient({ apiBase, tenant, context, fetchImpl = fetch }) {
  const link = `<${context}>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"`;

  // ld: true のとき、ボディが JSON-LD(@context を含む)。それ以外は application/json で、@context は Link ヘッダーで渡す。
  async function request(method, path, body, { ld = false } = {}) {
    const headers = {};
    if (tenant) headers['NGSILD-Tenant'] = tenant;
    if (body !== undefined) headers['Content-Type'] = ld ? 'application/ld+json' : 'application/json';
    if (!ld) headers.Link = link;
    const res = await fetchImpl(`${apiBase}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, text: await res.text() };
  }

  const enc = encodeURIComponent;
  return {
    createEntity: (e) => request('POST', '/entities', e, { ld: true }),
    deleteEntity: (id) => request('DELETE', `/entities/${enc(id)}`),
    createSubscription: (s) => request('POST', '/subscriptions', s, { ld: true }),
    deleteSubscription: (id) => request('DELETE', `/subscriptions/${enc(id)}`),
    patchAttrs: (id, attrs) => request('PATCH', `/entities/${enc(id)}/attrs`, attrs),
    appendAttrs: (id, attrs) => request('POST', `/entities/${enc(id)}/attrs`, attrs),
    async listSubscriptions() {
      const r = await request('GET', '/subscriptions?limit=100');
      let json = [];
      try {
        json = JSON.parse(r.text || '[]');
      } catch {
        json = [];
      }
      return { ...r, json };
    },
  };
}
```

```bash
npm test
```

期待: `client.test.mjs` の6件が PASS。

- [ ] **Step 3: データの読み込みを書く**

`scripts/replayer/data.mjs`:

```js
import { readFileSync } from 'node:fs';
import { WARDS } from '../lib/wards.mjs';
import { loadObservationFile } from '../lib/observations.mjs';

// 区の順に、観測地点と観測値を読み込む。
export function loadDemoData(dataDir) {
  const stations = JSON.parse(readFileSync(`${dataDir}/stations.json`, 'utf8'));
  const wards = WARDS.map((ward) => {
    const station = stations.find((s) => s.ward === ward.id);
    if (!station) throw new Error(`stations.json に ${ward.id} がありません`);
    const { observations } = loadObservationFile(`${dataDir}/observations/${ward.id}.json`);
    return { ward, station, observations };
  });
  return { wards, byWard: new Map(wards.map((w) => [w.ward.id, w.observations])) };
}
```

- [ ] **Step 4: `setup` を書く**

`scripts/replayer/setup.mjs`:

```js
// 使い方: npm run setup -- [--from ISO] [--broker-url URL] [--tenant NAME] ...
// このデモが作ったエンティティと購読(トピックが amedas/ で始まるもの)だけを消して、作り直す。
import { parseConfig } from './config.mjs';
import { createClient, ok } from './client.mjs';
import { loadDemoData } from './data.mjs';
import { carryForward } from './schedule.mjs';
import { buildEntity, buildSubscriptions, entityId } from './payload.mjs';

const config = parseConfig(process.argv.slice(2), process.env);
const client = createClient(config);
const { wards } = loadDemoData(config.dataDir);

const isDemoSubscription = (s) => String(s?.notification?.endpoint?.uri ?? '').includes('/amedas/');

const list = await client.listSubscriptions();
if (list.status >= 300) throw new Error(`購読の一覧を取得できません: ${list.status} ${list.text.slice(0, 200)}`);
for (const s of list.json.filter(isDemoSubscription)) {
  const r = await client.deleteSubscription(s.id);
  console.log(`購読を削除: ${s.id} (${r.status})`);
}

for (const { ward, station, observations } of wards) {
  await client.deleteEntity(entityId(ward.id));
  const entity = buildEntity({
    ward,
    station,
    context: config.context,
    attrs: carryForward(observations, config.from),
    sentAt: new Date().toISOString(),
  });
  const r = await client.createEntity(entity);
  if (!ok(r)) throw new Error(`${ward.id} のエンティティを作れません: ${r.status} ${r.text.slice(0, 300)}`);
}
console.log(`エンティティを作成: ${wards.length} 件`);

for (const sub of buildSubscriptions(config)) {
  const r = await client.createSubscription(sub);
  if (!ok(r)) throw new Error(`購読を作れません(${sub.notification.endpoint.uri}): ${r.status} ${r.text.slice(0, 300)}`);
  console.log(`購読を作成: ${sub.notification.endpoint.uri}${sub.q ? `  (q=${sub.q})` : ''}`);
}
```

- [ ] **Step 5: `replay` を書く**

`scripts/replayer/replay.mjs`:

```js
// 使い方: npm run replay -- [--from ISO] [--to ISO] [--interval MS] [--changed-only] [--log FILE] ...
import { createWriteStream } from 'node:fs';
import { parseConfig } from './config.mjs';
import { createClient, ok } from './client.mjs';
import { loadDemoData } from './data.mjs';
import { buildSteps, carryForward } from './schedule.mjs';
import { entityId, planWrite, sentAtProperty } from './payload.mjs';
import { runReplay } from './run.mjs';

const config = parseConfig(process.argv.slice(2), process.env);
const client = createClient(config);
const { wards, byWard } = loadDemoData(config.dataDir);
const steps = buildSteps(byWard, config.from, config.to);
const log = config.logPath ? createWriteStream(config.logPath) : null;

// setup が作ったエンティティにある属性と、直前の値を、同じ規則(carryForward)で再現する。
const state = new Map(
  wards.map(({ ward, observations }) => {
    const prior = carryForward(observations, config.from);
    return [ward.id, { known: new Set(Object.keys(prior)), last: Object.fromEntries(Object.entries(prior).map(([k, v]) => [k, v.value])) }];
  }),
);

async function write(wardId, obs, t) {
  const st = state.get(wardId);
  const { patch, append } = planWrite({ known: st.known, last: st.last, obs, changedOnly: config.changedOnly });
  const id = entityId(wardId);
  const sentAt = new Date().toISOString();
  patch.sentAt = sentAtProperty(sentAt);
  const pr = await client.patchAttrs(id, patch);
  let status = pr.status;
  let success = ok(pr);
  if (success && Object.keys(append).length > 0) {
    const r = await client.appendAttrs(id, append);
    status = r.status;
    success = ok(r);
    if (success) for (const k of Object.keys(append)) st.known.add(k);
  }
  if (success) {
    for (const [k, p] of Object.entries({ ...patch, ...append })) {
      if (k !== 'sentAt') st.last[k] = p.value;
    }
  } else {
    console.warn(`${wardId} ${t}: ${status}`);
  }
  log?.write(`${JSON.stringify({ id, ward: wardId, t, sentAt, status })}\n`);
  return success;
}

console.log(`再生: ${steps.length} ステップ、${config.from} 〜 ${config.to}、${config.intervalMs}ms/ステップ`);
const stats = await runReplay({
  steps,
  intervalMs: config.intervalMs,
  write,
  onWarn: (m) => console.warn(m),
  onStep: ({ index, total, t, lag }) => {
    if ((index + 1) % 10 === 0 || index + 1 === total) console.log(`ステップ ${index + 1}/${total} ${t} 遅れ ${lag}ms`);
  },
});
log?.end();
console.log(`完了: ${stats.steps} ステップ、書き込み ${stats.writes} 件、失敗 ${stats.failed} 件`);
if (stats.failed > 0) process.exitCode = 1;
```

- [ ] **Step 6: 構文を確認して、コミットする**

```bash
node --check scripts/replayer/setup.mjs && node --check scripts/replayer/replay.mjs
node scripts/replayer/replay.mjs --from 2030-01-01T00:00:00+09:00 --to 2030-01-02T00:00:00+09:00
```

期待: 構文エラーなし。2つ目のコマンドは、`2030-01-01T00:00:00+09:00 〜 ... の範囲に観測値がありません` というエラーで終了する(ブローカーに接続する前)。

```bash
npm test
git add scripts test
git commit -m "feat: NGSI-LD クライアントと setup、replay の CLI を追加"
```

### Task 8: compose(Stellio、Mosquitto、context 配信)

**Files:**
- Create: `compose/docker-compose.yml`、`compose/mosquitto/mosquitto.conf`、`compose/context/weather.jsonld`、`compose/context/nginx.conf`
- Create: `compose/stellio/docker-compose.yml`、`compose/stellio/docker-compose-dependencies.yml`、`compose/stellio/stellio.env`、`compose/NOTICE.md`

**Interfaces:**
- Produces: `docker compose -f compose/docker-compose.yml up -d` で、`http://localhost:8080/ngsi-ld/v1`(Stellio の API ゲートウェイ)、`mqtt://127.0.0.1:1883`、`ws://127.0.0.1:9001`(MQTT の WebSocket)、`http://127.0.0.1:8081/weather.jsonld`(context)が使える。コンテナ内からは、`http://context/weather.jsonld`、`mqtt://mosquitto:1883` で参照できる。

- [ ] **Step 1: Stellio の compose を、バージョンを固定して取り込む**

Stellio は Apache-2.0。公式の compose を、タグ `2.37.0` で取得する:

```bash
mkdir -p compose/stellio compose/mosquitto compose/context
REF=2.37.0
for f in docker-compose.yml docker-compose-dependencies.yml; do
  gh api "repos/stellio-hub/stellio-context-broker/contents/$f?ref=$REF" --jq .content | base64 -d > "compose/stellio/$f"
done
gh api "repos/stellio-hub/stellio-context-broker/contents/.env?ref=$REF" --jq .content | base64 -d > compose/stellio/stellio.env
```

(`.env` は `.gitignore` の対象のため、`stellio.env` という名前で置く。)

`compose/stellio/stellio.env` の末尾に、ポートを `127.0.0.1` にだけ公開する設定を追記する(upstream の compose は `"${API_GATEWAY_PORT:-8080}:8080"` の形でポートを公開するため、変数に `127.0.0.1:` を含めると、公開先が限定される):

```env

# --- このリポジトリでの変更: ポートを 127.0.0.1 にだけ公開する ---
API_GATEWAY_PORT=127.0.0.1:8080
# デモで使うのは API ゲートウェイ(8080)だけ。ほかは、手元の PostgreSQL などと衝突しにくい番号にする。
SEARCH_SERVICE_PORT=127.0.0.1:18083
SUBSCRIPTION_SERVICE_PORT=127.0.0.1:18084
POSTGRES_PORT=127.0.0.1:55432
KAFKA_PORT=127.0.0.1:39092

# upstream の .env にない変数(未設定だと compose が警告を出す)。認証は無効なので空でよい。
APPLICATION_TENANTS_0_CLIENTID=
APPLICATION_TENANTS_0_CLIENTSECRET=
```

`compose/NOTICE.md`:

```markdown
# compose/stellio/ について

`compose/stellio/` の3つのファイルは、Stellio Context Broker(https://github.com/stellio-hub/stellio-context-broker)
のタグ 2.37.0 の `docker-compose.yml`、`docker-compose-dependencies.yml`、`.env` です(Apache License 2.0)。
変更点は、`stellio.env` の末尾に、ポートを 127.0.0.1 にだけ公開する設定を追記したことです。
`stellio.env` のパスワードは、Stellio が公開している既定値です(ローカルでの実行専用)。
```

- [ ] **Step 2: Mosquitto と context 配信の設定を書く**

`compose/mosquitto/mosquitto.conf`:

```
listener 1883
protocol mqtt

listener 9001
protocol websockets

# ローカルでの実行専用。ポートは 127.0.0.1 にだけ公開する(docker-compose.yml)。
allow_anonymous true
```

`compose/context/weather.jsonld`:

```json
{
  "@context": {
    "@vocab": "https://uri.fiware.org/ns/data-models#"
  }
}
```

`compose/context/nginx.conf`:

```
server {
  listen 80;
  location / {
    root /usr/share/nginx/html;
    default_type application/ld+json;
    add_header Access-Control-Allow-Origin *;
  }
}
```

- [ ] **Step 3: デモ用の compose を書く**

`compose/docker-compose.yml`:

```yaml
# 使い方(リポジトリのルートから): docker compose -f compose/docker-compose.yml up -d
# Stellio は、初回の起動で一部のサービスが終了することがある。その場合は、同じコマンドをもう一度実行する。
include:
  - path: ./stellio/docker-compose.yml
    env_file: ./stellio/stellio.env

services:
  mosquitto:
    image: eclipse-mosquitto:2
    volumes:
      - ./mosquitto/mosquitto.conf:/mosquitto/config/mosquitto.conf:ro
    ports:
      - "127.0.0.1:1883:1883"
      - "127.0.0.1:9001:9001"

  # Stellio は、@context を URL でしか受け付けない。コンテナの中から http://context/weather.jsonld で取れるようにする。
  context:
    image: nginx:1.27-alpine
    volumes:
      - ./context/weather.jsonld:/usr/share/nginx/html/weather.jsonld:ro
      - ./context/nginx.conf:/etc/nginx/conf.d/default.conf:ro
    ports:
      - "127.0.0.1:8081:80"
```

- [ ] **Step 4: 設定を検証し、起動する**

```bash
docker compose -f compose/docker-compose.yml config -q && echo OK
docker compose -f compose/docker-compose.yml config | grep -E "published|host_ip" | sort -u
```

期待: `OK`。公開されているポートが、すべて `127.0.0.1`(`host_ip: 127.0.0.1`)になっている。`0.0.0.0` が出る場合は、`stellio.env` の追記が効いていない。(計画のレビューでは、`include` の `env_file` は、入れ子の compose にも効くことを確認済み。)

```bash
docker compose -f compose/docker-compose.yml up -d
sleep 60
docker compose -f compose/docker-compose.yml ps
```

期待: `stellio-search-service`、`stellio-subscription-service` が終了している場合は、もう一度 `up -d` を実行して復旧させる。最終的に、Stellio の4サービス、Mosquitto、context が `running` になる。

- [ ] **Step 5: 動作を確認する**

```bash
curl -s -o /dev/null -w "context: %{http_code} %{content_type}\n" http://127.0.0.1:8081/weather.jsonld
curl -s -o /dev/null -w "stellio: %{http_code}\n" -H 'Link: <http://context/weather.jsonld>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"' 'http://localhost:8080/ngsi-ld/v1/entities?type=WeatherObserved'
node -e "
import('mqtt').then(({ default: mqtt }) => {
  const c = mqtt.connect('ws://127.0.0.1:9001');
  c.on('connect', () => { console.log('mqtt websocket: connected'); c.end(); });
  c.on('error', (e) => { console.error('mqtt websocket:', e.message); process.exit(1); });
});
"
```

期待: `context: 200 application/ld+json`、`stellio: 200`(`[]` が返る)、`mqtt websocket: connected`。

- [ ] **Step 6: コミットする**

```bash
git add compose
git commit -m "feat: Stellio、Mosquitto、context 配信の docker-compose を追加"
```

注: `stellio.env` のパスワードが、シークレットのスキャンに検出される場合は、公開されている既定値であることを PR に書き、Geolonia の手順に従って許可を申請する。検出を無効にして済ませない。

### Task 9: スモークテストと Stellio の限界の測定、README

**Files:**
- Create: `scripts/smoke/analyze.mjs`、`scripts/smoke/smoke.mjs`、`test/analyze.test.mjs`
- Modify: `scripts/replayer/config.mjs`(既定の `interval`)、`README.md`

**Interfaces:**
- Consumes: Task 6〜8 のすべて。
- Produces:
  - `analyze.mjs`: `percentile(sorted: number[], p: number) → number`(最近傍法)、`latencyStats(ms: number[]) → { count, median, p95, max }`、`coverage(sentKeys: Set<string>, receivedKeys: Set<string>) → { missing: string[] }`、`notificationKeys(message: object) → { key: string, sentAt: string }[]`(`{"body":…}` の封筒にも、封筒のない形にも対応する)。
  - `smoke.mjs`: 再生と購読の突き合わせを行い、欠落、遅延、条件付き購読の件数を表示する。欠落があれば、終了コードを 1 にする。

- [ ] **Step 1: 失敗するテストを書く(突き合わせの純関数)**

`test/analyze.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { percentile, latencyStats, coverage, notificationKeys } from '../scripts/smoke/analyze.mjs';

test('percentile: 最近傍法', () => {
  const v = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  assert.equal(percentile(v, 50), 50);
  assert.equal(percentile(v, 95), 100);
  assert.equal(percentile(v, 0), 10);
});

test('latencyStats: 件数、中央値、p95、最大', () => {
  assert.deepEqual(latencyStats([30, 10, 20]), { count: 3, median: 20, p95: 30, max: 30 });
  assert.deepEqual(latencyStats([]), { count: 0, median: null, p95: null, max: null });
});

test('coverage: 送った書き込みのうち、通知に現れなかったものを返す', () => {
  const r = coverage(new Set(['a|1', 'b|2', 'c|3']), new Set(['a|1', 'c|3', 'x|9']));
  assert.deepEqual(r.missing, ['b|2']);
});

const entity = (id, sentAt) => ({ id, type: 'WeatherObserved', sentAt: { type: 'Property', value: { '@type': 'DateTime', '@value': sentAt } } });

test('notificationKeys: 封筒(body)つきの通知から、(ID, sentAt)を取り出す', () => {
  const msg = { body: { type: 'Notification', data: [entity('urn:a', '2026-10-05T00:00:00.001Z')] }, metadata: {} };
  assert.deepEqual(notificationKeys(msg), [{ key: 'urn:a|2026-10-05T00:00:00.001Z', sentAt: '2026-10-05T00:00:00.001Z' }]);
});

test('notificationKeys: 封筒のない通知にも対応し、値が文字列の sentAt も読む', () => {
  const msg = { type: 'Notification', data: [{ id: 'urn:b', sentAt: { type: 'Property', value: '2026-10-05T00:00:01.000Z' } }] };
  assert.deepEqual(notificationKeys(msg), [{ key: 'urn:b|2026-10-05T00:00:01.000Z', sentAt: '2026-10-05T00:00:01.000Z' }]);
});

test('notificationKeys: sentAt のないエンティティは除く', () => {
  assert.deepEqual(notificationKeys({ body: { data: [{ id: 'urn:c' }] } }), []);
});
```

- [ ] **Step 2: 失敗を確認し、実装する**

`scripts/smoke/analyze.mjs`:

```js
export function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1];
}

export function latencyStats(values) {
  const v = [...values].sort((a, b) => a - b);
  if (v.length === 0) return { count: 0, median: null, p95: null, max: null };
  return { count: v.length, median: percentile(v, 50), p95: percentile(v, 95), max: v.at(-1) };
}

export function coverage(sentKeys, receivedKeys) {
  return { missing: [...sentKeys].filter((k) => !receivedKeys.has(k)) };
}

// 通知のメッセージから、(エンティティ ID, sentAt)の組を取り出す。
// ブローカーによって、通知が {"body":{…},"metadata":{…}} の封筒に入っている場合と、そうでない場合がある。
export function notificationKeys(message) {
  const n = message.body ?? message;
  const out = [];
  for (const e of n.data ?? []) {
    const raw = e.sentAt?.value;
    const sentAt = typeof raw === 'string' ? raw : raw?.['@value'];
    if (sentAt) out.push({ key: `${e.id}|${sentAt}`, sentAt });
  }
  return out;
}
```

```bash
npm test
```

期待: `analyze.test.mjs` の6件を含め、すべて PASS。

- [ ] **Step 3: スモークテストのスクリプトを書く**

`scripts/smoke/smoke.mjs`:

```js
// 使い方: npm run smoke -- [--interval MS] [--from ISO] [--to ISO]
// setup と replay を実行しながら MQTT を購読し、(ID, sentAt)で突き合わせる。
// 出力: 欠落の件数、配信の遅延(中央値、p95、最大)、前半と後半の遅延(滞留の兆候)、条件付き購読の件数。
import { spawn } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import mqtt from 'mqtt';
import { coverage, latencyStats, notificationKeys } from './analyze.mjs';

const args = process.argv.slice(2);
const mqttUrl = process.env.SMOKE_MQTT_WS ?? 'ws://127.0.0.1:9001';
const logPath = join(mkdtempSync(join(tmpdir(), 'smoke-')), 'replay.jsonl');

const received = { live: new Map(), ge5: new Map(), ge3: new Map() }; // key -> 受信時刻(最初のもの)
const topicOf = (t) => (t === 'amedas/live' ? 'live' : t.endsWith('ge5') ? 'ge5' : t.endsWith('ge3') ? 'ge3' : null);

const client = mqtt.connect(mqttUrl);
await new Promise((res, rej) => {
  client.on('connect', res);
  client.on('error', rej);
});
client.subscribe(['amedas/live', 'amedas/cond/#']);
client.on('message', (topic, payload) => {
  const bucket = received[topicOf(topic)];
  if (!bucket) return;
  const now = Date.now();
  for (const { key } of notificationKeys(JSON.parse(payload.toString()))) if (!bucket.has(key)) bucket.set(key, now);
});

const run = (script, extra = []) =>
  new Promise((resolve) => {
    const p = spawn('node', [script, ...args, ...extra], { stdio: 'inherit' });
    p.on('exit', (code) => resolve(code));
  });

if ((await run('scripts/replayer/setup.mjs')) !== 0) process.exit(2);
const replayCode = await run('scripts/replayer/replay.mjs', ['--log', logPath]);

// 通知が出そろうまで待つ(最後の通知から 15 秒、新しい通知がなくなるまで。最長 10 分)
let lastCount = -1;
let quietSince = Date.now();
const deadline = Date.now() + 10 * 60 * 1000;
while (Date.now() < deadline) {
  const n = received.live.size + received.ge5.size + received.ge3.size;
  if (n !== lastCount) {
    lastCount = n;
    quietSince = Date.now();
  } else if (Date.now() - quietSince > 15000) break;
  await new Promise((r) => setTimeout(r, 1000));
}
client.end();

const sent = readFileSync(logPath, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((r) => r.status >= 200 && r.status < 300);
const sentKeys = new Set(sent.map((r) => `${r.id}|${r.sentAt}`));
const { missing } = coverage(sentKeys, new Set(received.live.keys()));

const latencies = sent.map((r) => ({ at: Date.parse(r.sentAt), ms: received.live.get(`${r.id}|${r.sentAt}`) - Date.parse(r.sentAt) })).filter((x) => Number.isFinite(x.ms));
const q = Math.floor(latencies.length / 4);
const first = latencyStats(latencies.slice(0, q).map((x) => x.ms));
const last = latencyStats(latencies.slice(-q).map((x) => x.ms));
const all = latencyStats(latencies.map((x) => x.ms));

console.log('--- 結果 ---');
console.log(`書き込み(成功): ${sent.length} 件、通知に現れなかったもの: ${missing.length} 件`);
console.log(`遅延 ms: 中央値 ${all.median}、p95 ${all.p95}、最大 ${all.max}`);
console.log(`遅延の中央値 ms: 最初の4分の1 ${first.median}、最後の4分の1 ${last.median}(後半が大きく増えていれば、通知が滞留している)`);
console.log(`条件付き購読の件数: 5cm 以上 ${received.ge5.size} 件、3cm 以上 ${received.ge3.size} 件`);
if (missing.length > 0) console.log('欠落の例:', missing.slice(0, 5));
process.exit(missing.length > 0 || replayCode !== 0 ? 1 : 0);
```

- [ ] **Step 4: 構文を確認する**

```bash
node --check scripts/smoke/smoke.mjs && echo OK
```

期待: `OK`。

- [ ] **Step 5: 小さな範囲で、仕組みが動くことを確認する**

compose が起動している状態(Task 8)で、条件付き購読のヒットを含む範囲を、ゆっくりした速度で再生する:

```bash
npm run smoke -- --from 2025-11-18T15:00:00+09:00 --to 2025-11-18T15:30:00+09:00 --interval 5000
```

期待:
- 通知に現れなかったものが 0 件。
- 条件付き購読の件数: この範囲には、手稲区の 11/18 15:00(5cm/h)が含まれるため、5cm 以上が 1 件、3cm 以上が 1 件以上。
- 欠落がある、または件数が合わない場合は、次を順に疑う: (1) 通知のエンベロープ(`notificationKeys` が `sentAt` を読めているか。受信した生のメッセージを1件、`console.log` して確認する)、(2) `sentAt` が通知に含まれない(購読の `notification.attributes` の指定が必要か)、(3) 購読の `watchedAttributes` や `q`。原因を特定してから、`payload.mjs` と `analyze.mjs` を直し、テストを足す。

- [ ] **Step 6: Stellio で、通知が遅れない速度を測る**

計画のレビューで、**既定の 4,000ms/ステップはもちろん、5,000ms/ステップでも通知が大きく滞留した**(4〜6ステップの再生で、遅延の p95 が 90〜135 秒、後半の遅延が前半の約5倍)。Stellio は、書き込みの属性ごとに購読を評価するため、1ステップ(10区×約7属性=約70イベント)の処理に、数秒〜数十秒かかるとみられる。測定は、負荷を減らす手段を先に試し、そのあとで速度を探す。

まず、1回の測定を、12ステップ(正時の降雪量と、通常の書き込みの両方を含む範囲)にする。滞留が起きていれば、これで十分に見える。測定の前に、毎回、通知の滞留を流し切る(`docker compose -f compose/docker-compose.yml restart stellio-subscription-service` のあと、1分待つ)。

```bash
RANGE="--from 2025-11-18T12:00:00+09:00 --to 2025-11-18T13:50:00+09:00"
# (a) 負荷を減らす: 前回と同じ値の属性を書かない
for i in 20000 10000 5000 3000; do
  echo "=== changed-only interval ${i}ms"
  npm run smoke -- $RANGE --changed-only --interval $i 2>&1 | tail -8
done
# (b) 全属性を書く
for i in 30000 20000 10000; do
  echo "=== all-attributes interval ${i}ms"
  npm run smoke -- $RANGE --interval $i 2>&1 | tail -8
done
```

判定の基準(設計書 4.4): 欠落が 0 件、p95 の遅延が 2,000ms 以下、最後の4分の1の遅延の中央値が、最初の4分の1の2倍(と500ms)以内。基準を満たす最小の `--interval` と、そのときの組み合わせ(`--changed-only` の有無)を、「遅れが出ない速度」とする。

結果を、次の表にして記録する(測定の環境、Mac の機種と Docker に割り当てたメモリも)。

| 組み合わせ | interval | 欠落 | 遅延の中央値 / p95 / 最大 | 最初の1/4 → 最後の1/4 | 判定 |
|---|---|---|---|---|---|

**基準を満たす速度が、実用的でない場合は、作業を止めて、測定結果をユーザーに報告する。** 実用的でないとは、既定の範囲(128ステップ)の再生に 30 分以上かかる、つまり `--interval` が約 14,000ms を超える場合を指す。この場合の選択肢は次のとおり(どれにするかは、ユーザーが決める)。
1. 書き込む属性を、地図に必要なものだけに減らす(気温、積雪深、降雪量)。
2. 公開側の README では「Stellio では、速度を落として再生する(約 N 倍速)。発表では、別のブローカーを使う」と説明する。
3. 公開側の動作確認の対象を、Stellio 以外の OSS ブローカーにも広げる(ただし、時間の制約がある)。
4. 成功基準 2(OSS のブローカーで再現できる)を、「動作する(速度は落とす)」という表現に改める。

- [ ] **Step 7: 既定の速度を更新する**

`scripts/replayer/config.mjs` の `interval` の既定値を、Step 6 の結果に更新する(コメントに測定日と環境を書く)。`test/config.test.mjs` は `DEFAULTS.interval` を参照しているため、そのまま通る。

```bash
npm test
```

- [ ] **Step 8: README を仕上げる**

`README.md` の「作業中です」の注記を、次の構成に置き換える(測定した値を入れる):

````markdown
## 動かし方(OSS のブローカー Stellio で再現する)

必要なもの: Docker、Node.js 22 以上、メモリに約 2GB の余裕。

```bash
npm ci
npm run build:data    # 札幌市と国土数値情報から data/ を作る(作成済みのものがコミットされています)

docker compose -f compose/docker-compose.yml up -d
# Stellio は、初回の起動で一部のサービスが終了することがあります。その場合は、同じコマンドをもう一度実行します。
docker compose -f compose/docker-compose.yml ps    # すべて running になるまで待つ

npm run setup         # エンティティと購読を作る
npm run replay        # 2025-11-18 の1日を、<測定した値>ms/ステップ で再生する(測定前の暫定値は 4000ms。Stellio では滞留するため、Task 9 で測った値に置き換える)
```

通知は、MQTT のトピック `amedas/live`、`amedas/cond/snowfall1h_ge5`、`amedas/cond/snowfall1h_ge3` に届きます
(`ws://127.0.0.1:9001` から、MQTT の WebSocket で購読できます)。

### 再生の速度

Stellio は、書き込みの属性ごとに購読を評価するため、速く書き込みすぎると通知が滞留します。
<測定した結果と環境を1〜2文で書く>。`--interval` で変えられます。

### 別のブローカーで動かすとき

次の環境変数(または引数)で、接続先を変えます。

| 環境変数 | 既定値(Stellio の compose 用) | 内容 |
|---|---|---|
| `BROKER_URL` | `http://localhost:8080` | ブローカーの URL(`/ngsi-ld/v1` の手前まで) |
| `TENANT` | なし | `NGSILD-Tenant` ヘッダーの値 |
| `CONTEXT` | `http://context/weather.jsonld` | `@context` の URL(ブローカーから見える URL) |
| `MQTT_URI_BASE` | `mqtt://mosquitto:1883` | ブローカーから見た MQTT の宛先 |
| `MQTT_VERSION` | `mqtt5.0` | 購読の `notifierInfo` に書く MQTT のバージョン |

通知の形式は、ブローカーによって異なります(ETSI の MQTT バインディングは `{"body":…,"metadata":…}` の封筒)。
````

- [ ] **Step 9: 確認して、コミットする**

```bash
npm test
git add scripts test README.md
git commit -m "feat: スモークテストと Stellio での再生速度の測定、README の動かし方を追加"
```

- [ ] **Step 10: Issue #2 に記録する内容の下書きを作り、ユーザーに確認する(投稿はユーザーの承認後)**

設計書 8 章の「応募概要との差分」を、次の内容で下書きにして、ユーザーに見せる:
- 応募概要(確定版)にあった「Temporal API による蓄積」「恵庭島松」は、実装では使わない(札幌市10区のみ。再生は、ブローカーへの逐次の書き込みと、購読通知で行う)。
- 理由: 発表の主題が「ブローカーの購読通知によるリアルタイム配信」であるため。
- Stellio での再生速度の測定結果。

承認を得てから、`gh issue comment 2 --body-file <下書き>` で投稿する(コメントは外に出る)。

### レビューゲート C(工程2)

- [ ] **Step 11:** サブエージェントに、この工程のレビューを依頼する(`git diff main...HEAD`、設計書の 4 章、測定結果を渡す)。観点: (1) 逐次書き込み、再生時刻の計算、失敗時の挙動、(2) `setup` が他のデータを消さないこと、(3) Stellio との互換性(`@context`、購読、MQTT の形式)、(4) 測定の方法と結論、(5) README の手順が、きれいな環境で通るか(`docker compose down -v` から手順どおりに実行させる)、(6) 公開されて困るものが入っていないか。指摘を直したら、PR を作る(PR の本文には、設計書と、この計画へのリンク、測定結果を書く)。計画B(地図アプリ)は、このあとで書く。

---

## 自己レビュー(計画の作成者による)

**設計書との対応(工程0〜2の範囲)**

| 設計書 | タスク |
|---|---|
| 1.5 不変条件(逐次、公開リポジトリの内容) | Task 1(`.gitignore`)、Task 6(逐次の実行ループ、テスト)、レビューゲート A〜C |
| 2.3 リポジトリ構成 | ファイル構成の表、Task 1〜9 |
| 3.1〜3.3 入力・変換・出力 | Task 4、5 |
| 3.4 モデル(属性、ID の表) | Task 2(`WARDS`)、Task 6(`payload.mjs`) |
| 3.5 観測地点と区の境界 | Task 2、3 |
| 3.6 検証(件数、欠測) | Task 4、5(`data.test.mjs`) |
| 4.2 `setup` | Task 6(`buildSubscriptions`)、Task 7 |
| 4.3 `replay` | Task 6(`config`、`schedule`、`run`)、Task 7 |
| 4.4 compose、Stellio の速度 | Task 8、9 |
| 4.6 検証(単体、スモーク) | Task 6、9 |
| 6.2 公開前のチェック、6.3 ライセンスと出典 | Task 1、5 |
| 7 工程0〜2 | Task 1〜9 |
| 5 章(地図アプリ)、6.4 README の仕上げ、`live-widget` | 計画B |

**型と名前の整合:** `OBS_KEYS`(Task 4)は `planWrite`、`carryForward`(Task 6)で使う。`entityId`(Task 6)は `setup.mjs`、`replay.mjs`(Task 7)で使う。`DEFAULTS.interval`(Task 6)は Task 9 で更新する。`ok`(Task 7)は `setup.mjs`、`replay.mjs` で使う。`notificationKeys` のキーの形式(`<id>|<sentAt>`)は、`replay.mjs` のログ(`id`、`sentAt`)と `smoke.mjs` で一致している。

**既知の未確定事項(実装中に確認し、結果を設計書に反映する)**
- 北区の観測点(Task 3)。確認できなければ、ユーザーに相談する。
- Stellio が ETSI のコア context をネットワークから取得するか(Task 8、9。取得する場合は、README に「初回の実行にはネットワークが必要」と書くか、context 配信に写しを置く)。
- `sentAt` の DateTime 形式が Stellio の通知に含まれるか(Task 9 Step 5)。
- Stellio で通知が遅れない `--interval` の値(Task 9 Step 6)。
