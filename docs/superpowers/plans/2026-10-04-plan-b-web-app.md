# 札幌積雪タイムラプス 実装計画B(工程3〜4: 地図アプリ、当日の最新値、通しの確認)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** NGSI-LD ブローカーの購読通知(MQTT)を受けて、札幌市10区の積雪を、タイルなしのダークな地図に「いま配信されている」演出つきで表示する Web アプリ(`web/`)を作り、当日の最新値(気象庁)と、本番の構成での通しの確認までを終える。

**Architecture:** Vite でビルドする素の JavaScript の静的アプリ。通知の正規化、重複排除、区の値、統計、色、強さ、気象庁の JSON の読み取りは、DOM を使わない純関数(`web/src/lib/`)にして `node:test` でテストする。画面の部品(地図、ラベル、パネル、演出)は小さなモジュールにし、`lib/hub.js` のイベント(`live`、`conditional`、`hit`、`tick`、`layout`)で main.js からつなぐ。次点・余裕の演出は `install〜(app)` の1行で足し、その行を消せば外せる。

**Tech Stack:** Node.js 22.13 以上(開発環境は 24)、Vite 8.3.2、MapLibre GL JS 6.12.0、mqtt.js 5.16.0(ブラウザー版を Vite でバンドル)、ESLint 10.12.0(flat config、`@eslint/js` 10.0.1、`globals` 17.13.0)、`node:test`、Playwright MCP(画面の確認。手動)。バージョンは 2026-10-04 に `npm view` で確認した最新版。

**Spec:** `docs/superpowers/specs/2026-10-04-sapporo-snow-timelapse-design.md`(以下「設計書」)。工程2の実測は `docs/superpowers/plans/2026-10-04-plan-b-inputs-from-stage2.md`(以下「申し送り」)。形式と粒度は計画A(`docs/superpowers/plans/2026-10-04-plan-a-foundation-data-replay.md`)に合わせる。

## Global Constraints

- 地図アプリは `web/` に置く。Vite(素の JavaScript)。フレームワークと TypeScript は使わない。ESM。
- 地図のタイルは使わない(MapLibre の background と GeoJSON で描画し、外部通信なしで動作する)。ビルドしたものは、CDN もフォントの取得もなしに動く(MapLibre の文字 `text-field` はグリフを外部から取るため使わない。文字は DOM で描く)。外部へ通信するのは、当日の最新値(気象庁)だけ。
- MQTT の WebSocket の URL は URL パラメーター `?mqtt=` で渡す(既定は `ws://127.0.0.1:9001`)。トピックは `amedas/live` と `amedas/cond/#`、QoS 0。`?debug` で受信ログを残す。
- 通知は `msg.body ?? msg` で、封筒あり(Stellio)となしの両方を受ける。`data` は配列として扱う。想定外の形は例外にせず無視する。
- 観測時刻は `dateObserved` を使う。属性の `observedAt` から求めない。`snowfall1h` は、`snowfall1h.observedAt` が `dateObserved` と一致するときだけ新しい値として扱う(申し送り 5節)。
- 条件ヒットの重複排除は、窓の長さではなく、書き込みの識別子(区と観測時刻)で集約する。強い購読があとから届いたら弱い方を置き換え、弱い購読があとなら無視する。live の通知では条件の演出を出さない。演出は届いた順に出す(設計書 5.3、申し送り 7節)。
- 配信の遅延は `受信時刻 − sentAt`(ブローカーと地図アプリが同じ機であることが前提)。p95 の定義は `scripts/smoke/analyze.mjs` の `percentile` と同じにする。
- 面の色の刻みは 0、5、15、25、35cm(暗い青から白への連続色)。札幌市であることをタイトルに明示する。出典(札幌市 CC BY 4.0、国土数値情報、国土地理院)を画面に常時表示する。
- 雪の粒の描画解像度は `min(devicePixelRatio, 1.5)`。気温が 3℃ を超える区では降らせない。
- 当日の最新値は気象庁アメダス「札幌」(14163)。取得に失敗したら、出典の表示も含めて出さない。主画面の動作に影響させない。積雪は冬季の観測が再開してから形を確かめる(それまでは気温と風)。
- 純関数(`web/src/lib/`)は DOM、`Date.now()`、`performance`、タイマーに依存しない(時刻は引数で受ける)。テストは `test/web/*.test.mjs`(`npm test` の glob に入る)。テストでタイマーを残さない(Node 22 でプロセスが終わらない、または失敗する)。Node 22 と 24 の両方で通す。
- 地図アプリから `scripts/`(Node のスクリプト)を import しない。テストと `scripts/` の側から、地図アプリの純関数を使うのはよい。
- 公開リポジトリには、特定のブローカー製品の内部情報、ソース、SDK、調査レポート、`.env`、認証情報、試作のコード・データ・スクリーンショットを入れない。発表当日のブローカーは「環境変数と URL で指定する別のブローカー」としてだけ扱い、製品固有のコードの分岐を作らない。スクリーンショットはリポジトリに入れない(`.playwright-mcp/` は gitignore 済み。保存したら、リポジトリの外へ移す)。
- 開発サーバーとプレビューは `127.0.0.1` だけで待ち受ける。
- コードは MIT。コミットメッセージは日本語。作業は `feat/web-app` で行い、`main` へ直接コミットしない。
- 優先度(設計書 7.1): 必須 = 面表示、2つの時計、HUD(配信の遅延)、通常の波紋、条件ヒット(強い波紋、ラベル、ヒット欄)。次点 = 通知ログ、ダーク背景の仕上げ、当日の最新値。余裕があれば = 雪の粒、円表示、音。時間が足りなければ、下から削る(Task 16〜18 は、それぞれ単独で外せる)。

## Review Focus

設計書が暗黙に求めているが、各タスクの主題になっていない入力と、期待される振る舞い。各行のテストは、担当するタスクの中に入れてある。

1. `amedas/` のトピックに、通知でないメッセージが届く(Mosquitto は匿名で publish できる。JSON でない、`data` がない、別の ID、値が数でない): 例外にせず、そのメッセージだけを無視する。画面は止まらない(Task 3 の「想定外の形は、例外にせず無視する」「値が数でない属性は null」)。
2. 封筒のないブローカーでは、同じ書き込みの ge3、ge5、live が順不同でほぼ同時に届く(live が先、弱い方が先も): 演出は1回だけ、表示は強い方になる。live は条件の演出を出さない(Task 4 の3つの順序のテスト、Task 8 の `--order weak-first` / `live-first`、Task 11 の画面の確認)。
3. リハーサルで `setup` をやり直し、前より早い観測時刻から再生する(setup の余分な通知も来る): 時計は戻った時刻に追従し、積雪の増分の履歴は捨て、通知レートは setup の1件で薄まらない(Task 5「時計は最後に受けた live の dateObserved」「時刻が戻ったら履歴を捨てる」、Task 6「setup の余分な通知のあと…」)。
4. `sentAt` や `dateObserved` を持たない通知(別のブローカーや別の書き込み): 件数とレートには入り、遅延には入らない。時計は進めない。HUD は「—」を出す(Task 3、Task 5「dateObserved のない通知は、時計を進めない」、Task 6「sentAt のない通知は…」)。
5. 会場のネットワークがない、気象庁の JSON の形が変わる(積雪の値が `[null, 5]` のような品質つきで入っている): ウィジェットも出典も出さず、例外も出さない。主画面は影響を受けない(Task 14 の「どの失敗でも null」「品質が 0 でない値と、壊れた値は使わない」と、`?live=off` の確認)。

---

## ファイル構成

| パス | 役割 | タスク |
|---|---|---|
| `package.json`、`package-lock.json` | `web:dev`、`web:build`、`web:preview`、`lint`、`fake-notify` のスクリプト、依存の追加 | 1、8 |
| `eslint.config.js` | ESLint(flat config)。`scripts/`、`test/`、`web/` | 1 |
| `.github/workflows/test.yml` | lint、単体テスト、地図アプリのビルド(Node 22 と 24) | 1 |
| `web/vite.config.js` | Vite の設定(root は `web/`、出力は `dist/web/`) | 1 |
| `web/index.html` | 画面の骨組み(タイトル、時計、HUD、ヒット欄、凡例、出典) | 1 |
| `web/src/style.css` | 画面のスタイル(タスクごとに節を足す) | 1、11、12、14、16 |
| `web/src/main.js` | 入口。受信 → 正規化 → 区の値と統計 → 演出 | 1、9、10、11〜18 |
| `web/src/lib/config.js` | URL パラメーターの解釈 | 2 |
| `web/src/lib/format.js` | 時刻(JST)と値の表示用の文字列、欠測の「—」 | 2 |
| `web/src/lib/notification.js` | 通知の正規化(封筒の有無、DateTime の形、`snowfall1h` の規則、値の古さ) | 3 |
| `web/src/lib/dedupe.js` | 条件ヒットの重複排除 | 4 |
| `web/src/lib/store.js` | 区ごとの最新値、観測時刻の時計、積雪深の1時間の増分 | 5 |
| `web/src/lib/stats.js` | 通知レート、遅延の中央値・p95・最大、条件付き購読の件数 | 6 |
| `web/src/lib/color.js` | 面の色、凡例、ラベルのコントラスト | 7 |
| `web/src/lib/hub.js` | 演出をつなぐイベント | 9 |
| `web/src/lib/intensity.js` | 雪の粒の強さ、描画の倍率 | 16 |
| `web/src/lib/jma.js` | 気象庁の JSON の取得と読み取り | 14 |
| `web/src/map-layer.js` | MapLibre の地図(面、境界、観測点) | 9、13 |
| `web/src/labels.js` | 区のラベル(DOM) | 9 |
| `web/src/mqtt-feed.js` | MQTT の接続と購読 | 10 |
| `web/src/panels/clocks.js`、`hud.js`、`hits.js`、`log.js`、`controls.js` | パネル | 9〜12 |
| `web/src/effects/ripples.js`、`hit-effects.js` | 波紋と条件ヒット | 11 |
| `web/src/effects/snow.js`、`circle-view.js`、`sound.js` | 雪の粒、円表示、音 | 16〜18 |
| `web/src/live-widget.js` | 当日の最新値 | 14 |
| `scripts/fake-notify/messages.mjs`、`fake-notify.mjs` | ブローカーなしで、通知と同じ形のメッセージを流す(画面の確認用) | 8 |
| `scripts/smoke/compare-browser.mjs` | replay の送信ログと、ブラウザーの受信ログの突き合わせ | 19 |
| `test/web/*.test.mjs`、`test/web/helpers.mjs`、`test/web/fixtures/` | 地図アプリの単体テスト | 1〜7、9、14、16 |
| `test/fake-notify.test.mjs` | 試験用の通知の組み立て | 8 |
| `README.md` | 「地図アプリ」の節 | 1、15 |

区の境界(`data/wards.geojson`)と観測地点(`data/stations.json`)は、`web/src/main.js` から import する。`stations.json` は JSON としてバンドルに入り、`wards.geojson` は `?url` の import で、ビルドのときに `dist/web/assets/` へコピーされる(開発サーバーでは `/@fs/` から配信される。2026-10-04 に、開発サーバーとビルドの両方で、10区が読めることを確認した)。コピーの手作業やスクリプトは要らない。

地図アプリの画面の構成(DOM):

| 要素 | 位置 | 内容 |
|---|---|---|
| `#map` | 全面 | MapLibre(背景、区の面と境界、観測点) |
| `#snow`(Task 16) | 全面 | 雪の粒の canvas |
| `#fx` | 全面 | 区のラベル、波紋、ヒットのラベル(クリックは通す) |
| `#title` | 上中央 | 「札幌市10区の積雪」 |
| `#clocks` | 左上 | 観測時刻、現在時刻 |
| `#hud` | 左、時計の下 | 受信件数、通知レート、遅延、条件付き購読の件数、接続の状態 |
| `#side` | 右 | 条件ヒット欄(主役)、通知ログ(Task 12)、当日の最新値(Task 14) |
| `#controls`(Task 12) | 左下 | 切り替え(時計、HUD、波紋、ログ、雪の粒)、円表示、音 |
| `#legend` | 左下 | 積雪深の凡例 |
| `#attribution` | 下端 | 出典(常時表示。切り替えの対象にしない) |

---

## 工程3(必須): 地図アプリの中核

### Task 1: 下地(Vite、ESLint、npm のスクリプト、CI、画面の骨組み)

**Files:**
- Modify: `package.json`、`package-lock.json`、`.github/workflows/test.yml`、`README.md`(1行)
- Modify: `scripts/replayer/client.mjs:36`、`scripts/replayer/run.mjs:42`(ESLint の指摘)
- Create: `eslint.config.js`、`web/vite.config.js`、`web/index.html`、`web/src/style.css`、`web/src/main.js`
- Test: `test/web/page.test.mjs`

**Interfaces:**
- Produces: `npm run web:dev`(http://127.0.0.1:5173)、`npm run web:build`(`dist/web/`)、`npm run web:preview`(http://127.0.0.1:4173)、`npm run lint`。`web/index.html` の要素の ID(`#map`、`#fx`、`#title`、`#clocks`(`[data-clock="observed"]`、`[data-clock="wall"]`)、`#hud`(`[data-hud="total|rate|latency|latency-stats|ge5|ge3"]`、`data-status`)、`#side`、`#hits`、`#legend`(`.legend-bar`)、`#attribution`)。CSS の変数 `--label-bg: rgba(7, 13, 24, 0.72);`(Task 7 が値を照合する)。

- [ ] **Step 1: 依存を入れる(2026-10-04 に `npm view` で確認した版)**

```bash
cd "$(git rev-parse --show-toplevel)"
git status --short   # 何も出ないこと(feat/web-app にいること: git branch --show-current)
npm install -D vite@^8.3.2 maplibre-gl@^6.12.0 eslint@^10.12.0 @eslint/js@^10.0.1 globals@^17.13.0
```

`package.json` を次のようにする(`devDependencies` は npm が書いた形のまま。`engines` は、Vite 8 が `^20.19.0 || >=22.12.0`、ESLint 10 が `^22.13.0 || >=24` を求めるため、`>=22.13` に上げる):

```json
{
  "name": "sapporo-snow-timelapse",
  "version": "0.1.0",
  "private": true,
  "license": "MIT",
  "description": "札幌市10区の積雪を、NGSI-LD ブローカーの購読通知でタイムラプス表示するデモ",
  "type": "module",
  "engines": { "node": ">=22.13" },
  "scripts": {
    "test": "node --test \"test/**/*.test.mjs\"",
    "lint": "eslint .",
    "build:data": "node scripts/prepare/build.mjs",
    "setup": "node scripts/replayer/setup.mjs",
    "replay": "node scripts/replayer/replay.mjs",
    "smoke": "node scripts/smoke/smoke.mjs",
    "web:dev": "vite --config web/vite.config.js",
    "web:build": "vite build --config web/vite.config.js",
    "web:preview": "vite preview --config web/vite.config.js"
  },
  "devDependencies": {
    "@eslint/js": "^10.0.1",
    "eslint": "^10.12.0",
    "globals": "^17.13.0",
    "maplibre-gl": "^6.12.0",
    "mqtt": "^5.16.0",
    "vite": "^8.3.2"
  }
}
```

`README.md` の「必要なもの: Docker、Node.js 22 以上、…」の行を「必要なもの: Docker、Node.js 22.13 以上、…」に直す。

- [ ] **Step 2: 失敗するテストを書く(画面の骨組みの約束)**

`test/web/page.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync('web/index.html', 'utf8');
const attribution = /<footer id="attribution">([\s\S]*?)<\/footer>/.exec(html)?.[1] ?? '';

test('タイトルに札幌市と明示する(設計書 5.3)', () => {
  assert.match(/<title>([^<]*)<\/title>/.exec(html)?.[1] ?? '', /札幌市/);
  assert.match(/<h1>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? '', /札幌市/);
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
```

```bash
node --test test/web/page.test.mjs
```

期待: 4件とも FAIL(`ENOENT: no such file or directory, open 'web/index.html'`)。

- [ ] **Step 3: Vite の設定を書く**

`web/vite.config.js`:

```js
// 地図アプリ(web/)の Vite の設定。リポジトリのルートから npm run web:dev / web:build / web:preview で使う。
// - root は web/。ビルドの出力は dist/web/(gitignore 済みの dist/ の下)
// - base: './' … dist/web/ を、どのパスに置いても(file サーバーでも)動くようにする
// - worker.format: 'es' … MapLibre の Worker(ES モジュール)を、ビルドに含めるため(main.js の setWorkerUrl と対)
// - ポートは 127.0.0.1 だけで待ち受ける(会場の LAN に公開しない)
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  worker: { format: 'es' },
  build: {
    outDir: fileURLToPath(new URL('../dist/web', import.meta.url)),
    emptyOutDir: true,
    // MapLibre(約 1.3MB)を1つのファイルにまとめるため、警告の閾値を上げる(ローカルで配信するので分割しない)
    chunkSizeWarningLimit: 2000,
  },
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
});
```

`worker: { format: 'es' }` は、Task 9 の `maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url` と対になる。MapLibre 6 は既定で、`maplibre-gl.mjs` の隣の `maplibre-gl-worker.mjs` を探すが、バンドルしたあとはそのファイルがないため、地図が描かれない(2026-10-04 に確認)。

- [ ] **Step 4: 画面の骨組みを書く**

`web/index.html`:

```html
<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" href="data:," />
    <title>札幌市10区 積雪タイムラプス(NGSI-LD 購読通知のライブ配信)</title>
  </head>
  <body>
    <div id="map"></div>
    <div id="fx" aria-hidden="true"></div>

    <header id="title" class="panel">
      <h1>札幌市10区の積雪 <small>2025年11月の観測値を、いま配信しています</small></h1>
    </header>

    <section id="clocks" class="panel" aria-label="時計">
      <div class="clock">
        <div class="clock-label">観測時刻(データの時刻)</div>
        <div class="clock-value observed" data-clock="observed">—</div>
      </div>
      <div class="clock">
        <div class="clock-label">現在時刻</div>
        <div class="clock-value wall" data-clock="wall">—</div>
      </div>
    </section>

    <section id="hud" class="panel" aria-label="配信の状況" data-status="connecting">
      <div class="hud-row"><span><i class="dot"></i>NGSI-LD 通知(MQTT)</span><b data-hud="total">0</b></div>
      <div class="hud-row"><span>通知レート</span><span><b data-hud="rate">0</b> <small>件/分</small></span></div>
      <div class="hud-row"><span>配信の遅延(書き込み→受信)</span><span><b data-hud="latency">—</b> <small>ms</small></span></div>
      <div class="hud-row sub"><span>中央値 / p95 / 最大</span><small data-hud="latency-stats">— / — / —</small></div>
      <div class="hud-row hit"><span>条件付き購読の通知</span><small>5cm 以上 <b data-hud="ge5">0</b> ・ 3cm 以上 <b data-hud="ge3">0</b></small></div>
    </section>

    <aside id="side" class="panel" aria-label="通知">
      <h2>条件付き購読の通知(1時間降雪量)</h2>
      <ol id="hits"></ol>
    </aside>

    <section id="legend" class="panel" aria-label="凡例">
      <span>積雪深 0cm</span><i class="legend-bar"></i><span>35cm</span>
    </section>

    <footer id="attribution">
      観測値: 札幌市「札幌市内の気象観測記録(区別・年次別)」(CC BY 4.0)を加工して作成 ・
      区の境界: 「国土数値情報(行政区域データ)」(国土交通省)を加工して作成 ・
      観測地点の座標: 国土地理院ウェブサイトの住所検索の結果を加工して作成
    </footer>

    <script type="module" src="./src/main.js"></script>
  </body>
</html>
```

`web/src/style.css`(この節のあとに、Task 11、12、14、16 が節を足す):

```css
/* 地図アプリの画面。外部のフォントや画像は使わない(オフラインで動かすため)。 */
:root {
  --bg: #070d18;
  --panel: rgba(14, 22, 38, 0.86);
  --line: #2a3a58;
  --text: #e8f0fa;
  --dim: #8ea3c4;
  --accent: #7fd1ff;
  --hit3: #ffb020;
  --hit5: #ff3d7f;
  --label-bg: rgba(7, 13, 24, 0.72); /* color.js の LABEL_BG と同じ値 */
  --ok: #35e08a;
}

* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  height: 100%;
  overflow: hidden;
  background: var(--bg);
  color: var(--text);
  font-family: system-ui, -apple-system, 'Hiragino Sans', 'Noto Sans JP', sans-serif;
}

#map {
  position: absolute;
  inset: 0;
}

/* 区のラベル、波紋、ヒットのラベル(地図の上の DOM。クリックは地図に通す) */
#fx {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
  z-index: 3;
}

.panel {
  position: absolute;
  z-index: 5;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 10px 14px;
}

#title {
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  padding: 6px 18px;
}

#title h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  white-space: nowrap;
}

#title small {
  margin-left: 10px;
  font-size: 13px;
  font-weight: 400;
  color: var(--dim);
}

#clocks {
  top: 12px;
  left: 12px;
  min-width: 330px;
}

.clock + .clock {
  margin-top: 6px;
}

.clock-label {
  font-size: 12px;
  color: var(--dim);
  letter-spacing: 0.08em;
}

.clock-value {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}

.clock-value.observed {
  font-size: 28px;
  color: var(--accent);
}

.clock-value.wall {
  font-size: 20px;
}

#hud {
  top: 150px;
  left: 12px;
  min-width: 330px;
}

.hud-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  padding: 2px 0;
  font-size: 13px;
  color: var(--dim);
}

.hud-row b {
  font-size: 20px;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

.hud-row.sub {
  padding-left: 1em;
}

.hud-row.hit b {
  font-size: 15px;
  color: var(--hit5);
}

.dot {
  display: inline-block;
  width: 9px;
  height: 9px;
  margin-right: 6px;
  border-radius: 50%;
  background: #777;
}

#hud[data-status='connected'] .dot {
  background: var(--ok);
  box-shadow: 0 0 8px var(--ok);
  animation: pulse 1.2s infinite;
}

#hud[data-status='reconnecting'] .dot,
#hud[data-status='refused'] .dot {
  background: var(--hit3);
}

@keyframes pulse {
  50% {
    opacity: 0.35;
  }
}

#side {
  top: 12px;
  right: 12px;
  bottom: 40px;
  width: 400px;
  display: flex;
  flex-direction: column;
}

#side h2 {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--dim);
}

#hits {
  margin: 0 0 10px;
  padding: 0;
  list-style: none;
  min-height: 7em;
}

#hits li {
  padding: 3px 0;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

#hits li.ge3 {
  color: var(--hit3);
}

#hits li.ge5 {
  color: var(--hit5);
}

#hits li time {
  margin-right: 8px;
  font-size: 12px;
  color: var(--dim);
}

#legend {
  left: 12px;
  bottom: 40px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--dim);
  padding: 6px 12px;
}

.legend-bar {
  display: inline-block;
  width: 160px;
  height: 10px;
  border-radius: 3px;
}

/* 出典は、演出の切り替えに関係なく常に表示する */
#attribution {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 8px;
  z-index: 6;
  font-size: 11px;
  color: #8295b5;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 区のラベル。明るい区の上でも読めるよう、暗い半透明の背景を付ける(設計書 5.3) */
.ward-label {
  position: absolute;
  left: 0;
  top: 0;
  padding: 2px 8px;
  border-radius: 6px;
  background: var(--label-bg);
  text-align: center;
  white-space: nowrap;
  font-size: 12px;
  line-height: 1.25;
}

.ward-label b {
  display: block;
  font-size: 13px;
}

.ward-label .snow {
  color: var(--accent);
  font-variant-numeric: tabular-nums;
  margin-right: 6px;
}

.ward-label .temp {
  font-variant-numeric: tabular-nums;
}

.ward-label .t-cold {
  color: #9fd4ff;
}

.ward-label .t-near {
  color: #e8f0fa;
}

.ward-label .t-warm {
  color: #ffc58a;
}

.ward-label .t-none {
  color: var(--dim);
}
```

`web/src/main.js`(Task 9 で置き換える):

```js
// 地図アプリの入口(Task 1 の段階: 画面の骨組みだけ。地図は Task 9、受信は Task 10 でつなぐ)
import './style.css';
```

- [ ] **Step 5: テストが通ること、ビルドと表示を確認する**

```bash
node --test test/web/page.test.mjs
npm run web:build
ls dist/web dist/web/assets
```

期待: テストは 4件とも PASS。ビルドは `✓ built in …` で終わり、`dist/web/index.html` と `dist/web/assets/index-*.css`、`index-*.js` ができる。

```bash
npm run web:dev
```

Playwright MCP で `browser_navigate` → `http://127.0.0.1:5173/`、`browser_snapshot`。期待: 見出し「札幌市10区の積雪」、「観測時刻(データの時刻)」「現在時刻」の見出しと「—」、HUD の行、出典の文(札幌市、国土数値情報、国土地理院)が読める。確認したら止める。

`npm run web:dev` と `npm run web:preview` は、止めるまで端末を占有する。エージェントが実行するときは、バックグラウンドで起動し(Bash の `run_in_background`、または末尾に `&`)、確認が終わったら止める(`pkill -f "vite.*web/vite.config.js"`)。以降のタスクの「別の端末で」も同じ扱いにする。Playwright MCP が保存できるのはリポジトリの中だけなので、スクリーンショットや `browser_evaluate` の `filename` は `.playwright-mcp/`(gitignore 済み)に保存し、確認のあとでリポジトリの外へ移す(`browser_evaluate` の `filename` に保存されるのは、戻り値の JSON そのもの。2026-10-04 に確認)。

- [ ] **Step 6: ESLint を入れる**

`eslint.config.js`:

```js
import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/', 'dist/', 'data/', 'compose/'] },
  js.configs.recommended,
  {
    files: ['scripts/**/*.mjs', 'test/**/*.mjs', 'eslint.config.js', 'web/vite.config.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.node } },
  },
  {
    files: ['web/src/**/*.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.browser } },
  },
  {
    rules: {
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true }],
      'no-irregular-whitespace': ['error', { skipComments: true, skipRegExps: true, skipStrings: true, skipTemplates: true }],
    },
  },
];
```

緩めた規則と理由(最小限):
- `no-unused-vars` の `args: 'none'`: テストの差し替え関数(`async (ward) => …`)は、使わない引数も呼び出しの形を示すために書く。`ignoreRestSiblings`: `const { date, ...rest } = …` で、古い形のキーを捨てる書き方(`scripts/prepare/retrieved-at.mjs`)を許す。`caughtErrors: 'none'`: `catch (e)` で `e` を使わない書き方を許す。
- `no-irregular-whitespace` のコメント、文字列、正規表現を除外: CKAN の名称の全角スペース(コメント)と、BOM を取り除く正規表現(`/^﻿/` を文字で書いている)は、意図したもの。コードの空白は従来どおり検査する。

```bash
npm run lint
```

期待: 2件のエラー(どちらも `no-useless-assignment`):

```
scripts/replayer/client.mjs
  36:11  error  The value assigned to 'json' is not used in subsequent statements  no-useless-assignment
scripts/replayer/run.mjs
  42:11  error  The value assigned to 'ok' is not used in subsequent statements  no-useless-assignment
```

- [ ] **Step 7: 指摘の2か所を直す(動作は変わらない)**

`scripts/replayer/client.mjs` の36行目:

```js
      let json = null; // 読めなかったときは null(空配列と区別する)
```

を、次に置き換える(直後の try と catch の両方で代入している):

```js
      let json; // 読めなかったときは null(空配列と区別する)
```

`scripts/replayer/run.mjs` の42行目:

```js
      let ok = false;
```

を、次に置き換える(直後の try と catch の両方で代入している):

```js
      let ok;
```

```bash
npm run lint && npm test
```

期待: lint はエラーなしで終わる。`npm test` は全件 PASS(既存の 124 件と Step 2 の 4件)。

- [ ] **Step 8: CI に lint とビルドを足す**

`.github/workflows/test.yml` の `jobs.test` を、次の形にする(`uses:` の行のピン留め(SHA とコメント)は、いまの行をそのまま残す。書き換えない):

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [22, 24]
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0
        with:
          persist-credentials: false
      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
        with:
          node-version: ${{ matrix.node-version }}
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm test
      - run: npm run web:build
```

```bash
git diff .github/workflows/test.yml
```

期待: 差分は `strategy`、`node-version`、`npm run lint`、`npm run web:build` の行だけ。`uses:` の行は変わらない。

- [ ] **Step 9: コミット**

```bash
git add package.json package-lock.json eslint.config.js .github/workflows/test.yml README.md \
  scripts/replayer/client.mjs scripts/replayer/run.mjs web test/web/page.test.mjs
git commit -m "feat: 地図アプリの下地(Vite、ESLint、CI、画面の骨組み)を追加"
```

### Task 2: 設定と表示の書式(`config.js`、`format.js`)

**Files:**
- Create: `web/src/lib/config.js`、`web/src/lib/format.js`
- Test: `test/web/config-format.test.mjs`

**Interfaces:**
- Produces:
  - `readConfig(search: string) → { mqttUrl: string, debug: boolean, liveWidget: boolean, warnings: string[] }`、`DEFAULT_MQTT_URL = 'ws://127.0.0.1:9001'`
  - `formatJst(ms, { seconds = false }) → '2025-11-18 16:00 JST'`、`formatTimeOfDay(ms) → '23:32:09.342'`、`formatHourMinute(ms) → '07:00'`、`formatTemperature(v) → '-1.2℃' | '—'`、`formatSnowDepth(v) → '35cm' | '—'`、`formatMs(v) → '383' | '—'`、`temperatureClass(v) → 'cold' | 'near' | 'warm' | 'none'`、`MISSING = '—'`
  - 欠測の表示: 値が数でなければ「—」、気温の色は `'none'`(色を付けない)

- [ ] **Step 1: 失敗するテストを書く**

`test/web/config-format.test.mjs`:

```js
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
```

- [ ] **Step 2: テストを実行して失敗を確認する**

```bash
node --test test/web/config-format.test.mjs
```

期待: FAIL(`Cannot find module '…/web/src/lib/config.js'`)。

- [ ] **Step 3: 実装する**

`web/src/lib/config.js`:

```js
// 地図アプリの設定を、URL の検索文字列(location.search)から読む。
// ?mqtt=ws://host:port … MQTT の WebSocket(既定は ws://127.0.0.1:9001)
// ?debug               … 受信ログを残す(window.__sapporo.received)
// ?live=off            … 当日の最新値(気象庁)を取りに行かない
export const DEFAULT_MQTT_URL = 'ws://127.0.0.1:9001';

export function readConfig(search) {
  const params = new URLSearchParams(search);
  const warnings = [];
  let mqttUrl = DEFAULT_MQTT_URL;
  const raw = params.get('mqtt');
  if (raw !== null && raw !== '') {
    if (/^wss?:\/\/[^\s/]+/.test(raw)) mqttUrl = raw;
    else warnings.push(`mqtt の値が ws:// か wss:// で始まらないため、既定の ${DEFAULT_MQTT_URL} を使います: ${raw}`);
  }
  return {
    mqttUrl,
    debug: params.has('debug'),
    liveWidget: params.get('live') !== 'off',
    warnings,
  };
}
```

`web/src/lib/format.js`:

```js
// 表示用の文字列。時刻はすべて JST で表示する(実行する機のタイムゾーンに依存しない)。
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const jstIso = (ms) => new Date(ms + JST_OFFSET_MS).toISOString();

// 値がないときの表示
export const MISSING = '—';

// 2025-11-18 16:00 JST(seconds: true なら 2025-11-18 16:00:05 JST)
export function formatJst(ms, { seconds = false } = {}) {
  if (!Number.isFinite(ms)) return MISSING;
  const s = jstIso(ms);
  return `${s.slice(0, 10)} ${s.slice(11, seconds ? 19 : 16)} JST`;
}

// 受信時刻(ログとヒット欄): 16:00:05.123
export function formatTimeOfDay(ms) {
  if (!Number.isFinite(ms)) return MISSING;
  return jstIso(ms).slice(11, 23);
}

// 観測時刻の時:分(ヒット欄): 07:00
export function formatHourMinute(ms) {
  if (!Number.isFinite(ms)) return MISSING;
  return jstIso(ms).slice(11, 16);
}

// 気温: -1.2℃。欠測(null)は「—」
export function formatTemperature(v) {
  if (!Number.isFinite(v)) return MISSING;
  const r = Math.round(v * 10) / 10;
  return `${(Object.is(r, -0) ? 0 : r).toFixed(1)}℃`;
}

// 積雪深: 35cm。欠測(null)は「—」
export function formatSnowDepth(v) {
  return Number.isFinite(v) ? `${Math.round(v)}cm` : MISSING;
}

// ミリ秒の整数(HUD の遅延)。値がなければ「—」
export function formatMs(v) {
  return Number.isFinite(v) ? String(Math.round(v)) : MISSING;
}

// 気温の色分け(ラベルの文字色の CSS クラス)。欠測は 'none'(色を付けない)
export function temperatureClass(v) {
  if (!Number.isFinite(v)) return 'none';
  if (v <= 0) return 'cold';
  if (v <= 3) return 'near';
  return 'warm';
}
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
node --test test/web/config-format.test.mjs && npx -y node@22 --test test/web/config-format.test.mjs && npm run lint
```

期待: どちらの Node でも 9件とも PASS。lint のエラーなし。

- [ ] **Step 5: コミット**

```bash
git add web/src/lib/config.js web/src/lib/format.js test/web/config-format.test.mjs
git commit -m "feat: 地図アプリの設定(URL パラメーター)と、表示の書式(JST、欠測の「—」)を追加"
```

### Task 3: 通知の正規化(`notification.js`)

**Files:**
- Create: `web/src/lib/notification.js`
- Test: `test/web/notification.test.mjs`、`test/web/helpers.mjs`(後続のテストも使う)

**Interfaces:**
- Produces:
  - `normalizeMessage(topic, payload: string | Uint8Array, receivedAt: number, wardIds?: Set<string>) → Observation[]`
  - `Observation = { kind: 'live' | 'ge5' | 'ge3', ward: string, receivedAt: number, sentAt: number | null, dateObserved: number | null, attrs: { temperature, snowHeight, snowfall1h, windSpeed, windDirection, precipitation } }`(各属性は `{ value: number, observedAt: number | null } | null`。時刻はすべてエポックミリ秒)
  - `kindOfTopic(topic)`、`readDateTime(prop) → number | null`、`wardOfEntityId(id) → string | null`、`parsePayload(payload) → any | null`
  - `isNewSnowfall(obs) → boolean`(`snowfall1h.observedAt === dateObserved`)、`freshValue(attr, dateObserved, maxAgeMs = FRESH_MS) → number | null`、`FRESH_MS = 3600000`
  - `TOPIC_LIVE`、`TOPIC_GE5`、`TOPIC_GE3`、`SUBSCRIBE_TOPICS = ['amedas/live', 'amedas/cond/#']`、`ATTRS`
  - テスト用: `test/web/helpers.mjs` の `entity({ ward, dateObserved, sentAt, attrs })`、`stellioMessage(...entities)`、`bareMessage(entity)`、`observation({ kind, ward, receivedAt, sentAt, dateObserved, attrs })`(`attrs` は `{ snowHeight: [値, ISO の observedAt], … }`)

- [ ] **Step 1: テストの組み立てを書く**

`test/web/helpers.mjs`(テストではない。`*.test.mjs` でないので `npm test` は直接実行しない):

```js
// 地図アプリの単体テストで使う、通知とエンティティの組み立て。
// 形は docs/superpowers/plans/2026-10-04-plan-b-inputs-from-stage2.md の実測(Stellio 2.37.0)に合わせる。

const dt = (iso) => ({ type: 'Property', value: { type: 'DateTime', '@value': iso } });
const prop = (value, unitCode, observedAt) => ({ type: 'Property', value, unitCode, observedAt });

// attrs: { snowHeight: [値, observedAt], temperature: [...], snowfall1h: [...], windSpeed: [...] }
export function entity({ ward = 'kita', dateObserved, sentAt, attrs = {} }) {
  const unit = { temperature: 'CEL', snowHeight: 'CMT', snowfall1h: 'CMT', windSpeed: 'MTS', windDirection: 'DEG', precipitation: 'MMT' };
  const e = {
    id: `urn:ngsi-ld:WeatherObserved:sapporo-${ward}`,
    type: 'WeatherObserved',
    name: { type: 'Property', value: '北区' },
    location: { type: 'GeoProperty', value: { type: 'Point', coordinates: [141.3517, 43.13982] } },
  };
  for (const [k, [v, t]] of Object.entries(attrs)) e[k] = prop(v, unit[k], t);
  if (dateObserved) e.dateObserved = dt(dateObserved);
  if (sentAt) e.sentAt = dt(sentAt);
  return e;
}

// Stellio(ETSI の MQTT バインディング)の封筒
export function stellioMessage(...entities) {
  return JSON.stringify({
    body: {
      id: 'urn:ngsi-ld:Notification:e49ca7fd',
      type: 'Notification',
      subscriptionId: 'urn:ngsi-ld:Subscription:7f26949d',
      notifiedAt: '2026-10-04T01:00:35.384372Z',
      data: entities,
    },
    metadata: {
      Link: '<http://localhost:8080/ngsi-ld/v1/subscriptions/urn:ngsi-ld:Subscription:7f26949d/context>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"',
      'Content-Type': 'application/json',
    },
  });
}

// 封筒のないブローカー(1通知に1エンティティ)
export function bareMessage(entity1) {
  return JSON.stringify({ id: 'urn:ngsi-ld:Notification:1', type: 'Notification', subscriptionId: 'urn:ngsi-ld:Subscription:1', notifiedAt: '2026-10-04T01:00:35Z', data: [entity1] });
}

// 正規化したあとの Observation を直接作る(dedupe、store、stats のテスト用)
const ms = (iso) => (iso ? Date.parse(iso) : null);
export function observation({ kind = 'live', ward = 'kita', receivedAt = 0, sentAt = null, dateObserved = null, attrs = {} }) {
  const all = { temperature: null, snowHeight: null, snowfall1h: null, windSpeed: null, windDirection: null, precipitation: null };
  for (const [k, [v, t]] of Object.entries(attrs)) all[k] = { value: v, observedAt: ms(t) };
  return { kind, ward, receivedAt, sentAt: ms(sentAt), dateObserved: ms(dateObserved), attrs: all };
}
```

- [ ] **Step 2: 失敗するテストを書く**

`test/web/notification.test.mjs`(Stellio の例は、申し送り 2〜5節の実測):

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeMessage, kindOfTopic, readDateTime, wardOfEntityId, isNewSnowfall, freshValue, parsePayload,
  TOPIC_LIVE, TOPIC_GE5, TOPIC_GE3, SUBSCRIBE_TOPICS,
} from '../../web/src/lib/notification.js';
import { entity, stellioMessage, bareMessage } from './helpers.mjs';

const WARDS = new Set(['chuo', 'kita', 'higashi', 'shiroishi', 'toyohira', 'minami', 'nishi', 'atsubetsu', 'teine', 'kiyota']);
const kita0300 = entity({
  ward: 'kita',
  dateObserved: '2025-11-18T03:00:00Z',
  sentAt: '2026-10-04T08:45:01.136Z',
  attrs: { snowHeight: [26, '2025-11-18T03:00:00Z'], snowfall1h: [2, '2025-11-18T03:00:00Z'], temperature: [-1.2, '2025-11-18T03:00:00Z'] },
});

test('トピックの種別と購読するトピック', () => {
  assert.equal(kindOfTopic(TOPIC_LIVE), 'live');
  assert.equal(kindOfTopic(TOPIC_GE5), 'ge5');
  assert.equal(kindOfTopic(TOPIC_GE3), 'ge3');
  assert.equal(kindOfTopic('amedas/cond/other'), null);
  assert.equal(kindOfTopic('amedas/live/x'), null);
  assert.deepEqual([...SUBSCRIBE_TOPICS], ['amedas/live', 'amedas/cond/#']);
});

test('Stellio の封筒({body, metadata})を読む', () => {
  const [o, ...rest] = normalizeMessage(TOPIC_LIVE, stellioMessage(kita0300), 1000, WARDS);
  assert.equal(rest.length, 0);
  assert.equal(o.kind, 'live');
  assert.equal(o.ward, 'kita');
  assert.equal(o.receivedAt, 1000);
  assert.equal(o.sentAt, Date.parse('2026-10-04T08:45:01.136Z'));
  assert.equal(o.dateObserved, Date.parse('2025-11-18T03:00:00Z'));
  assert.deepEqual(o.attrs.snowHeight, { value: 26, observedAt: Date.parse('2025-11-18T03:00:00Z') });
  assert.equal(o.attrs.windSpeed, null);
});

test('封筒のない通知も同じ結果になる', () => {
  const a = normalizeMessage(TOPIC_LIVE, stellioMessage(kita0300), 5, WARDS);
  const b = normalizeMessage(TOPIC_LIVE, bareMessage(kita0300), 5, WARDS);
  assert.deepEqual(a, b);
});

test('Uint8Array(ブラウザーの mqtt.js)でも読む', () => {
  const bytes = new TextEncoder().encode(bareMessage(kita0300));
  assert.equal(normalizeMessage(TOPIC_GE3, bytes, 0, WARDS)[0].kind, 'ge3');
});

test('data の配列の全件を返す(1件とは限らない)', () => {
  const chuo = entity({ ward: 'chuo', dateObserved: '2025-11-18T03:00:00Z', sentAt: '2026-10-04T08:45:00Z' });
  const out = normalizeMessage(TOPIC_LIVE, stellioMessage(kita0300, chuo), 0, WARDS);
  assert.deepEqual(out.map((o) => o.ward), ['kita', 'chuo']);
});

test('想定外の形は、例外にせず無視する', () => {
  const cases = [
    'not json', '', 'null', '42', '[]', '{}', '{"body":null}', '{"data":"x"}', '{"data":[null, 1, "a"]}',
    JSON.stringify({ data: [{ id: 'urn:ngsi-ld:WeatherObserved:other-1' }] }),
    JSON.stringify({ data: [{ id: 'urn:ngsi-ld:WeatherObserved:sapporo-unknown' }] }),
  ];
  for (const c of cases) assert.deepEqual(normalizeMessage(TOPIC_LIVE, c, 0, WARDS), [], c);
  assert.deepEqual(normalizeMessage('other/topic', bareMessage(kita0300), 0, WARDS), []);
});

test('wardIds を省略すると、ID の形だけで判定する', () => {
  const e = entity({ ward: 'zzz', dateObserved: '2025-11-18T03:00:00Z' });
  assert.equal(normalizeMessage(TOPIC_LIVE, bareMessage(e), 0)[0].ward, 'zzz');
});

test('値が数でない属性は null(欠測の扱い)', () => {
  const e = entity({ ward: 'kita', dateObserved: '2025-11-18T03:00:00Z' });
  e.temperature = { type: 'Property', value: '×', observedAt: '2025-11-18T03:00:00Z' };
  e.snowHeight = { type: 'Property', value: null };
  const [o] = normalizeMessage(TOPIC_LIVE, bareMessage(e), 0, WARDS);
  assert.equal(o.attrs.temperature, null);
  assert.equal(o.attrs.snowHeight, null);
});

test('sentAt や dateObserved がなければ null', () => {
  const e = entity({ ward: 'kita', attrs: { snowHeight: [3, '2025-11-18T03:00:00Z'] } });
  const [o] = normalizeMessage(TOPIC_LIVE, bareMessage(e), 0, WARDS);
  assert.equal(o.sentAt, null);
  assert.equal(o.dateObserved, null);
});

test('readDateTime: 通知の形、書き込みの形、文字列、壊れた値', () => {
  const t = Date.parse('2026-10-04T08:45:01.136Z');
  assert.equal(readDateTime({ value: { type: 'DateTime', '@value': '2026-10-04T08:45:01.136Z' } }), t);
  assert.equal(readDateTime({ value: { '@type': 'DateTime', '@value': '2026-10-04T08:45:01.136Z' } }), t);
  assert.equal(readDateTime({ value: '2026-10-04T08:45:01.136Z' }), t);
  assert.equal(readDateTime({ value: 'yesterday' }), null);
  assert.equal(readDateTime({ value: 5 }), null);
  assert.equal(readDateTime(undefined), null);
});

test('wardOfEntityId', () => {
  assert.equal(wardOfEntityId('urn:ngsi-ld:WeatherObserved:sapporo-atsubetsu'), 'atsubetsu');
  assert.equal(wardOfEntityId('urn:ngsi-ld:WeatherObserved:sapporo-kita:x'), null);
  assert.equal(wardOfEntityId(undefined), null);
});

test('parsePayload は読めなければ null', () => {
  assert.equal(parsePayload('{'), null);
  assert.deepEqual(parsePayload('{"a":1}'), { a: 1 });
});

test('isNewSnowfall: observedAt が dateObserved と一致するときだけ新しい', () => {
  const [hourly] = normalizeMessage(TOPIC_LIVE, bareMessage(kita0300), 0, WARDS);
  assert.equal(isNewSnowfall(hourly), true);
  // 10分後の live の通知には、前の正時の snowfall1h がそのまま入っている(inputs 5節)
  const next = entity({ ward: 'kita', dateObserved: '2025-11-18T03:10:00Z', attrs: { snowfall1h: [2, '2025-11-18T03:00:00Z'] } });
  const [o] = normalizeMessage(TOPIC_LIVE, bareMessage(next), 0, WARDS);
  assert.equal(isNewSnowfall(o), false);
  const noDate = entity({ ward: 'kita', attrs: { snowfall1h: [2, '2025-11-18T03:00:00Z'] } });
  assert.equal(isNewSnowfall(normalizeMessage(TOPIC_LIVE, bareMessage(noDate), 0, WARDS)[0]), false);
});

test('freshValue: 1時間より古い値は欠測として null', () => {
  const t = Date.parse('2025-11-18T16:10:00Z');
  assert.equal(freshValue({ value: -1.6, observedAt: Date.parse('2025-11-18T16:00:00Z') }, t), -1.6);
  assert.equal(freshValue({ value: -1.6, observedAt: Date.parse('2025-11-18T15:10:00Z') }, t), null);
  assert.equal(freshValue({ value: -1.6, observedAt: Date.parse('2025-11-18T15:20:00Z') }, t), -1.6);
  assert.equal(freshValue({ value: 1, observedAt: null }, t), 1);
  assert.equal(freshValue({ value: 1, observedAt: t }, null), 1);
  assert.equal(freshValue(null, t), null);
  // observedAt が dateObserved より新しい(時刻の逆転)は、信用しない
  assert.equal(freshValue({ value: 1, observedAt: t + 1 }, t), null);
});
```

```bash
node --test test/web/notification.test.mjs
```

期待: FAIL(`Cannot find module '…/web/src/lib/notification.js'`)。

- [ ] **Step 3: 実装する**

`web/src/lib/notification.js`:

```js
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
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
node --test test/web/notification.test.mjs && npx -y node@22 --test test/web/notification.test.mjs && npm run lint
```

期待: どちらの Node でも 14件とも PASS。

- [ ] **Step 5: コミット**

```bash
git add web/src/lib/notification.js test/web/notification.test.mjs test/web/helpers.mjs
git commit -m "feat: 購読通知の正規化(封筒あり・なし、DateTime の形、降雪量の正時の判定)を追加"
```

### Task 4: 条件ヒットの重複排除(`dedupe.js`)

**Files:**
- Create: `web/src/lib/dedupe.js`
- Test: `test/web/dedupe.test.mjs`

**Interfaces:**
- Consumes: `Observation`(Task 3)、`observation(...)`(`test/web/helpers.mjs`)
- Produces: `createHitDeduper({ maxKeys = 500 }) → { offer(obs) → Decision, size() → number }`。`Decision` は次のどれか:
  - `{ action: 'show', key, tier: 'ge5' | 'ge3', ward, value }`(初めてのヒット)
  - `{ action: 'upgrade', key, tier: 'ge5', ward, value }`(弱い方を出したあとに強い方が届いた)
  - `{ action: 'ignore', reason: 'not-conditional' | 'no-snowfall' | 'stale' | 'weaker-or-same', key? }`
  - `key` は `` `${ward}|${snowfall1h.observedAt}` ``(観測時刻はエポックミリ秒)

- [ ] **Step 1: 失敗するテストを書く**

`test/web/dedupe.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHitDeduper } from '../../web/src/lib/dedupe.js';
import { observation } from './helpers.mjs';

const T = '2025-11-17T22:00:00Z'; // 北区 07:00 JST、5cm
const hit = (kind, extra = {}) =>
  observation({ kind, ward: 'kita', dateObserved: T, attrs: { snowfall1h: [5, T], snowHeight: [20, T] }, ...extra });

test('ge5 → ge3 → live(Stellio の順): ge5 を出し、ge3 と live は無視する', () => {
  const d = createHitDeduper();
  const a = d.offer(hit('ge5'));
  assert.equal(a.action, 'show');
  assert.equal(a.tier, 'ge5');
  assert.equal(a.ward, 'kita');
  assert.equal(a.value, 5);
  assert.equal(a.key, `kita|${Date.parse(T)}`);
  assert.equal(d.offer(hit('ge3')).action, 'ignore');
  assert.equal(d.offer(hit('live')).action, 'ignore');
});

test('ge3 → ge5(逆の順): ge3 を出し、ge5 で置き換える', () => {
  const d = createHitDeduper();
  assert.equal(d.offer(hit('ge3')).action, 'show');
  const up = d.offer(hit('ge5'));
  assert.equal(up.action, 'upgrade');
  assert.equal(up.tier, 'ge5');
  assert.equal(up.key, `kita|${Date.parse(T)}`);
  assert.equal(d.offer(hit('ge3')).action, 'ignore');
  assert.equal(d.offer(hit('ge5')).action, 'ignore');
});

test('live → ge3(live が先に届いても): live は演出を出さず、ge3 で出す', () => {
  const d = createHitDeduper();
  assert.deepEqual(d.offer(hit('live')), { action: 'ignore', reason: 'not-conditional' });
  assert.equal(d.offer(hit('ge3')).action, 'show');
});

test('同じ区でも、観測時刻が違えば別のヒット', () => {
  const d = createHitDeduper();
  const T2 = '2025-11-18T00:00:00Z';
  assert.equal(d.offer(hit('ge5')).action, 'show');
  const later = observation({ kind: 'ge5', ward: 'kita', dateObserved: T2, attrs: { snowfall1h: [5, T2] } });
  assert.equal(d.offer(later).action, 'show');
});

test('同じ時刻でも、区が違えば別のヒット', () => {
  const d = createHitDeduper();
  const T3 = '2025-11-18T05:00:00Z';
  const h = observation({ kind: 'ge5', ward: 'higashi', dateObserved: T3, attrs: { snowfall1h: [5, T3] } });
  const t = observation({ kind: 'ge5', ward: 'teine', dateObserved: T3, attrs: { snowfall1h: [5, T3] } });
  assert.equal(d.offer(h).action, 'show');
  assert.equal(d.offer(t).action, 'show');
});

test('snowfall1h がない、または正時の値でない条件の通知は無視する', () => {
  const d = createHitDeduper();
  assert.equal(d.offer(observation({ kind: 'ge3', dateObserved: T })).reason, 'no-snowfall');
  const stale = observation({ kind: 'ge3', dateObserved: '2025-11-17T22:10:00Z', attrs: { snowfall1h: [3, T] } });
  assert.equal(d.offer(stale).reason, 'stale');
});

test('dateObserved のない条件の通知は、snowfall1h の観測時刻で集約する', () => {
  const d = createHitDeduper();
  const o = (kind) => observation({ kind, attrs: { snowfall1h: [5, T] } });
  assert.equal(d.offer(o('ge3')).action, 'show');
  assert.equal(d.offer(o('ge5')).action, 'upgrade');
});

test('キーは件数の上限で古い順に捨てる(タイマーを使わない)', () => {
  const d = createHitDeduper({ maxKeys: 2 });
  const at = (h) => {
    const t = `2025-11-18T0${h}:00:00Z`;
    return observation({ kind: 'ge3', dateObserved: t, attrs: { snowfall1h: [3, t] } });
  };
  d.offer(at(1));
  d.offer(at(2));
  d.offer(at(3));
  assert.equal(d.size(), 2);
  assert.equal(d.offer(at(1)).action, 'show'); // 捨てたキーは、また出る
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

```bash
node --test test/web/dedupe.test.mjs
```

期待: FAIL(`Cannot find module '…/web/src/lib/dedupe.js'`)。

- [ ] **Step 3: 実装する**

`web/src/lib/dedupe.js`:

```js
// 条件ヒットの重複排除(純関数。タイマーを使わない)。
//
// ge3 と ge5 は別の購読なので、同じ書き込みの通知が別々に、順不同で届く
// (Stellio では ge5 → ge3 → live の順に約 430ms ずつ空いて届く。封筒のないブローカーでは、ほぼ同時で順序は決まらない)。
// 時間の窓ではなく、書き込みの識別子(区と、snowfall1h の観測時刻)で集約する。
// - 最初に届いた通知で演出を出す('show')
// - 強い購読(ge5)があとから届いたら、弱い方の演出を置き換える('upgrade')
// - 弱い購読や同じ購読があとから届いたら、無視する('ignore')
// - live の通知は、条件の演出を出さない('ignore')。live は面の更新だけに使う
// 演出は届いた順に出す(観測時刻に合わせて遅らせない)。

const RANK = Object.freeze({ ge3: 1, ge5: 2 });

export function createHitDeduper({ maxKeys = 500 } = {}) {
  const seen = new Map(); // key -> 表示中の強さ('ge3' | 'ge5')。古いキーから捨てる(件数で上限)
  return {
    offer(obs) {
      if (!(obs.kind in RANK)) return { action: 'ignore', reason: 'not-conditional' };
      const s = obs.attrs.snowfall1h;
      if (!s || s.observedAt === null) return { action: 'ignore', reason: 'no-snowfall' };
      // 正時の書き込みでない(snowfall1h が古い)通知は、その時間のヒットではない
      if (obs.dateObserved !== null && s.observedAt !== obs.dateObserved) return { action: 'ignore', reason: 'stale' };
      const key = `${obs.ward}|${s.observedAt}`;
      const prev = seen.get(key);
      if (prev === undefined) {
        seen.set(key, obs.kind);
        while (seen.size > maxKeys) seen.delete(seen.keys().next().value);
        return { action: 'show', key, tier: obs.kind, ward: obs.ward, value: s.value };
      }
      if (RANK[obs.kind] > RANK[prev]) {
        seen.set(key, obs.kind);
        return { action: 'upgrade', key, tier: obs.kind, ward: obs.ward, value: s.value };
      }
      return { action: 'ignore', key, reason: 'weaker-or-same' };
    },
    size: () => seen.size,
  };
}
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
node --test test/web/dedupe.test.mjs && npx -y node@22 --test test/web/dedupe.test.mjs && npm run lint
```

期待: どちらの Node でも 8件とも PASS。

- [ ] **Step 5: コミット**

```bash
git add web/src/lib/dedupe.js test/web/dedupe.test.mjs
git commit -m "feat: 条件ヒットの重複排除を、区と観測時刻で集約する形で追加"
```

### Task 5: 区の最新値と観測時刻(`store.js`)

**Files:**
- Create: `web/src/lib/store.js`
- Test: `test/web/store.test.mjs`

**Interfaces:**
- Consumes: `freshValue`、`isNewSnowfall`(Task 3)
- Produces: `createWardStore(wardIds: string[]) → { applyLive(obs) → WardState | null, get(ward) → WardState | null, clock() → number | null }`、`depthDelta1h(history, t, depth) → number | null`、`HOUR_MS`
  - `WardState = { ward, dateObserved, snowHeight, temperature, windSpeed, snowfall1h, snowDelta1h, newSnowfall }`(値は数か null。`temperature` と `snowfall1h` は、1時間より古ければ null)
  - 時計は、最後に受けた live の通知の `dateObserved`(最大値ではない)

決めたこと(実装の前提):
- setup のときの余分な live の通知(清田区、再生の開始より前の観測時刻。申し送り 6節)は、初期値として表示する。時計もその時刻を出す(再生が始まれば、すぐに進む)。無視する方式は、いつ「再生が始まった」かを地図アプリが知らないため取らない。
- 気温は、`observedAt` が `dateObserved` から1時間以内の値だけを表示する。11月の約32%の行で気温が欠測で、そのステップでは書かれず、古い値がエンティティに残るため(申し送り 10節)。既定の再生範囲(11/18)には気温の欠測はない。
- 積雪深の1時間の増分は、replay が書かないので、区ごとの `(dateObserved, 積雪深)` の履歴から求める(ちょうど1時間前、なければ30分さかのぼった範囲の最も新しい値との差)。

- [ ] **Step 1: 失敗するテストを書く**

`test/web/store.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWardStore, depthDelta1h, HOUR_MS } from '../../web/src/lib/store.js';
import { observation } from './helpers.mjs';

const WARDS = ['kita', 'kiyota'];
const at = (hhmm) => `2025-11-18T${hhmm}:00Z`;
const live = (ward, hhmm, attrs, extra = {}) => observation({ kind: 'live', ward, dateObserved: at(hhmm), attrs, ...extra });

test('live の通知で、区の値と時計を更新する', () => {
  const s = createWardStore(WARDS);
  assert.equal(s.clock(), null);
  const r = s.applyLive(live('kita', '03:00', { snowHeight: [26, at('03:00')], temperature: [-1.2, at('03:00')], windSpeed: [3.1, at('03:00')] }));
  assert.equal(r.ward, 'kita');
  assert.equal(r.snowHeight, 26);
  assert.equal(r.temperature, -1.2);
  assert.equal(r.windSpeed, 3.1);
  assert.equal(r.dateObserved, Date.parse(at('03:00')));
  assert.equal(s.clock(), Date.parse(at('03:00')));
  assert.equal(s.get('kita').snowHeight, 26);
  assert.equal(s.get('kiyota').snowHeight, null);
  assert.equal(s.get('nope'), null);
  assert.equal('history' in r, false);
});

test('条件付き購読の通知と、知らない区は反映しない', () => {
  const s = createWardStore(WARDS);
  assert.equal(s.applyLive(observation({ kind: 'ge5', ward: 'kita', dateObserved: at('03:00'), attrs: { snowHeight: [9, at('03:00')] } })), null);
  assert.equal(s.applyLive(live('chuo', '03:00', { snowHeight: [9, at('03:00')] })), null);
  assert.equal(s.clock(), null);
  assert.equal(s.get('kita').snowHeight, null);
});

test('気温の欠測: observedAt が1時間以上古ければ null(「—」で表示する)', () => {
  const s = createWardStore(WARDS);
  assert.equal(s.applyLive(live('kita', '03:10', { temperature: [-1, at('03:00')] })).temperature, -1);
  assert.equal(s.applyLive(live('kita', '04:00', { temperature: [-1, at('03:00')] })).temperature, null);
  assert.equal(s.applyLive(live('kita', '04:10', {})).temperature, null); // 属性がない
});

test('時計は最後に受けた live の dateObserved(setup のやり直しで戻る)', () => {
  const s = createWardStore(WARDS);
  s.applyLive(live('kita', '15:00', { snowHeight: [30, at('15:00')] }));
  // setup をやり直すと、再生の開始より前の観測時刻の通知が1件届く(inputs 6節)
  s.applyLive(live('kiyota', '02:40', { snowHeight: [0, at('02:40')] }));
  assert.equal(s.clock(), Date.parse(at('02:40')));
});

test('dateObserved のない通知は、時計を進めない', () => {
  const s = createWardStore(WARDS);
  s.applyLive(live('kita', '03:00', {}));
  s.applyLive(observation({ kind: 'live', ward: 'kita', attrs: { snowHeight: [5, at('09:00')] } }));
  assert.equal(s.clock(), Date.parse(at('03:00')));
  assert.equal(s.get('kita').snowHeight, 5);
});

test('snowfall1h: 正時の通知で newSnowfall、50分後まで値を保つ、1時間で消える', () => {
  const s = createWardStore(WARDS);
  const r0 = s.applyLive(live('kita', '07:00', { snowfall1h: [5, at('07:00')] }));
  assert.equal(r0.snowfall1h, 5);
  assert.equal(r0.newSnowfall, true);
  const r1 = s.applyLive(live('kita', '07:50', { snowfall1h: [5, at('07:00')] }));
  assert.equal(r1.snowfall1h, 5);
  assert.equal(r1.newSnowfall, false);
  // 08:00 の値が欠測(×)で書かれなかった場合
  assert.equal(s.applyLive(live('kita', '08:00', { snowfall1h: [5, at('07:00')] })).snowfall1h, null);
});

test('積雪深の1時間の増分', () => {
  const s = createWardStore(WARDS);
  const steps = [['02:00', 10], ['02:10', 11], ['02:20', 11], ['02:30', 12], ['02:40', 13], ['02:50', 14]];
  for (const [t, v] of steps) assert.equal(s.applyLive(live('kita', t, { snowHeight: [v, at(t)] })).snowDelta1h, null);
  assert.equal(s.applyLive(live('kita', '03:00', { snowHeight: [16, at('03:00')] })).snowDelta1h, 6);
  assert.equal(s.applyLive(live('kita', '03:10', { snowHeight: [15, at('03:10')] })).snowDelta1h, 4);
});

test('積雪深の増分: 時刻が戻ったら履歴を捨てる', () => {
  const s = createWardStore(WARDS);
  s.applyLive(live('kita', '02:00', { snowHeight: [10, at('02:00')] }));
  s.applyLive(live('kita', '01:00', { snowHeight: [0, at('01:00')] }));
  assert.equal(s.applyLive(live('kita', '02:00', { snowHeight: [10, at('02:00')] })).snowDelta1h, 10);
  // 03:00 の時点で、02:00 の値は 1件(やり直し後のもの)だけ
  assert.equal(s.applyLive(live('kita', '03:00', { snowHeight: [12, at('03:00')] })).snowDelta1h, 2);
});

test('depthDelta1h: ちょうど1時間前がなければ、30分さかのぼった範囲の最も新しい値', () => {
  const t = Date.parse(at('03:00'));
  const h = [[t - HOUR_MS - 20 * 60000, 4], [t - HOUR_MS - 10 * 60000, 5], [t - 30 * 60000, 9]];
  assert.equal(depthDelta1h(h, t, 8), 3);
  assert.equal(depthDelta1h([[t - HOUR_MS - 40 * 60000, 1]], t, 8), null);
  assert.equal(depthDelta1h(h, t, null), null);
  assert.equal(depthDelta1h(h, null, 8), null);
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

```bash
node --test test/web/store.test.mjs
```

期待: FAIL(`Cannot find module '…/web/src/lib/store.js'`)。

- [ ] **Step 3: 実装する**

`web/src/lib/store.js`:

```js
// 区ごとの最新値と、観測時刻の時計(純関数。DOM も時計も使わない)。
//
// - live の通知だけで更新する(条件付き購読の通知は、演出にだけ使う)。
// - 観測時刻は dateObserved を使う。属性の observedAt から求めない(気温の欠測や --changed-only で古いまま残る)。
// - 時計は「最後に受けた live の通知の dateObserved」。最大値ではない
//   (setup をやり直して、前より早い時刻から再生したときに、時計が止まらないようにする)。
// - setup のときに届く余分な live の通知(再生の開始より前の観測時刻)は、初期値として表示する。
// - 積雪深の1時間の増分は、区ごとの (dateObserved, 積雪深) の履歴から求める(replay は増分を書かない)。
import { freshValue, isNewSnowfall } from './notification.js';

export const HOUR_MS = 60 * 60 * 1000;
const HISTORY_MS = 2 * HOUR_MS;
// 1時間前のちょうどの値がない(その区が書かれなかったステップがある)とき、さかのぼって使う幅
const DELTA_TOLERANCE_MS = 30 * 60 * 1000;

const emptyWard = () => ({
  dateObserved: null,
  snowHeight: null,
  temperature: null,
  windSpeed: null,
  snowfall1h: null,
  snowDelta1h: null,
  newSnowfall: false,
  history: [], // [dateObserved, snowHeight] の昇順
});

// history の中で、t - 1時間 以前の最も新しい値との差(許容幅の外なら null)
export function depthDelta1h(history, t, depth) {
  if (depth === null || t === null) return null;
  const target = t - HOUR_MS;
  let base = null;
  for (const [ht, hv] of history) {
    if (ht <= target && ht >= target - DELTA_TOLERANCE_MS) base = hv;
  }
  return base === null ? null : depth - base;
}

export function createWardStore(wardIds) {
  const wards = new Map(wardIds.map((id) => [id, emptyWard()]));
  let clock = null;

  const snapshot = (w) => {
    const { history: _history, ...rest } = w;
    return { ...rest };
  };

  return {
    // live の Observation を反映する。戻り値は、その区の表示用の値(知らない区や live 以外は null)
    applyLive(obs) {
      if (obs.kind !== 'live') return null;
      const w = wards.get(obs.ward);
      if (!w) return null;
      const t = obs.dateObserved;
      if (t !== null) {
        clock = t;
        // 時刻が戻った(setup をやり直した)ときは、増分の履歴を捨てる
        if (w.dateObserved !== null && t < w.dateObserved) w.history = [];
        w.dateObserved = t;
      }
      const a = obs.attrs;
      w.snowHeight = a.snowHeight?.value ?? null;
      w.windSpeed = a.windSpeed?.value ?? null;
      w.temperature = freshValue(a.temperature, t);
      w.snowfall1h = freshValue(a.snowfall1h, t);
      w.newSnowfall = isNewSnowfall(obs);
      w.snowDelta1h = depthDelta1h(w.history, t, w.snowHeight);
      if (t !== null && w.snowHeight !== null) {
        w.history = w.history.filter(([ht]) => ht < t && ht >= t - HISTORY_MS);
        w.history.push([t, w.snowHeight]);
      }
      return { ward: obs.ward, ...snapshot(w) };
    },
    get(ward) {
      const w = wards.get(ward);
      return w ? { ward, ...snapshot(w) } : null;
    },
    clock: () => clock,
  };
}
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
node --test test/web/store.test.mjs && npx -y node@22 --test test/web/store.test.mjs && npm run lint
```

期待: どちらの Node でも 9件とも PASS。

- [ ] **Step 5: コミット**

```bash
git add web/src/lib/store.js test/web/store.test.mjs
git commit -m "feat: 区ごとの最新値と観測時刻の時計(dateObserved)、積雪深の増分を追加"
```

### Task 6: HUD の統計(`stats.js`)

**Files:**
- Create: `web/src/lib/stats.js`
- Test: `test/web/stats.test.mjs`

**Interfaces:**
- Consumes: `Observation`(Task 3)、`percentile`(`scripts/smoke/analyze.mjs`。テストでの照合だけ)
- Produces: `createStats({ windowMs = 60000, maxLatencySamples = 2000 }) → { recordLive(obs), recordConditional(obs), snapshot(now) → Snapshot }`、`percentile(sorted, p)`
  - `Snapshot = { total, ratePerMin, latency: { last, count, median, p95, max }, cond: { ge5, ge3 } }`(遅延はミリ秒。値がなければ null)
  - `cond` は重複排除の前の件数(`npm run smoke` の件数、設計書 4.2 の「5件、16件」と比べられる)

- [ ] **Step 1: 失敗するテストを書く**

`test/web/stats.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStats, percentile } from '../../web/src/lib/stats.js';
import { percentile as smokePercentile } from '../../scripts/smoke/analyze.mjs';
import { observation } from './helpers.mjs';

const T0 = Date.parse('2026-10-04T09:00:00Z');
const liveAt = (receivedAt, latencyMs) =>
  observation({ kind: 'live', receivedAt, sentAt: latencyMs === null ? null : new Date(receivedAt - latencyMs).toISOString() });

test('percentile は smoke(analyze.mjs)と同じ値を返す', () => {
  const v = [5, 1, 9, 3, 7, 2, 8, 4, 6, 10, 11].sort((a, b) => a - b);
  for (const p of [0, 1, 50, 90, 95, 99, 100]) assert.equal(percentile(v, p), smokePercentile(v, p), `p=${p}`);
  assert.equal(percentile([], 50), null);
});

test('何も受けていないとき', () => {
  const s = createStats().snapshot(T0);
  assert.deepEqual(s, { total: 0, ratePerMin: 0, latency: { last: null, count: 0, median: null, p95: null, max: null }, cond: { ge5: 0, ge3: 0 } });
});

test('Stellio の既定(6秒に10件)で、約100件/分', () => {
  const st = createStats();
  for (let i = 0; i < 100; i++) st.recordLive(liveAt(T0 + i * 600, 400));
  const s = st.snapshot(T0 + 100 * 600);
  assert.equal(s.total, 100);
  assert.equal(Math.round(s.ratePerMin), 100);
});

test('受け始めの直後は、経過時間で割る(60秒で割って薄めない)', () => {
  const st = createStats();
  for (let i = 0; i < 10; i++) st.recordLive(liveAt(T0 + i * 600, 400));
  assert.equal(Math.round(st.snapshot(T0 + 6000).ratePerMin), 100);
});

test('setup の余分な通知のあと、間を空けて再生が始まっても、レートが薄まらない', () => {
  const st = createStats();
  st.recordLive(liveAt(T0, 50)); // setup のときの1件
  const start = T0 + 120_000; // 2分後に replay
  for (let i = 0; i < 50; i++) st.recordLive(liveAt(start + i * 600, 400));
  const s = st.snapshot(start + 50 * 600);
  assert.equal(Math.round(s.ratePerMin), 100);
  assert.equal(s.total, 51);
});

test('受信が止まれば、窓が過ぎたあとのレートは 0', () => {
  const st = createStats();
  for (let i = 0; i < 10; i++) st.recordLive(liveAt(T0 + i * 600, 400));
  assert.equal(st.snapshot(T0 + 5400 + 60_001).ratePerMin, 0);
});

test('遅延: 最新、中央値、p95、最大', () => {
  const st = createStats();
  const lat = [380, 390, 400, 410, 1980, 420, 430, 440, 450, 460];
  lat.forEach((l, i) => st.recordLive(liveAt(T0 + i * 600, l)));
  const { latency } = st.snapshot(T0 + 6000);
  assert.equal(latency.last, 460);
  assert.equal(latency.count, 10);
  assert.equal(latency.median, 420);
  assert.equal(latency.p95, 1980);
  assert.equal(latency.max, 1980);
});

test('sentAt のない通知は、件数とレートには入り、遅延には入らない', () => {
  const st = createStats();
  st.recordLive(liveAt(T0, null));
  const s = st.snapshot(T0 + 1000);
  assert.equal(s.total, 1);
  assert.equal(s.latency.count, 0);
  assert.equal(s.latency.last, null);
});

test('遅延のサンプルは上限の件数まで', () => {
  const st = createStats({ maxLatencySamples: 3 });
  [100, 200, 300, 400].forEach((l, i) => st.recordLive(liveAt(T0 + i, l)));
  const { latency } = st.snapshot(T0 + 10);
  assert.equal(latency.count, 3);
  assert.equal(latency.max, 400);
  assert.equal(latency.median, 300);
});

test('条件付き購読の通知をトピックごとに数える(live は数えない)', () => {
  const st = createStats();
  st.recordConditional(observation({ kind: 'ge5' }));
  st.recordConditional(observation({ kind: 'ge3' }));
  st.recordConditional(observation({ kind: 'ge3' }));
  st.recordConditional(observation({ kind: 'live' }));
  assert.deepEqual(st.snapshot(T0).cond, { ge5: 1, ge3: 2 });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

```bash
node --test test/web/stats.test.mjs
```

期待: FAIL(`Cannot find module '…/web/src/lib/stats.js'`)。

- [ ] **Step 3: 実装する**

`web/src/lib/stats.js`:

```js
// HUD の統計(純関数。現在時刻は引数で受ける)。
// - 通知レート: 直近 windowMs の live の通知の件数を、1分あたりに直す
// - 配信の遅延: 受信時刻 − sentAt(ブローカーと地図アプリが同じ機であることが前提)。中央値、p95、最大
// - 条件付き購読の通知の件数(ge5、ge3 のトピックごと。重複排除の前の件数で、smoke の件数と比べられる)
//
// setup のときの余分な live の通知(inputs 6節)は、再生の開始の数十秒〜数分前に1件だけ届く。
// 受信の間隔が windowMs より空いたら、そこから「新しい流れ」として数え直す(レートが薄まらないように)。

// scripts/smoke/analyze.mjs の percentile と同じ定義(最近傍順位)。HUD と npm run smoke の値をそろえる。
export function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1];
}

export function createStats({ windowMs = 60_000, maxLatencySamples = 2000 } = {}) {
  let total = 0;
  let runStart = null;
  let lastReceivedAt = null;
  let lastLatency = null;
  const times = []; // 直近の受信時刻(昇順)
  const latencies = []; // 直近 maxLatencySamples 件
  const cond = { ge5: 0, ge3: 0 };

  return {
    recordLive(obs) {
      const r = obs.receivedAt;
      total++;
      if (lastReceivedAt === null || r - lastReceivedAt > windowMs) {
        runStart = r;
        times.length = 0;
      }
      lastReceivedAt = r;
      times.push(r);
      if (obs.sentAt !== null) {
        lastLatency = r - obs.sentAt;
        latencies.push(lastLatency);
        if (latencies.length > maxLatencySamples) latencies.shift();
      }
    },
    recordConditional(obs) {
      if (obs.kind in cond) cond[obs.kind]++;
    },
    snapshot(now) {
      while (times.length > 0 && times[0] < now - windowMs) times.shift();
      let ratePerMin = 0;
      if (times.length > 0) {
        const span = Math.max(1000, Math.min(windowMs, now - runStart));
        ratePerMin = (times.length / span) * 60_000;
      }
      const sorted = [...latencies].sort((a, b) => a - b);
      return {
        total,
        ratePerMin,
        latency: {
          last: lastLatency,
          count: sorted.length,
          median: percentile(sorted, 50),
          p95: percentile(sorted, 95),
          max: sorted.length > 0 ? sorted.at(-1) : null,
        },
        cond: { ...cond },
      };
    },
  };
}
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
node --test test/web/stats.test.mjs && npx -y node@22 --test test/web/stats.test.mjs && npm run lint
```

期待: どちらの Node でも 10件とも PASS。

- [ ] **Step 5: コミット**

```bash
git add web/src/lib/stats.js test/web/stats.test.mjs
git commit -m "feat: HUD の統計(通知レート、配信の遅延、条件付き購読の件数)を追加"
```

### Task 7: 面の色とラベルの読みやすさ(`color.js`)

**Files:**
- Create: `web/src/lib/color.js`
- Test: `test/web/color.test.mjs`

**Interfaces:**
- Consumes: `web/src/style.css` の `--label-bg`(Task 1)
- Produces: `SNOW_STOPS`(`[[0,'#16233a'],[5,'#1f4e79'],[15,'#3c88c4'],[25,'#8cc7f0'],[35,'#dcecf8']]`)、`NO_DATA_COLOR = '#262b36'`、`LABEL_TEXT`、`LABEL_BG = { r: 7, g: 13, b: 24, a: 0.72 }`、`snowColorExpression()`(MapLibre の式。`feature-state` の `snow`。負の数か値なしは `NO_DATA_COLOR`)、`snowColor(cm) → '#rrggbb'`、`legendGradientCss() → string`、`relativeLuminance(hex)`、`contrastRatio(a, b)`、`compositeOver(rgba, hex)`、`hexToRgb(hex)`

決めたこと: 試作の上限の色(`#f4fbff`、ほぼ白)を `#dcecf8` に落とし、区のラベルに暗い半透明の背景(`rgba(7, 13, 24, 0.72)`)を付ける(設計書 5.3 の「縁取りか背景」と「上限の調整」の両方)。どの積雪深の色の上でも、白い文字のコントラスト比が 4.5 以上になることをテストで確かめる。式は、2026-10-04 に `@maplibre/maplibre-gl-style-spec` の `validateStyleMin` で、エラーがないことを確認した(依存には入れない)。

- [ ] **Step 1: 失敗するテストを書く**

`test/web/color.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SNOW_STOPS, NO_DATA_COLOR, LABEL_TEXT, LABEL_BG, snowColor, snowColorExpression, legendGradientCss,
  relativeLuminance, contrastRatio, compositeOver, hexToRgb,
} from '../../web/src/lib/color.js';

test('刻みは 0、5、15、25、35cm(設計書 5.3)', () => {
  assert.deepEqual(SNOW_STOPS.map(([v]) => v), [0, 5, 15, 25, 35]);
});

test('snowColor: 刻みの上では刻みの色、間は線形、範囲の外は端の色、欠測は NO_DATA_COLOR', () => {
  for (const [v, c] of SNOW_STOPS) assert.equal(snowColor(v), c);
  assert.equal(snowColor(-3), SNOW_STOPS[0][1]);
  assert.equal(snowColor(80), SNOW_STOPS.at(-1)[1]);
  assert.equal(snowColor(null), NO_DATA_COLOR);
  // 0 と 5 の中間(#16233a と #1f4e79 の平均)
  assert.equal(snowColor(2.5), '#1b395a');
});

test('積雪が増えるほど明るくなる', () => {
  let prev = -1;
  for (let cm = 0; cm <= 35; cm++) {
    const l = relativeLuminance(snowColor(cm));
    assert.ok(l >= prev, `${cm}cm`);
    prev = l;
  }
});

test('上限の色は、試作の純白(#f4fbff)より暗い', () => {
  assert.ok(relativeLuminance(SNOW_STOPS.at(-1)[1]) < relativeLuminance('#f4fbff'));
});

test('ラベル(白い文字 + 暗い背景)は、どの積雪の色の上でもコントラスト比 4.5 以上', () => {
  for (let cm = 0; cm <= 35; cm++) {
    const bg = compositeOver(LABEL_BG, snowColor(cm));
    assert.ok(contrastRatio(LABEL_TEXT, bg) >= 4.5, `${cm}cm: ${contrastRatio(LABEL_TEXT, bg)}`);
  }
  assert.ok(contrastRatio(LABEL_TEXT, compositeOver(LABEL_BG, NO_DATA_COLOR)) >= 4.5);
});

test('MapLibre の式: 値がなければ NO_DATA_COLOR、あれば刻みで補間', () => {
  const e = snowColorExpression();
  assert.equal(e[0], 'case');
  assert.equal(e[2], NO_DATA_COLOR);
  assert.deepEqual(e[3].slice(3), [0, '#16233a', 5, '#1f4e79', 15, '#3c88c4', 25, '#8cc7f0', 35, '#dcecf8']);
});

test('凡例のグラデーション', () => {
  assert.equal(legendGradientCss(), 'linear-gradient(90deg, #16233a 0%, #1f4e79 14.3%, #3c88c4 42.9%, #8cc7f0 71.4%, #dcecf8 100%)');
});

test('hexToRgb は不正な形を拒む', () => {
  assert.deepEqual(hexToRgb('#ff0080'), { r: 255, g: 0, b: 128 });
  assert.throws(() => hexToRgb('red'));
});

test('ラベルの背景は、CSS の --label-bg と同じ値', () => {
  const css = readFileSync('web/src/style.css', 'utf8');
  const { r, g, b, a } = LABEL_BG;
  assert.ok(css.includes(`--label-bg: rgba(${r}, ${g}, ${b}, ${a});`));
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

```bash
node --test test/web/color.test.mjs
```

期待: FAIL(`Cannot find module '…/web/src/lib/color.js'`)。

- [ ] **Step 3: 実装する**

`web/src/lib/color.js`:

```js
// 区の面の色(積雪深の連続色)と、ラベルの読みやすさの計算(純関数)。
//
// 刻みは試作と同じ 0、5、15、25、35cm(暗い青 → 白)。上限の色は、純白(#f4fbff)から少し落として
// 白い文字のラベルが埋もれないようにする(設計書 5.3)。ラベルには暗い半透明の背景を付ける。

export const SNOW_STOPS = Object.freeze([
  [0, '#16233a'],
  [5, '#1f4e79'],
  [15, '#3c88c4'],
  [25, '#8cc7f0'],
  [35, '#dcecf8'],
]);

// まだ通知を受けていない区の色
export const NO_DATA_COLOR = '#262b36';

// ラベルの文字と背景(背景は rgba。CSS の --label-bg と同じ値にする)
export const LABEL_TEXT = '#ffffff';
export const LABEL_BG = Object.freeze({ r: 7, g: 13, b: 24, a: 0.72 });

// MapLibre の fill-color / circle-color の式。feature-state の snow(cm)を読む。値がなければ NO_DATA_COLOR
export function snowColorExpression() {
  return [
    'case',
    ['<', ['to-number', ['coalesce', ['feature-state', 'snow'], -1]], 0],
    NO_DATA_COLOR,
    ['interpolate', ['linear'], ['to-number', ['feature-state', 'snow']], ...SNOW_STOPS.flat()],
  ];
}

export function hexToRgb(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`色の形式が違います: ${hex}`);
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

const toHex = ({ r, g, b }) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const lerp = (a, b, f) => a + (b - a) * f;

// 積雪深(cm)の色。MapLibre の interpolate と同じく、範囲の外は端の色
export function snowColor(cm) {
  if (!Number.isFinite(cm)) return NO_DATA_COLOR;
  const first = SNOW_STOPS[0];
  const last = SNOW_STOPS.at(-1);
  if (cm <= first[0]) return first[1];
  if (cm >= last[0]) return last[1];
  for (let i = 1; i < SNOW_STOPS.length; i++) {
    const [v1, c1] = SNOW_STOPS[i];
    const [v0, c0] = SNOW_STOPS[i - 1];
    if (cm <= v1) {
      const f = (cm - v0) / (v1 - v0);
      const a = hexToRgb(c0);
      const b = hexToRgb(c1);
      return toHex({ r: lerp(a.r, b.r, f), g: lerp(a.g, b.g, f), b: lerp(a.b, b.b, f) });
    }
  }
  return last[1];
}

// 凡例の CSS のグラデーション
export function legendGradientCss() {
  const max = SNOW_STOPS.at(-1)[0];
  const stops = SNOW_STOPS.map(([v, c]) => `${c} ${Math.round((v / max) * 1000) / 10}%`);
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}

// WCAG 2 の相対輝度とコントラスト比
export function relativeLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(a, b) {
  const [l1, l2] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

// 半透明の色を、下の色に重ねた結果
export function compositeOver({ r, g, b, a }, underHex) {
  const u = hexToRgb(underHex);
  return toHex({ r: lerp(u.r, r, a), g: lerp(u.g, g, a), b: lerp(u.b, b, a) });
}
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
node --test test/web/color.test.mjs && npx -y node@22 --test test/web/color.test.mjs && npm run lint
```

期待: どちらの Node でも 9件とも PASS。

- [ ] **Step 5: コミット**

```bash
git add web/src/lib/color.js test/web/color.test.mjs
git commit -m "feat: 積雪深の面の色(0〜35cm)と、ラベルのコントラストの計算を追加"
```

### Task 8: 試験用の通知の発行(`fake-notify`)

ブローカーなしで、地図アプリの画面を確かめるための道具。Mosquitto だけを起動し、工程2で Stellio から実際に届いた通知と同じ形のメッセージを、観測データから組み立てて流す。封筒のない形(`--bare`)と、届く順序(`--order`)を変えられるので、Stellio では起きない組み合わせ(封筒なし、弱い購読が先、live が先)も画面で確かめられる。配信の遅延の測定には使わない(ブローカーを通らないため)。

**Files:**
- Create: `scripts/fake-notify/messages.mjs`、`scripts/fake-notify/fake-notify.mjs`
- Modify: `package.json`(`scripts` に `fake-notify` を足す)
- Test: `test/fake-notify.test.mjs`

**Interfaces:**
- Consumes: `OBS_KEYS`(`scripts/lib/observations.mjs`)、`attrProperty`、`entityId`(`scripts/replayer/payload.mjs`)、`loadDemoData`(`scripts/replayer/data.mjs`)、`buildSteps`、`carryForward`(`scripts/replayer/schedule.mjs`)、`DEFAULTS`(`scripts/replayer/config.mjs`)、`normalizeMessage`、`isNewSnowfall`(Task 3。テストだけ)
- Produces: `npm run fake-notify -- [--from ISO] [--to ISO] [--interval MS] [--bare] [--order strong-first|weak-first|live-first] [--gap MS] [--setup-notice] [--mqtt URL]`。`applyObservation(attrs, obs)`、`notifiedEntity({ ward, station, attrs, dateObserved, sentAt })`、`notificationMessage(entity, { bare, seq, notifiedAt })`、`topicsForWrite(obs, order)`、`TOPIC`

- [ ] **Step 1: 失敗するテストを書く**

`test/fake-notify.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyObservation, notifiedEntity, notificationMessage, topicsForWrite, TOPIC } from '../scripts/fake-notify/messages.mjs';
import { normalizeMessage, isNewSnowfall } from '../web/src/lib/notification.js';

const ward = { id: 'kita', name: '北区' };
const station = { coordinates: [141.3517, 43.13982] };

test('applyObservation: 書いた属性だけ観測時刻が新しくなる', () => {
  const a0 = applyObservation({}, { t: '2025-11-18T03:00:00Z', snowHeight: 26, snowfall1h: 2 });
  const a1 = applyObservation(a0, { t: '2025-11-18T03:10:00Z', snowHeight: 27 });
  assert.deepEqual(a1.snowHeight, { value: 27, t: '2025-11-18T03:10:00Z' });
  assert.deepEqual(a1.snowfall1h, { value: 2, t: '2025-11-18T03:00:00Z' });
  assert.equal(a0.snowHeight.value, 26); // 元の状態は変えない
});

test('通知の形は、地図アプリの正規化でそのまま読める(封筒あり・なし)', () => {
  const attrs = applyObservation({}, { t: '2025-11-18T03:00:00Z', snowHeight: 26, snowfall1h: 2 });
  const e = notifiedEntity({ ward, station, attrs, dateObserved: '2025-11-18T03:00:00Z', sentAt: '2026-10-04T08:45:01.136Z' });
  assert.deepEqual(e.sentAt, { type: 'Property', value: { type: 'DateTime', '@value': '2026-10-04T08:45:01.136Z' } });
  for (const bare of [false, true]) {
    const msg = notificationMessage(e, { bare, seq: 1, notifiedAt: '2026-10-04T08:45:01.200Z' });
    assert.equal('body' in msg, !bare);
    const [o] = normalizeMessage(TOPIC.live, JSON.stringify(msg), 0);
    assert.equal(o.ward, 'kita');
    assert.equal(o.attrs.snowHeight.value, 26);
    assert.equal(isNewSnowfall(o), true);
  }
});

test('topicsForWrite: 順序の3つの型と、条件の判定', () => {
  const five = { t: '2025-11-17T22:00:00Z', snowfall1h: 5 };
  assert.deepEqual(topicsForWrite(five), [TOPIC.ge5, TOPIC.ge3, TOPIC.live]);
  assert.deepEqual(topicsForWrite(five, 'weak-first'), [TOPIC.ge3, TOPIC.ge5, TOPIC.live]);
  assert.deepEqual(topicsForWrite(five, 'live-first'), [TOPIC.live, TOPIC.ge5, TOPIC.ge3]);
  assert.deepEqual(topicsForWrite({ snowfall1h: 4 }), [TOPIC.ge3, TOPIC.live]);
  assert.deepEqual(topicsForWrite({ snowfall1h: 2 }), [TOPIC.live]);
  assert.deepEqual(topicsForWrite({ snowHeight: 9 }), [TOPIC.live]);
});
```

```bash
node --test test/fake-notify.test.mjs
```

期待: FAIL(`Cannot find module '…/scripts/fake-notify/messages.mjs'`)。

- [ ] **Step 2: 組み立ての純関数を書く**

`scripts/fake-notify/messages.mjs`:

```js
// 地図アプリの確認用: ブローカーの代わりに、購読通知と同じ形の MQTT メッセージを作る(純関数)。
// 形は、工程2で Stellio から実際に届いた通知に合わせる(docs/superpowers/plans/2026-10-04-plan-b-inputs-from-stage2.md)。
// - DateTime は {"type":"DateTime","@value":…}(通知では "@type" が "type" になる)
// - 通知にはエンティティの全属性が入る(snowfall1h は前回の正時の値が残る)
// bare: true なら封筒なし(封筒を使わないブローカーの形)。
import { OBS_KEYS } from '../lib/observations.mjs';
import { attrProperty, entityId } from '../replayer/payload.mjs';

export const TOPIC = Object.freeze({
  live: 'amedas/live',
  ge5: 'amedas/cond/snowfall1h_ge5',
  ge3: 'amedas/cond/snowfall1h_ge3',
});

const dateTime = (iso) => ({ type: 'Property', value: { type: 'DateTime', '@value': iso } });

// エンティティの属性の状態(attrs: { key: { value, t } })に、1行の観測値を反映した新しい状態を返す
export function applyObservation(attrs, obs) {
  const next = { ...attrs };
  for (const k of OBS_KEYS) if (obs[k] !== undefined) next[k] = { value: obs[k], t: obs.t };
  return next;
}

// 通知に入るエンティティ
export function notifiedEntity({ ward, station, attrs, dateObserved, sentAt }) {
  const e = {
    id: entityId(ward.id),
    type: 'WeatherObserved',
    name: { type: 'Property', value: ward.name },
    location: { type: 'GeoProperty', value: { type: 'Point', coordinates: station.coordinates } },
  };
  for (const [k, { value, t }] of Object.entries(attrs)) e[k] = attrProperty(k, value, t);
  e.dateObserved = dateTime(dateObserved);
  e.sentAt = dateTime(sentAt);
  return e;
}

export function notificationMessage(entity, { bare = false, seq = 0, notifiedAt }) {
  const body = {
    id: `urn:ngsi-ld:Notification:fake-${seq}`,
    type: 'Notification',
    subscriptionId: 'urn:ngsi-ld:Subscription:fake',
    notifiedAt,
    data: [entity],
  };
  return bare ? body : { body, metadata: { 'Content-Type': 'application/json' } };
}

// 1回の書き込みで届く通知のトピックの順序。
// strong-first: ge5 → ge3 → live(Stellio で観測した順)、weak-first: ge3 → ge5 → live、live-first: live → ge5 → ge3
// 条件付きの通知は、その書き込みで snowfall1h を書いたとき(正時の行)だけ出す。
export function topicsForWrite(obs, order = 'strong-first') {
  const v = obs.snowfall1h;
  const cond = [];
  if (v !== undefined && v >= 5) cond.push(TOPIC.ge5);
  if (v !== undefined && v >= 3) cond.push(TOPIC.ge3);
  if (order === 'weak-first') cond.reverse();
  return order === 'live-first' ? [TOPIC.live, ...cond] : [...cond, TOPIC.live];
}
```

```bash
node --test test/fake-notify.test.mjs
```

期待: 3件とも PASS。

- [ ] **Step 3: CLI を書く**

`scripts/fake-notify/fake-notify.mjs`:

```js
// 地図アプリの確認用: ブローカーなしで、購読通知と同じ形のメッセージを Mosquitto に流す。
// 使い方: npm run fake-notify -- [--from ISO] [--to ISO] [--interval MS] [--bare] [--order strong-first|weak-first|live-first]
//                                [--gap MS] [--setup-notice] [--mqtt mqtt://127.0.0.1:1883]
// --bare:          封筒なしの形(封筒を使わないブローカー)。省略すると {body, metadata} の封筒(Stellio)
// --order:         1回の書き込みの通知の順序(既定 strong-first = ge5 → ge3 → live)
// --gap:           同じ書き込みの通知の間隔(ミリ秒。既定 430。Stellio の実測。0 なら間を空けない)
// --setup-notice:  再生の前に、setup のときと同じ「余分な live の通知」(清田区、開始より前の観測時刻)を1件出す
// ブローカーへの書き込みは行わない。地図アプリの見た目と、通知の形の違いの確認だけに使う(配信の遅延の測定には使わない)。
import { parseArgs } from 'node:util';
import mqtt from 'mqtt';
import { loadDemoData } from '../replayer/data.mjs';
import { buildSteps, carryForward } from '../replayer/schedule.mjs';
import { DEFAULTS } from '../replayer/config.mjs';
import { applyObservation, notifiedEntity, notificationMessage, topicsForWrite, TOPIC } from './messages.mjs';

const { values } = parseArgs({
  options: {
    from: { type: 'string', default: DEFAULTS.from },
    to: { type: 'string', default: DEFAULTS.to },
    interval: { type: 'string', default: '1000' },
    bare: { type: 'boolean', default: false },
    order: { type: 'string', default: 'strong-first' },
    gap: { type: 'string', default: '430' },
    'setup-notice': { type: 'boolean', default: false },
    mqtt: { type: 'string', default: 'mqtt://127.0.0.1:1883' },
  },
});
const intervalMs = Number(values.interval);
const gapMs = Number(values.gap);
if (!(intervalMs > 0) || !(gapMs >= 0)) throw new Error('--interval は正の数、--gap は 0 以上の数(ミリ秒)で指定してください');
if (!['strong-first', 'weak-first', 'live-first'].includes(values.order)) throw new Error(`--order が不正です: ${values.order}`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const { wards, byWard } = loadDemoData('data');
const steps = buildSteps(byWard, values.from, values.to);
const state = new Map(wards.map((w) => [w.ward.id, Object.fromEntries(Object.entries(carryForward(w.observations, values.from)))]));
const meta = new Map(wards.map((w) => [w.ward.id, w]));

const client = await mqtt.connectAsync(values.mqtt);
let seq = 0;
const publish = async (topic, wardId, dateObserved) => {
  const { ward, station } = meta.get(wardId);
  const now = new Date().toISOString();
  const e = notifiedEntity({ ward, station, attrs: state.get(wardId), dateObserved, sentAt: now });
  await client.publishAsync(topic, JSON.stringify(notificationMessage(e, { bare: values.bare, seq: ++seq, notifiedAt: now })), { qos: 0 });
};

if (values['setup-notice']) {
  const attrs = state.get('kiyota');
  const latest = Object.values(attrs).map((a) => a.t).sort().at(-1);
  await publish(TOPIC.live, 'kiyota', latest);
  console.log(`setup の余分な通知(清田区、${latest})を出しました。3秒後に再生を始めます`);
  await sleep(3000);
}

const t0 = Date.now();
const counts = { live: 0, ge5: 0, ge3: 0 };
for (let i = 0; i < steps.length; i++) {
  const { t, writes } = steps[i];
  for (const [k, { ward, obs }] of writes.entries()) {
    const due = t0 + i * intervalMs + (k * intervalMs) / writes.length;
    await sleep(Math.max(0, due - Date.now()));
    state.set(ward, applyObservation(state.get(ward), obs));
    const topics = topicsForWrite(obs, values.order);
    for (const [j, topic] of topics.entries()) {
      if (j > 0 && gapMs > 0) await sleep(gapMs);
      await publish(topic, ward, t);
      counts[topic === TOPIC.live ? 'live' : topic === TOPIC.ge5 ? 'ge5' : 'ge3']++;
    }
  }
}
console.log(`完了: ${steps.length} ステップ、live ${counts.live} 件、ge5 ${counts.ge5} 件、ge3 ${counts.ge3} 件`);
await client.endAsync();
```

`package.json` の `scripts` に1行足す:

```json
    "fake-notify": "node scripts/fake-notify/fake-notify.mjs"
```

- [ ] **Step 4: Mosquitto に流して、届くことを確かめる**

```bash
docker compose -f compose/docker-compose.yml up -d mosquitto
node -e "
import('mqtt').then(({ default: mqtt }) => {
  const c = mqtt.connect('mqtt://127.0.0.1:1883');
  const n = { live: 0, cond: 0 };
  c.on('connect', () => c.subscribe(['amedas/live', 'amedas/cond/#']));
  c.on('message', (t) => { t === 'amedas/live' ? n.live++ : n.cond++; });
  setTimeout(() => { console.log(n); c.end(); }, 12000);
});" &
sleep 1
npm run fake-notify -- --from 2025-11-18T06:50:00+09:00 --to 2025-11-18T07:00:00+09:00 --interval 1000 --gap 100
wait
```

期待: `完了: 2 ステップ、live 20 件、ge5 1 件、ge3 1 件`、購読側は `{ live: 20, cond: 2 }`。

- [ ] **Step 5: コミット**

```bash
npm run lint && npm test
git add scripts/fake-notify test/fake-notify.test.mjs package.json
git commit -m "feat: 地図アプリの確認用に、ブローカーなしで通知と同じ形のメッセージを流す fake-notify を追加"
```

### Task 9: 地図と区のラベル(`map-layer.js`、`labels.js`、`hub.js`、時計)

**Files:**
- Create: `web/src/lib/hub.js`、`web/src/map-layer.js`、`web/src/labels.js`、`web/src/panels/clocks.js`
- Modify: `web/src/main.js`(置き換え)
- Test: `test/web/hub.test.mjs`

**Interfaces:**
- Consumes: `snowColorExpression`、`legendGradientCss`(Task 7)、`formatJst`、`formatSnowDepth`、`formatTemperature`、`temperatureClass`(Task 2)
- Produces:
  - `createHub({ onError }) → { on(event, fn), emit(event, ...args) }`、`EVENTS = ['live', 'conditional', 'hit', 'tick', 'layout']`。イベントの引数: `live(obs, wardState)`、`conditional(obs)`、`hit(decision, obs)`(`decision` は Task 4 の show / upgrade)、`tick(now)`、`layout(positions)`
  - `createMapLayer({ container, wards, stations, padding: () => {top, bottom, left, right} }) → { map, ready: Promise, setSnow(ward, cm | null), flashHit(ward, 'ge3' | 'ge5'), refit(), project([lng, lat]) → {x, y} }`。ソースは `wards`(`promoteId: 'id'`)と `stations`(`promoteId: 'ward'`)、レイヤーは `background`、`ward-fill`、`ward-line`、`station-dot`
  - `createWardLabels(layer, stations, wardNames) → { layout(positions: Map<ward, {x, y}>), update(ward, wardState) }`
  - `createClocks(root) → { render(observedMs | null, nowMs) }`

- [ ] **Step 1: 失敗するテストを書く(イベント)**

`test/web/hub.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHub, EVENTS } from '../../web/src/lib/hub.js';

test('登録した順に呼ぶ', () => {
  const hub = createHub();
  const seen = [];
  hub.on('live', (x) => seen.push(['a', x]));
  hub.on('live', (x) => seen.push(['b', x]));
  hub.emit('live', 1);
  hub.emit('tick', 2);
  assert.deepEqual(seen, [['a', 1], ['b', 1]]);
});

test('1つが例外を投げても、残りは呼ばれる', () => {
  const errors = [];
  const hub = createHub({ onError: (e) => errors.push(e.message) });
  let called = false;
  hub.on('hit', () => {
    throw new Error('boom');
  });
  hub.on('hit', () => {
    called = true;
  });
  hub.emit('hit', {});
  assert.equal(called, true);
  assert.deepEqual(errors, ['boom']);
});

test('未知のイベントは登録で拒む', () => {
  assert.throws(() => createHub().on('nope', () => {}), /未知のイベント/);
  assert.deepEqual([...EVENTS], ['live', 'conditional', 'hit', 'tick', 'layout']);
});
```

```bash
node --test test/web/hub.test.mjs
```

期待: FAIL(`Cannot find module '…/web/src/lib/hub.js'`)。

- [ ] **Step 2: イベントの仕組みを書く**

`web/src/lib/hub.js`:

```js
// 演出をつなぐ小さなイベントの仕組み(純関数)。
// main.js は、受信した通知を 'live'、'hit'、'conditional' として流し、'tick'(4回/秒)と 'layout'(地図の再配置)を流す。
// 各演出は app.on(...) で受け取る。演出を削るときは、main.js の install の1行を消せばよい。
// 1つの演出が例外を投げても、ほかの演出と受信の処理は止めない。

export const EVENTS = Object.freeze(['live', 'conditional', 'hit', 'tick', 'layout']);

export function createHub({ onError = (e) => console.error(e) } = {}) {
  const handlers = new Map(EVENTS.map((e) => [e, []]));
  return {
    on(event, fn) {
      const list = handlers.get(event);
      if (!list) throw new Error(`未知のイベント: ${event}`);
      list.push(fn);
    },
    emit(event, ...args) {
      for (const fn of handlers.get(event) ?? []) {
        try {
          fn(...args);
        } catch (e) {
          onError(e);
        }
      }
    },
  };
}
```

```bash
node --test test/web/hub.test.mjs
```

期待: 3件とも PASS。

- [ ] **Step 3: 地図を書く**

`web/src/map-layer.js`:

```js
// 地図(MapLibre)。タイルは使わず、背景と区の GeoJSON だけで描く(外部通信なし)。
// 文字(text-field)は使わない: MapLibre の文字は、フォントのグリフを外部から取るため。区のラベルは DOM で描く(labels.js)。
import { Map as MapLibreMap, setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { snowColorExpression } from './lib/color.js';

// バンドルした Worker を使う(既定では、maplibre-gl.mjs の隣のファイルを探して失敗する)
setWorkerUrl(workerUrl);

const BACKGROUND = '#070d18';
const HIT_LEVEL = Object.freeze({ ge3: 1, ge5: 2 });
const HIT_FLASH_MS = 1800;

function stationBounds(stations) {
  const lngs = stations.map((s) => s.coordinates[0]);
  const lats = stations.map((s) => s.coordinates[1]);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}

const hitLevel = ['coalesce', ['feature-state', 'hit'], 0];

// wards: 区の境界の GeoJSON(properties.id が区の ID)、stations: data/stations.json
// padding: () => { top, bottom, left, right }(パネルに隠れない範囲に、観測点を収めるための余白。南区は途中で切れてよい。設計書 5.5)
export function createMapLayer({ container, wards, stations, padding }) {
  const bounds = stationBounds(stations);
  const map = new MapLibreMap({
    container,
    style: { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': BACKGROUND } }] },
    bounds,
    fitBoundsOptions: { padding: padding() },
    interactive: false,
    attributionControl: false,
    fadeDuration: 0,
  });

  let loaded = false;
  const pendingSnow = new Map();
  const hitTimers = new Map();

  const ready = new Promise((resolve) => {
    map.on('load', () => {
      map.addSource('wards', { type: 'geojson', data: wards, promoteId: 'id' });
      map.addSource('stations', {
        type: 'geojson',
        promoteId: 'ward',
        data: {
          type: 'FeatureCollection',
          features: stations.map((s) => ({ type: 'Feature', properties: { ward: s.ward }, geometry: { type: 'Point', coordinates: s.coordinates } })),
        },
      });
      map.addLayer({ id: 'ward-fill', type: 'fill', source: 'wards', paint: { 'fill-color': snowColorExpression() } });
      map.addLayer({
        id: 'ward-line',
        type: 'line',
        source: 'wards',
        paint: {
          'line-color': ['match', hitLevel, 2, '#ff3d7f', 1, '#ffb020', '#3d4f70'],
          'line-width': ['match', hitLevel, 0, 1, 3],
        },
      });
      map.addLayer({
        id: 'station-dot',
        type: 'circle',
        source: 'stations',
        paint: { 'circle-radius': 3.5, 'circle-color': '#ffffff', 'circle-stroke-color': '#0b1424', 'circle-stroke-width': 1.5 },
      });
      loaded = true;
      for (const [ward, cm] of pendingSnow) setSnow(ward, cm);
      pendingSnow.clear();
      resolve();
    });
  });

  // 積雪深(cm)で区を塗る。null は「値なし」の色
  function setSnow(ward, cm) {
    if (!loaded) {
      pendingSnow.set(ward, cm);
      return;
    }
    const snow = Number.isFinite(cm) ? cm : -1;
    map.setFeatureState({ source: 'wards', id: ward }, { snow });
    map.setFeatureState({ source: 'stations', id: ward }, { snow });
  }

  // 条件ヒットの区の外周を、しばらく強調する(強い購読があとから届いたら、色を上書きする)
  function flashHit(ward, tier) {
    if (!loaded) return;
    clearTimeout(hitTimers.get(ward));
    map.setFeatureState({ source: 'wards', id: ward }, { hit: HIT_LEVEL[tier] ?? 0 });
    hitTimers.set(ward, setTimeout(() => map.setFeatureState({ source: 'wards', id: ward }, { hit: 0 }), HIT_FLASH_MS));
  }

  function refit() {
    map.resize();
    map.fitBounds(bounds, { padding: padding(), animate: false });
  }

  return {
    map,
    ready,
    setSnow,
    flashHit,
    refit,
    project: (lngLat) => map.project(lngLat),
  };
}
```

MapLibre 6 には default export がない(`import maplibregl from 'maplibre-gl'` はビルドで `Missing export` になる。2026-10-04 に確認)。名前つきの import を使う。

- [ ] **Step 4: 区のラベルと時計を書く**

`web/src/labels.js`:

```js
// 区のラベル(区名、積雪深、気温)。地図の上の DOM で描く(MapLibre の文字は外部のグリフが要るため使わない)。
// 気温が欠測(または1時間以上古い)のときは「—」にして、色を付けない。
import { formatSnowDepth, formatTemperature, temperatureClass } from './lib/format.js';

export function createWardLabels(layer, stations, wardNames) {
  const labels = new Map();
  for (const s of stations) {
    const el = document.createElement('div');
    el.className = 'ward-label';
    el.dataset.ward = s.ward;
    const name = document.createElement('b');
    name.textContent = wardNames.get(s.ward) ?? s.ward;
    const snow = document.createElement('span');
    snow.className = 'snow';
    snow.textContent = formatSnowDepth(null);
    const temp = document.createElement('span');
    temp.className = 'temp t-none';
    temp.textContent = formatTemperature(null);
    el.append(name, snow, temp);
    layer.append(el);
    labels.set(s.ward, { el, snow, temp });
  }

  return {
    // positions: Map<ward, {x, y}>(観測点の画面座標)。ラベルは観測点の少し下に置く
    layout(positions) {
      for (const [ward, { el }] of labels) {
        const p = positions.get(ward);
        if (p) el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y + 8)}px) translateX(-50%)`;
      }
    },
    update(ward, state) {
      const l = labels.get(ward);
      if (!l) return;
      l.snow.textContent = formatSnowDepth(state.snowHeight);
      l.temp.textContent = formatTemperature(state.temperature);
      l.temp.className = `temp t-${temperatureClass(state.temperature)}`;
    },
  };
}
```

`web/src/panels/clocks.js`:

```js
// 2つの時計: 「観測時刻」(データの時刻 = 最後に受けた live の通知の dateObserved)と「現在時刻」(壁時計)
import { formatJst } from '../lib/format.js';

export function createClocks(root) {
  const observed = root.querySelector('[data-clock="observed"]');
  const wall = root.querySelector('[data-clock="wall"]');
  return {
    render(observedMs, nowMs) {
      observed.textContent = formatJst(observedMs);
      wall.textContent = formatJst(nowMs, { seconds: true });
    },
  };
}
```

- [ ] **Step 5: main.js を置き換える(この段階では受信しない)**

`web/src/main.js`:

```js
// 地図アプリの入口(Task 9 の段階: 地図、区のラベル、現在時刻だけ。受信は Task 10 でつなぐ)
import './style.css';
import stations from '../../data/stations.json';
import wardsUrl from '../../data/wards.geojson?url';
import { createHub } from './lib/hub.js';
import { legendGradientCss } from './lib/color.js';
import { createMapLayer } from './map-layer.js';
import { createWardLabels } from './labels.js';
import { createClocks } from './panels/clocks.js';

async function main() {
  const wards = await (await fetch(wardsUrl)).json();
  const wardNames = new Map(wards.features.map((f) => [f.properties.id, f.properties.name]));
  const hub = createHub();
  const positions = new Map(); // 区 -> 観測点の画面座標 {x, y}

  document.querySelector('.legend-bar').style.background = legendGradientCss();

  // 左の時計と HUD、右の通知の欄に、観測点が隠れないようにする
  const padding = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const left = Math.min(document.getElementById('hud').getBoundingClientRect().right + 90, w * 0.35);
    const right = Math.min(w - document.getElementById('side').getBoundingClientRect().left + 90, w * 0.4);
    return { top: Math.round(h * 0.12), bottom: Math.round(h * 0.1), left: Math.round(left), right: Math.round(right) };
  };
  const mapLayer = createMapLayer({ container: document.getElementById('map'), wards, stations, padding });
  const labels = createWardLabels(document.getElementById('fx'), stations, wardNames);
  const clocks = createClocks(document.getElementById('clocks'));

  const layout = () => {
    for (const s of stations) positions.set(s.ward, mapLayer.project(s.coordinates));
    labels.layout(positions);
    hub.emit('layout', positions);
  };
  mapLayer.map.on('move', layout);
  mapLayer.map.on('resize', layout);
  mapLayer.ready.then(layout);
  window.addEventListener('resize', () => mapLayer.refit());

  setInterval(() => clocks.render(null, Date.now()), 250);
  window.__sapporo = { mapLayer, positions };
}

main().catch((e) => {
  console.error(e);
  document.body.dataset.error = String(e?.message ?? e);
});
```

- [ ] **Step 6: 画面で確かめる**

```bash
npm run lint && npm run web:build && npm run web:preview
```

Playwright MCP で次を行う:
1. `browser_resize`(1920 × 1080)、`browser_navigate` → `http://127.0.0.1:4173/`
2. `browser_evaluate` → `() => ({ err: document.body.dataset.error ?? null, labels: document.querySelectorAll('.ward-label').length, layers: window.__sapporo.mapLayer.map.getStyle().layers.map((l) => l.id), pos: window.__sapporo.positions.size })`

期待: `{ err: null, labels: 10, layers: ['background', 'ward-fill', 'ward-line', 'station-dot'], pos: 10 }`。
3. `browser_take_screenshot`(`filename: .playwright-mcp/task9.png`)を見て確かめる: 10区がすべて「値なし」の灰色(`#262b36`)で塗られ、境界線と観測点の白い点があり、ラベルは「区名 / — / —」。現在時刻が秒で進み、観測時刻は「—」。左の時計と HUD、右の欄に、観測点とラベルが隠れていない。
4. `browser_console_messages`(level: error)に、`favicon` 以外のエラーがない(MQTT はまだ接続しない)。

確認したら、スクリーンショットをリポジトリの外へ移す(`mkdir -p ~/sapporo-web-shots && mv .playwright-mcp/task9.png ~/sapporo-web-shots/`)。Playwright MCP は、リポジトリの中(`.playwright-mcp/`)にしか保存できない。

- [ ] **Step 7: コミット**

```bash
npm test
git add web/src/lib/hub.js web/src/map-layer.js web/src/labels.js web/src/panels/clocks.js web/src/main.js test/web/hub.test.mjs
git commit -m "feat: タイルなしの地図(区の面と境界)と、区のラベル、時計を追加"
```

### Task 10: 受信と面の更新、2つの時計、HUD(`mqtt-feed.js`、`hud.js`)

**Files:**
- Create: `web/src/mqtt-feed.js`、`web/src/panels/hud.js`
- Modify: `web/src/main.js`(置き換え)

**Interfaces:**
- Consumes: `normalizeMessage`、`SUBSCRIBE_TOPICS`(Task 3)、`createHitDeduper`(Task 4)、`createWardStore`(Task 5)、`createStats`(Task 6)、`readConfig`(Task 2)、`formatMs`(Task 2)、Task 9 のすべて
- Produces:
  - `connectFeed({ url, wardIds, onObservations(list), onStatus(status), debugLog }) → { end() }`。`status` は `'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'refused' | 'error'`。`debugLog` の要素は `{ topic, id, sentAt: ISO | null, dateObserved: ISO | null, receivedAt }`
  - `createHud(root) → { render(snapshot), setStatus(status) }`
  - `app = { config, on, stations, wardNames, positions, mapLayer, fx }`(Task 11 以降の `install〜(app)` が受け取る。`app.ripples`、`app.controls` はあとのタスクが足す)
  - `window.__sapporo = { app, stats(), clock(), ward(id), received }`(`received` は `?debug` のときの受信ログ。それ以外は null)
  - main.js の末尾に「演出の組み込み」の目印の行(`// ---- 演出の組み込み(1行ずつ。削るときは、その行を消す) ----`)。以降のタスクは、import を import の並びの末尾に、`install〜(app);` をこの行の下に、1行ずつ足す

- [ ] **Step 1: MQTT の受信を書く**

`web/src/mqtt-feed.js`:

```js
// MQTT(WebSocket)で購読通知を受け、Observation に正規化して渡す。
// - トピックは amedas/live と amedas/cond/#、QoS 0
// - 切れたら 2 秒ごとに再接続する。clean session なので、接続のたびに購読し直す
//   (mqtt.js の自動の再購読は切る。二重の購読にしない)
// - 受信時刻は Date.now()(sentAt と同じ壁時計。配信の遅延 = 受信時刻 − sentAt)
import mqtt from 'mqtt';
import { normalizeMessage, SUBSCRIBE_TOPICS } from './lib/notification.js';

// onStatus(status): 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'refused' | 'error'
// debugLog: 配列を渡すと、受信した通知を1件ずつ記録する(?debug)
export function connectFeed({ url, wardIds, onObservations, onStatus = () => {}, debugLog = null }) {
  onStatus('connecting');
  const client = mqtt.connect(url, { reconnectPeriod: 2000, connectTimeout: 5000, clean: true, resubscribe: false });

  client.on('connect', () => {
    onStatus('connected');
    client.subscribe([...SUBSCRIBE_TOPICS], { qos: 0 }, (err, granted) => {
      if (err || granted?.some((g) => g.qos >= 128)) {
        console.error('MQTT の購読が拒否されました', err ?? granted);
        onStatus('refused');
      }
    });
  });
  client.on('reconnect', () => onStatus('reconnecting'));
  client.on('close', () => onStatus('disconnected'));
  client.on('error', (e) => {
    console.warn('MQTT のエラー', e?.message ?? e);
    onStatus('error');
  });
  client.on('message', (topic, payload) => {
    const receivedAt = Date.now();
    const list = normalizeMessage(topic, payload, receivedAt, wardIds);
    if (debugLog) {
      for (const o of list) {
        debugLog.push({
          topic,
          id: `urn:ngsi-ld:WeatherObserved:sapporo-${o.ward}`,
          sentAt: o.sentAt === null ? null : new Date(o.sentAt).toISOString(),
          dateObserved: o.dateObserved === null ? null : new Date(o.dateObserved).toISOString(),
          receivedAt,
        });
      }
    }
    if (list.length > 0) onObservations(list);
  });

  return { end: () => client.end(true) };
}
```

mqtt.js 5.16.0 は、Vite では `browser` の条件で `dist/mqtt.esm.js` が選ばれ、そのままバンドルできる(2026-10-04 に、Vite 8.3.2 でビルドし、ブラウザーから Mosquitto(`ws://127.0.0.1:9001`)に接続して受信できることを確認した)。受信したメッセージは `Uint8Array`(Buffer)で届く。

- [ ] **Step 2: HUD を書く**

`web/src/panels/hud.js`:

```js
// HUD: 受信件数、通知レート、配信の遅延(最新、中央値 / p95 / 最大)、条件付き購読の通知の件数、接続の状態
import { formatMs } from '../lib/format.js';

export function createHud(root) {
  const field = (name) => root.querySelector(`[data-hud="${name}"]`);
  const total = field('total');
  const rate = field('rate');
  const latency = field('latency');
  const latencyStats = field('latency-stats');
  const ge5 = field('ge5');
  const ge3 = field('ge3');
  return {
    // snap: stats.snapshot(now) の戻り値
    render(snap) {
      total.textContent = String(snap.total);
      rate.textContent = String(Math.round(snap.ratePerMin));
      latency.textContent = formatMs(snap.latency.last);
      latencyStats.textContent = `${formatMs(snap.latency.median)} / ${formatMs(snap.latency.p95)} / ${formatMs(snap.latency.max)} ms`;
      ge5.textContent = String(snap.cond.ge5);
      ge3.textContent = String(snap.cond.ge3);
    },
    setStatus(status) {
      root.dataset.status = status;
    },
  };
}
```

- [ ] **Step 3: main.js を置き換える**

`web/src/main.js`:

```js
// 地図アプリの入口。受信 → 正規化 → 区の値と統計の更新 → 演出、の順につなぐ。
// 演出は app.on(...) で受け取る(lib/hub.js)。次点・余裕の演出は、末尾の「演出の組み込み」に1行ずつ足す。
import './style.css';
import stations from '../../data/stations.json';
import wardsUrl from '../../data/wards.geojson?url';
import { readConfig } from './lib/config.js';
import { createHub } from './lib/hub.js';
import { createWardStore } from './lib/store.js';
import { createStats } from './lib/stats.js';
import { createHitDeduper } from './lib/dedupe.js';
import { legendGradientCss } from './lib/color.js';
import { createMapLayer } from './map-layer.js';
import { createWardLabels } from './labels.js';
import { connectFeed } from './mqtt-feed.js';
import { createClocks } from './panels/clocks.js';
import { createHud } from './panels/hud.js';

async function main() {
  const config = readConfig(location.search);
  for (const w of config.warnings) console.warn(w);

  const wards = await (await fetch(wardsUrl)).json();
  const wardNames = new Map(wards.features.map((f) => [f.properties.id, f.properties.name]));
  const wardIds = new Set(wardNames.keys());

  const hub = createHub();
  const store = createWardStore([...wardIds]);
  const stats = createStats();
  const deduper = createHitDeduper();
  const positions = new Map(); // 区 -> 観測点の画面座標 {x, y}

  document.querySelector('.legend-bar').style.background = legendGradientCss();

  // 左の時計と HUD、右の通知の欄に、観測点が隠れないようにする
  const padding = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const left = Math.min(document.getElementById('hud').getBoundingClientRect().right + 90, w * 0.35);
    const right = Math.min(w - document.getElementById('side').getBoundingClientRect().left + 90, w * 0.4);
    return { top: Math.round(h * 0.12), bottom: Math.round(h * 0.1), left: Math.round(left), right: Math.round(right) };
  };
  const mapLayer = createMapLayer({ container: document.getElementById('map'), wards, stations, padding });
  const fx = document.getElementById('fx');
  const labels = createWardLabels(fx, stations, wardNames);
  const clocks = createClocks(document.getElementById('clocks'));
  const hud = createHud(document.getElementById('hud'));

  const layout = () => {
    for (const s of stations) positions.set(s.ward, mapLayer.project(s.coordinates));
    labels.layout(positions);
    hub.emit('layout', positions);
  };
  mapLayer.map.on('move', layout);
  mapLayer.map.on('resize', layout);
  mapLayer.ready.then(layout);
  window.addEventListener('resize', () => mapLayer.refit());

  // 演出が共有するもの
  const app = { config, on: hub.on, stations, wardNames, positions, mapLayer, fx };

  function handle(obs) {
    if (obs.kind === 'live') {
      stats.recordLive(obs);
      const state = store.applyLive(obs);
      if (!state) return;
      mapLayer.setSnow(obs.ward, state.snowHeight);
      labels.update(obs.ward, state);
      hub.emit('live', obs, state);
      return;
    }
    stats.recordConditional(obs);
    hub.emit('conditional', obs);
    const hit = deduper.offer(obs);
    if (hit.action === 'show' || hit.action === 'upgrade') hub.emit('hit', hit, obs);
  }

  const debugLog = config.debug ? [] : null;
  connectFeed({
    url: config.mqttUrl,
    wardIds,
    debugLog,
    onStatus: (s) => hud.setStatus(s),
    onObservations: (list) => {
      for (const obs of list) handle(obs);
    },
  });

  // 時計と HUD は 4回/秒で描き直す(通知ごとには描かない)
  setInterval(() => {
    const now = Date.now();
    clocks.render(store.clock(), now);
    hud.render(stats.snapshot(now));
    hub.emit('tick', now);
  }, 250);

  // Playwright と手動の確認用(?debug のときは受信ログも)
  window.__sapporo = { app, stats: () => stats.snapshot(Date.now()), clock: () => store.clock(), ward: (w) => store.get(w), received: debugLog };

  // ---- 演出の組み込み(1行ずつ。削るときは、その行を消す) ----
}

main().catch((e) => {
  console.error(e);
  document.body.dataset.error = String(e?.message ?? e);
});
```

- [ ] **Step 4: Stellio の形(封筒あり、ge5 → ge3 → live)で確かめる**

```bash
npm run lint && npm test && npm run web:build
docker compose -f compose/docker-compose.yml up -d mosquitto
npm run web:preview
```

Playwright MCP: `browser_resize`(1920 × 1080)、`browser_navigate` → `http://127.0.0.1:4173/?debug`。別の端末で:

```bash
npm run fake-notify -- --from 2025-11-18T06:30:00+09:00 --to 2025-11-18T07:20:00+09:00 --interval 1500 --gap 200 --setup-notice
```

期待(端末): `setup の余分な通知(清田区、2025-11-17T21:20:00Z)を出しました…`、`完了: 6 ステップ、live 60 件、ge5 1 件、ge3 1 件`。

`browser_evaluate` → `() => ({ s: window.__sapporo.stats(), clock: new Date(window.__sapporo.clock()).toISOString(), kita: window.__sapporo.ward('kita'), recv: window.__sapporo.received.length, status: document.getElementById('hud').dataset.status })`

期待: `s.total` が 61(setup の1件を含む)、`s.cond` が `{ ge5: 1, ge3: 1 }`、`s.latency.median` が数(同じ機なので数ミリ秒)、`clock` が `2025-11-17T22:20:00.000Z`(07:20 JST)、`kita.snowHeight` が 10、`kita.snowfall1h` が 5、`recv` が 63、`status` が `connected`。画面では、観測時刻が「2025-11-18 07:20 JST」、北区が他の区より明るい色、HUD の数字が入っている。

- [ ] **Step 5: 封筒なしの形と、再接続を確かめる**

ページを読み直し(`browser_navigate` → `http://127.0.0.1:4173/?debug`)、別の端末で:

```bash
npm run fake-notify -- --from 2025-11-18T06:50:00+09:00 --to 2025-11-18T07:10:00+09:00 --interval 1500 --gap 0 --bare
```

期待: `browser_evaluate` の `s.total` が 30、`s.cond` が `{ ge5: 1, ge3: 1 }`、`clock` が `2025-11-17T22:10:00.000Z`。

再接続: `docker compose -f compose/docker-compose.yml stop mosquitto` → 数秒待って `browser_evaluate` → `() => document.getElementById('hud').dataset.status`(期待: `reconnecting` か `disconnected`。HUD の点が灰色か橙)→ `docker compose -f compose/docker-compose.yml start mosquitto` → 5秒後に同じ式で `connected`。続けて上の `--bare` のコマンドをもう一度流し、`s.total` が 30 増える(60 になる)ことを確かめる(再接続のあとも購読が成立している)。同じトピックの購読を同じクライアントが送り直しても、MQTT では置き換えになり、通知は二重には届かない。`resubscribe: false` は、再購読を接続のたびの1回にそろえるための設定。

- [ ] **Step 6: コミット**

```bash
git add web/src/mqtt-feed.js web/src/panels/hud.js web/src/main.js
git commit -m "feat: MQTT の購読通知で区の面と時計、HUD(通知レート、配信の遅延)を更新する"
```

### Task 11: 波紋と条件ヒット(`ripples.js`、`hits.js`、`hit-effects.js`)

**Files:**
- Create: `web/src/effects/ripples.js`、`web/src/panels/hits.js`、`web/src/effects/hit-effects.js`
- Modify: `web/src/main.js`(2行)、`web/src/style.css`(節を足す)

**Interfaces:**
- Consumes: `app`(Task 10)、`hit(decision, obs)` と `live(obs, state)` のイベント(Task 9、10)、`app.mapLayer.flashHit`(Task 9)、`formatHourMinute`、`formatTimeOfDay`(Task 2)
- Produces: `createRipples(layer) → { setEnabled(boolean), pulse(x, y), hit(key, x, y, tier, text) }`、`createHitList(root, { max = 8 }) → { render(decision, wardName, obs) }`、`installHitEffects(app)`(`app.ripples` を設定する。Task 12 の「波紋」の切り替えが使う)

- [ ] **Step 1: 波紋とヒットの演出を書く**

`web/src/effects/ripples.js`:

```js
// 波紋(CSS アニメーション。transform と opacity だけを動かす)と、条件ヒットのラベル。
// - 通常の更新: 細いリング1本(控えめ)
// - 条件ヒット: 太い発光リング2本 + ラベル(橙 = 3cm 以上、赤 = 5cm 以上)
// - 同じ書き込みで強い購読の通知があとから届いたら、弱い方の演出を消して置き換える
export function createRipples(layer) {
  const active = new Map(); // hit.key -> 要素の配列
  let enabled = true;

  function place(el, x, y) {
    el.style.left = `${Math.round(x)}px`;
    el.style.top = `${Math.round(y)}px`;
    layer.append(el);
    return el;
  }

  function ring(x, y, className) {
    const el = document.createElement('div');
    el.className = className;
    el.addEventListener('animationend', () => el.remove(), { once: true });
    return place(el, x, y);
  }

  return {
    setEnabled(v) {
      enabled = v;
    },
    // 通常の更新(live の通知)
    pulse(x, y) {
      if (enabled) ring(x, y, 'ring ring-live');
    },
    // 条件ヒット(トグルに関係なく出す。必須の演出)
    hit(key, x, y, tier, text) {
      for (const el of active.get(key) ?? []) el.remove();
      const els = [ring(x, y, `ring ring-hit ${tier}`), ring(x, y, `ring ring-hit ${tier} delayed`)];
      const label = document.createElement('div');
      label.className = `hit-label ${tier}`;
      label.textContent = text;
      label.addEventListener(
        'animationend',
        () => {
          label.remove();
          if (active.get(key) === els) active.delete(key);
        },
        { once: true },
      );
      els.push(place(label, x, y));
      active.set(key, els);
    },
  };
}
```

`web/src/panels/hits.js`:

```js
// 条件ヒット欄(主役)。新しいものを上に、最大 max 件。
// 強い購読(ge5)の通知があとから届いたら、同じ行を書き換える(行を増やさない)。
import { formatHourMinute, formatTimeOfDay } from '../lib/format.js';

const TIER_TEXT = Object.freeze({ ge5: '5cm 以上', ge3: '3cm 以上' });

export function createHitList(root, { max = 8 } = {}) {
  const rows = new Map(); // hit.key -> li
  return {
    // hit: dedupe の戻り値(action が show か upgrade)、wardName: 区名、obs: その通知の Observation
    render(hit, wardName, obs) {
      let li = rows.get(hit.key);
      if (!li) {
        li = document.createElement('li');
        root.prepend(li);
        rows.set(hit.key, li);
        while (root.children.length > max) {
          const last = root.lastElementChild;
          for (const [k, v] of rows) if (v === last) rows.delete(k);
          last.remove();
        }
      }
      li.className = hit.tier;
      const time = document.createElement('time');
      time.textContent = formatTimeOfDay(obs.receivedAt);
      const observedAt = obs.attrs.snowfall1h?.observedAt ?? obs.dateObserved;
      li.replaceChildren(time, `観測 ${formatHourMinute(observedAt)} ${wardName} ${hit.value}cm/h(${TIER_TEXT[hit.tier]})`);
    },
  };
}
```

`web/src/effects/hit-effects.js`:

```js
// 波紋と条件ヒットの演出を、受信のイベントにつなぐ(必須の演出)。
// - live: 観測点に控えめな波紋(面の更新は main.js が行う)
// - hit(dedupe を通ったもの): 強い波紋とラベル、区の外周の強調、ヒット欄の行
//   live の通知では、条件の演出を出さない(dedupe が 'hit' を出さない)
import { createRipples } from './ripples.js';
import { createHitList } from '../panels/hits.js';

export function installHitEffects(app) {
  const ripples = createRipples(app.fx);
  const hitList = createHitList(document.getElementById('hits'));
  app.ripples = ripples;

  app.on('live', (obs) => {
    const p = app.positions.get(obs.ward);
    if (p) ripples.pulse(p.x, p.y);
  });

  app.on('hit', (hit, obs) => {
    const name = app.wardNames.get(hit.ward) ?? hit.ward;
    const p = app.positions.get(hit.ward);
    if (p) ripples.hit(hit.key, p.x, p.y, hit.tier, `${name} 1時間降雪量 ${hit.value}cm`);
    app.mapLayer.flashHit(hit.ward, hit.tier);
    hitList.render(hit, name, obs);
  });
}
```

- [ ] **Step 2: スタイルを足す**

`web/src/style.css` の末尾に足す:

```css
/* ---- 波紋と条件ヒット(Task 11) ---- */
.ring {
  position: absolute;
  width: 80px;
  height: 80px;
  margin: -40px 0 0 -40px;
  border-radius: 50%;
  border: 1.5px solid rgba(160, 215, 255, 0.55);
  opacity: 0;
  transform: scale(0.1);
  animation: ring-live 1.3s ease-out forwards;
  will-change: transform, opacity;
}

@keyframes ring-live {
  0% {
    opacity: 0.7;
    transform: scale(0.1);
  }
  100% {
    opacity: 0;
    transform: scale(1);
  }
}

.ring.ring-hit {
  width: 300px;
  height: 300px;
  margin: -150px 0 0 -150px;
  border-width: 4px;
  animation: ring-hit 2.2s cubic-bezier(0.15, 0.6, 0.3, 1) forwards;
}

.ring.ring-hit.ge3 {
  border-color: var(--hit3);
  box-shadow: 0 0 22px var(--hit3), inset 0 0 22px var(--hit3);
}

.ring.ring-hit.ge5 {
  border-color: var(--hit5);
  box-shadow: 0 0 26px var(--hit5), inset 0 0 26px var(--hit5);
}

.ring.ring-hit.delayed {
  animation-delay: 0.35s;
}

@keyframes ring-hit {
  0% {
    opacity: 0.95;
    transform: scale(0.08);
  }
  100% {
    opacity: 0;
    transform: scale(1);
  }
}

.hit-label {
  position: absolute;
  z-index: 2;
  white-space: nowrap;
  font-size: 20px;
  font-weight: 700;
  padding: 5px 14px;
  border-radius: 999px;
  color: #1a0b12;
  background: var(--hit3);
  box-shadow: 0 2px 16px rgba(0, 0, 0, 0.6);
  opacity: 0;
  animation: hit-label 4s ease-out forwards;
  will-change: transform, opacity;
}

.hit-label.ge5 {
  color: #ffffff;
  background: var(--hit5);
}

@keyframes hit-label {
  0% {
    opacity: 0;
    transform: translate(-50%, -30px) scale(0.6);
  }
  8% {
    opacity: 1;
    transform: translate(-50%, -64px) scale(1.05);
  }
  80% {
    opacity: 1;
    transform: translate(-50%, -80px);
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -104px);
  }
}
```

- [ ] **Step 3: main.js に組み込む**

`web/src/main.js` の `import { createHud } from './panels/hud.js';` の次の行に足す:

```js
import { installHitEffects } from './effects/hit-effects.js';
```

`// ---- 演出の組み込み(1行ずつ。削るときは、その行を消す) ----` の次の行に足す:

```js
  installHitEffects(app);
```

- [ ] **Step 4: 3つの順序で、1ヒット1演出になることを確かめる**

```bash
npm run lint && npm test && npm run web:build && npm run web:preview
```

Mosquitto は Task 10 のまま起動しておく。順序ごとに、ページを読み直して(`browser_navigate` → `http://127.0.0.1:4173/?debug`)から流す。北区 07:00(5cm、ge5 と ge3 の両方)だけを含む範囲:

```bash
npm run fake-notify -- --from 2025-11-18T06:50:00+09:00 --to 2025-11-18T07:00:00+09:00 --interval 1500 --gap 200 --order strong-first
npm run fake-notify -- --from 2025-11-18T06:50:00+09:00 --to 2025-11-18T07:00:00+09:00 --interval 1500 --gap 0 --bare --order weak-first
npm run fake-notify -- --from 2025-11-18T06:50:00+09:00 --to 2025-11-18T07:00:00+09:00 --interval 1500 --gap 0 --bare --order live-first
```

それぞれの直後に `browser_evaluate` → `() => [...document.querySelectorAll('#hits li')].map((li) => li.className + ' ' + li.textContent)`

期待: どの順序でも1行だけで、`ge5 …観測 07:00 北区 5cm/h(5cm 以上)`。`weak-first` の直後(流し始めて約2秒以内)に `browser_take_screenshot` を撮ると、赤いラベル「北区 1時間降雪量 5cm」が1つだけ出ている(橙のラベルが残っていない)。

ピーク時(14:00 と 15:00 に、複数の区で同時にヒット):

```bash
npm run fake-notify -- --from 2025-11-18T13:50:00+09:00 --to 2025-11-18T15:10:00+09:00 --interval 1500 --gap 100
```

期待: ヒット欄に 14:00 の4件(厚別区 3、北区 3、東区 5、手稲区 5)と 15:00 の5件(中央区 3、東区 3、白石区 3、厚別区 4、手稲区 5)が、新しい順に最大8行。5cm の行は赤、3〜4cm の行は橙。HUD の条件付き購読は「5cm 以上 3 ・ 3cm 以上 9」。live の通知では、観測点に細い波紋が出て、条件の演出(太い波紋とラベル)は出ない。`browser_take_screenshot` を見て、ヒットの区の外周が橙か赤で一時的に強調されることを確かめる。

- [ ] **Step 5: コミット**

```bash
git add web/src/effects/ripples.js web/src/panels/hits.js web/src/effects/hit-effects.js web/src/main.js web/src/style.css
git commit -m "feat: 波紋と、条件ヒットの強い波紋・ラベル・ヒット欄を追加"
```

### レビューゲート D(工程3の必須)

- [ ] **Step 6:** サブエージェントに、ここまでのレビューを依頼する(`git diff main...HEAD`、設計書の 5章と 7.1、申し送り、この計画の Global Constraints と Review Focus を渡す)。観点: (1) 通知の2つの形と、想定外のメッセージで止まらないこと、(2) 重複排除の3つの順序と、live で条件の演出が出ないこと、(3) 観測時刻が `dateObserved` から来ていること、`snowfall1h` の正時の判定、(4) HUD の遅延の定義が smoke と同じであること、(5) 外部への通信がないこと(ビルドした `dist/web/` を `grep -rE "https?://" dist/web/index.html` で確かめ、Playwright の `browser_network_requests` で、気象庁以外の外部への要求がないこと)、(6) 公開されて困るものが入っていないこと。指摘を直してから、次点のタスクへ進む。ここで発表のデモとして成立する(次点・余裕の演出がなくても使える)。

---

## 工程3(次点): 通知ログとダークの仕上げ

### Task 12: 切り替えと通知ログ(`controls.js`、`log.js`)

**Files:**
- Create: `web/src/panels/controls.js`、`web/src/panels/log.js`
- Modify: `web/src/main.js`(4行)、`web/src/style.css`(節を足す)

**Interfaces:**
- Consumes: `app`、`app.ripples`(Task 11)、`live` / `conditional` / `tick` のイベント
- Produces: `installControls(app)`(`app.controls = { addToggle(label, initial, onChange(boolean)) → input, addButton(text, onClick(button)) → button }` を設定する。時計、HUD、波紋の切り替えを持つ)、`installLog(app)`(`#side` に `#log` を足す。切り替え「通知ログ」)
- 注意: `installControls(app)` は、切り替えを足す演出(`installLog`、`installSnow`、`installCircleView`、`installSound`)より前に呼ぶ。`app.controls` がなければ、各演出は切り替えを足さずに動く

- [ ] **Step 1: 切り替えと通知ログを書く**

`web/src/panels/controls.js`:

```js
// 切り替えのパネル(発表者が演出をオン・オフする)。凡例の上に置く。
// ほかの演出は app.controls.addToggle / addButton で、自分の切り替えを足す(なければ足さない)。
export function installControls(app) {
  const panel = document.createElement('section');
  panel.id = 'controls';
  panel.className = 'panel';
  panel.setAttribute('aria-label', '切り替え');
  const toggles = document.createElement('div');
  toggles.className = 'toggles';
  const buttons = document.createElement('div');
  buttons.className = 'buttons';
  panel.append(toggles, buttons);
  document.body.append(panel);

  app.controls = {
    addToggle(label, initial, onChange) {
      const wrap = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = initial;
      input.addEventListener('change', () => onChange(input.checked));
      wrap.append(input, ` ${label}`);
      toggles.append(wrap);
      return input;
    },
    addButton(text, onClick) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = text;
      b.addEventListener('click', () => onClick(b));
      buttons.append(b);
      return b;
    },
  };

  const show = (id) => (v) => {
    document.getElementById(id).hidden = !v;
  };
  app.controls.addToggle('時計', true, show('clocks'));
  app.controls.addToggle('HUD', true, show('hud'));
  app.controls.addToggle('波紋', true, (v) => app.ripples?.setEnabled(v));
}
```

`web/src/panels/log.js`:

```js
// 通知ログ(背景の演出。主役はヒット欄)。受けた通知を新しい順に最大 MAX_ROWS 行。
// 通知ごとに DOM を触らず、tick(4回/秒)でまとめて足す。条件付き購読の通知は、重複排除の前の1件ずつを色付きで出す。
import { formatSnowDepth, formatTemperature, formatTimeOfDay } from '../lib/format.js';

const MAX_ROWS = 40;

export function installLog(app) {
  const side = document.getElementById('side');
  const title = document.createElement('h2');
  title.textContent = '通知ログ(新しい順)';
  const list = document.createElement('ol');
  list.id = 'log';
  side.append(title, list);

  let pending = [];
  const row = (className, receivedAt, ward, text) => {
    const li = document.createElement('li');
    li.className = className;
    const time = document.createElement('time');
    time.textContent = formatTimeOfDay(receivedAt);
    const name = document.createElement('span');
    name.className = 'ward';
    name.textContent = app.wardNames.get(ward) ?? ward;
    li.append(time, name, text);
    pending.push(li);
  };

  let enabled = true;
  app.controls?.addToggle('通知ログ', true, (v) => {
    enabled = v;
    title.hidden = !v;
    list.hidden = !v;
    pending = [];
  });

  app.on('live', (obs, state) => {
    if (enabled) row('live', obs.receivedAt, obs.ward, `積雪深 ${formatSnowDepth(state.snowHeight)} ・ 気温 ${formatTemperature(state.temperature)}`);
  });
  app.on('conditional', (obs) => {
    const threshold = obs.kind === 'ge5' ? 5 : 3;
    const v = obs.attrs.snowfall1h?.value;
    if (enabled) row(obs.kind, obs.receivedAt, obs.ward, `★ snowfall1h=${v ?? '—'}cm(q: snowfall1h>=${threshold})`);
  });
  app.on('tick', () => {
    if (pending.length === 0) return;
    list.prepend(...pending.reverse());
    pending = [];
    while (list.children.length > MAX_ROWS) list.lastElementChild.remove();
  });
}
```

- [ ] **Step 2: スタイルを足す**

`web/src/style.css` の末尾に足す:

```css
/* ---- 切り替えと通知ログ(Task 12) ---- */
[hidden] {
  display: none !important;
}

#controls {
  left: 12px;
  bottom: 84px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: var(--dim);
  padding: 8px 12px;
}

#controls label {
  margin-right: 10px;
  white-space: nowrap;
}

#controls button {
  margin-right: 6px;
  padding: 4px 10px;
  font-size: 12px;
  color: var(--text);
  background: #16233a;
  border: 1px solid var(--line);
  border-radius: 6px;
  cursor: pointer;
}

#log {
  flex: 1;
  margin: 0;
  padding: 0;
  list-style: none;
  overflow: hidden;
}

#log li {
  padding: 2px 0;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  animation: row-in 0.35s ease-out;
}

#log li time {
  margin-right: 6px;
  color: var(--dim);
}

#log li .ward {
  display: inline-block;
  width: 4em;
  color: var(--accent);
}

#log li.ge3 {
  color: var(--hit3);
}

#log li.ge5 {
  color: var(--hit5);
}

@keyframes row-in {
  from {
    background: rgba(127, 209, 255, 0.25);
  }
  to {
    background: transparent;
  }
}
```

- [ ] **Step 3: main.js に組み込む**

import の並びの末尾(`import { installHitEffects } …` の次)に足す:

```js
import { installControls } from './panels/controls.js';
import { installLog } from './panels/log.js';
```

`installHitEffects(app);` の次の行に足す:

```js
  installControls(app);
  installLog(app);
```

- [ ] **Step 4: 画面で確かめる**

```bash
npm run lint && npm test && npm run web:build && npm run web:preview
```

`browser_navigate` → `http://127.0.0.1:4173/?debug` のあと、別の端末で `npm run fake-notify -- --from 2025-11-18T13:50:00+09:00 --to 2025-11-18T14:30:00+09:00 --interval 800 --gap 100`。

期待: 右の欄のヒット欄の下に「通知ログ(新しい順)」があり、1行に「受信時刻 区名 積雪深 Ncm ・ 気温 N℃」。条件付き購読の通知は「★ snowfall1h=5cm(q: snowfall1h>=5)」の形で色付き(1件の書き込みで、ge5 と ge3 の2行が出るのが正しい。ログは重複排除の前の通知を出す)。行は 40 を超えない(`browser_evaluate` → `() => document.querySelectorAll('#log li').length` が 40 以下)。左下の切り替えで、時計、HUD、ログを消すと、その部分だけが消え、出典(下端)は消えない。「波紋」を外すと細い波紋は出なくなり、条件ヒットのラベルは出続ける。

- [ ] **Step 5: コミット**

```bash
git add web/src/panels/controls.js web/src/panels/log.js web/src/main.js web/src/style.css
git commit -m "feat: 演出の切り替えと、通知ログを追加"
```

### Task 13: ダークの仕上げと、区の境界のすき間の確認

区の境界の座標を小数4桁に丸めたため、隣の区との間に細いすき間(背景の色の線)が出る可能性がある(申し送り 10節)。境界線のレイヤー(`ward-line`、1px、`#3d4f70`)が、すき間を覆うことを期待しているが、画面で確かめる。あわせて、発表の画面の解像度で、パネルと地図の重なり、ラベルの読みやすさを確かめる。

**Files:**
- Modify(判定による): `web/src/map-layer.js`(すき間を埋めるレイヤー)

**Interfaces:**
- Consumes: Task 9〜12 の画面
- Produces: 判定の記録(コミットのメッセージ、または PR の本文に書く)。すき間が見えた場合は、`ward-fill` と `ward-line` の間に `ward-seam` レイヤー

- [ ] **Step 1: すき間を確かめる**

```bash
npm run web:build && npm run web:preview
```

`browser_resize`(1920 × 1080)、`browser_navigate` → `http://127.0.0.1:4173/`。別の端末で、積雪の多い時間を流す(北区が白に近く、隣の区との差が大きい):

```bash
npm run fake-notify -- --from 2025-11-18T15:50:00+09:00 --to 2025-11-18T16:00:00+09:00 --interval 1000 --gap 0
```

1. 通常の表示: `browser_take_screenshot`(`filename: .playwright-mcp/seam-normal.png`、`scale: device`)。
2. 境界線を消して、拡大した表示: `browser_evaluate` → `() => { const m = window.__sapporo.app.mapLayer.map; m.setPaintProperty('ward-line', 'line-opacity', 0); m.jumpTo({ center: [141.36, 43.10], zoom: m.getZoom() + 3 }); }`、少し待ってから `browser_take_screenshot`(`filename: .playwright-mcp/seam-zoom.png`、`scale: device`)。

判定:
- 1 で、隣り合う区の間に、背景の色(`#070d18`、ほぼ黒)の線や点が見えない → すき間はない(2 で細い線が見えても、境界線が覆っている)。Step 2 は不要。判定の結果を、Step 3 のコミットのメッセージに書く。
- 1 で、背景の色の線や点が見える → Step 2 の修正を入れる。
- 2 で、境界線を消しても線が見えない → 丸めによるすき間はない(記録だけ)。

確認したら、ページを読み直して(`browser_navigate`)元の表示に戻し、スクリーンショットをリポジトリの外へ移す(`mv .playwright-mcp/seam-*.png ~/sapporo-web-shots/`)。

- [ ] **Step 2: (すき間が見えた場合だけ)面と同じ色の線で埋める**

`web/src/map-layer.js` の `map.addLayer({ id: 'ward-fill', … });` の次の行に足す(面と同じ色の 1.5px の線を、境界線の下に引く):

```js
      map.addLayer({ id: 'ward-seam', type: 'line', source: 'wards', paint: { 'line-color': snowColorExpression(), 'line-width': 1.5 } });
```

Step 1 の 1 をもう一度撮り、線や点が消えたことを確かめる。

- [ ] **Step 3: 発表の解像度で確かめる**

`browser_resize` を 1920 × 1080、1280 × 720 の順に変え、それぞれ `browser_navigate` → `http://127.0.0.1:4173/` のあと、ピーク時(`npm run fake-notify -- --from 2025-11-18T14:50:00+09:00 --to 2025-11-18T15:10:00+09:00 --interval 1500 --gap 100`)を流して `browser_take_screenshot`(`filename: .playwright-mcp/res-<幅>.png`)。

確かめること(すべての解像度で):
- 10区の観測点とラベルが、左の時計・HUD と右の欄に隠れていない(南区の南側は切れてよい。設計書 5.5)。
- 北区(35cm 近く、最も明るい色)の上でも、ラベルの白い文字が読める。
- タイトル「札幌市10区の積雪」と、下端の出典が、ほかの要素に隠れていない。
- 1280 × 720 で出典の文が切れて「…」になる場合は、`#attribution` の `white-space: nowrap;` を消して2行にする(`web/src/style.css`)。

確認したら、スクリーンショットをリポジトリの外へ移す。

- [ ] **Step 4: コミット(変更があった場合)**

```bash
npm run lint && npm test && npm run web:build
git add web/src/map-layer.js web/src/style.css
git commit -m "fix: 区の境界のすき間と、発表の解像度での表示を確認して直す(判定: <Step 1 の結果を1行で>)"
```

変更がなかった場合はコミットせず、判定を Task 15 の README の作業と一緒に、PR の本文に書く。

### Task 14: 当日の最新値(`jma.js`、`live-widget.js`)(工程4)

**Files:**
- Create: `web/src/lib/jma.js`、`web/src/live-widget.js`、`test/web/fixtures/jma-point-14163-20261004_21.json`
- Modify: `web/src/main.js`(2行)、`web/src/style.css`(節を足す)
- Test: `test/web/jma.test.mjs`

**Interfaces:**
- Consumes: `app.config.liveWidget`(Task 2、10)
- Produces: `parseLatestTime(text, station = '14163') → { key: 'YYYYMMDDhhmmss', url } | null`、`parsePoint(json, latestKey) → { time, temperature, wind, windDirection } | null`、`widgetText(point) → string`、`loadLatest(fetchImpl = fetch, { timeoutMs = 8000 }) → Promise<point | null>`(例外を投げない)、`LATEST_TIME_URL`、`WIND_DIRECTIONS`、`installLiveWidget(app)`

2026-10-04 の実測(このタスクの前提):
- `https://www.jma.go.jp/bosai/amedas/data/latest_time.txt` は `2026-10-04T21:00:00+09:00` の形。`access-control-allow-origin: *`。
- 点のファイルは3時間ごと(`…/point/14163/20261004_18.json` は 18:00〜20:50 の18件、`_21.json` は 21:00 の1件、`_19.json` は 404)。`access-control-allow-origin: *`。
- 値は `[値, 品質]` の組。気温 `temp: [12.0, 0]`、風速 `wind: [0.9, 0]`、風向 `windDirection: [8, 0]`(16方位の番号。8 は南)。積雪のキーはすでにあるが、`snow: [null, 5]`、`snow1h: [0, 6]` のように品質が 0 でない。品質が 0 の値だけを使う。

- [ ] **Step 1: 実データをテストの材料として置く**

`test/web/fixtures/jma-point-14163-20261004_21.json`(2026-10-04 21:00 JST に取得したもの。1行):

```json
{"20261004210000":{"prefNumber":14,"observationNumber":163,"pressure":[1018.4,0],"normalPressure":[1021.6,0],"temp":[12.0,0],"humidity":[85,0],"visibility":[20000.0,0],"snow":[null,5],"weather":[0,0],"snow1h":[0,6],"snow6h":[0,6],"snow12h":[0,6],"snow24h":[0,6],"sun10m":[0,0],"sun1h":[0.0,0],"precipitation10m":[0.0,0],"precipitation1h":[0.0,0],"precipitation3h":[0.0,0],"precipitation24h":[0.0,0],"windDirection":[8,0],"wind":[0.9,0],"maxTempTime":{"hour":3,"minute":37},"maxTemp":[18.3,0],"minTempTime":{"hour":20,"minute":2},"minTemp":[7.9,0],"gustTime":{"hour":4,"minute":41},"gustDirection":[14,0],"gust":[10.2,0]}}
```

- [ ] **Step 2: 失敗するテストを書く**

`test/web/jma.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseLatestTime, parsePoint, widgetText, loadLatest, WIND_DIRECTIONS, LATEST_TIME_URL } from '../../web/src/lib/jma.js';

// 2026-10-04 に取得した実データ(https://www.jma.go.jp/bosai/amedas/data/point/14163/20261004_21.json)
const sample = JSON.parse(readFileSync(new URL('./fixtures/jma-point-14163-20261004_21.json', import.meta.url), 'utf8'));

test('latest_time.txt から、キーと3時間ごとのファイルの URL を作る', () => {
  assert.equal(LATEST_TIME_URL, 'https://www.jma.go.jp/bosai/amedas/data/latest_time.txt');
  assert.deepEqual(parseLatestTime('2026-10-04T21:00:00+09:00\n'), {
    key: '20261004210000',
    url: 'https://www.jma.go.jp/bosai/amedas/data/point/14163/20261004_21.json',
  });
  assert.equal(parseLatestTime('2026-10-04T20:50:00+09:00').url, 'https://www.jma.go.jp/bosai/amedas/data/point/14163/20261004_18.json');
  assert.equal(parseLatestTime('2026-10-05T02:10:00+09:00').url, 'https://www.jma.go.jp/bosai/amedas/data/point/14163/20261005_00.json');
});

test('latest_time.txt が想定外の形なら null', () => {
  for (const t of ['', '<html>', '2026-10-04T21:00:00Z', '2026-10-04 21:00', null, undefined]) assert.equal(parseLatestTime(t), null, String(t));
});

test('実データ: 気温と風を読み、積雪(品質が 0 でない)は読まない', () => {
  const p = parsePoint(sample, '20261004210000');
  assert.deepEqual(p, { time: '2026-10-04 21:00 JST', temperature: 12, wind: 0.9, windDirection: '南' });
  assert.equal('snow' in p, false);
  assert.equal(widgetText(p), '気温 12.0℃ ・ 風 南 0.9m/s');
});

test('latestKey 以前で最も新しい観測を使う', () => {
  const json = {
    '20261004180000': { temp: [15, 0], wind: [2, 0], windDirection: [16, 0] },
    '20261004181000': { temp: [14.5, 0], wind: [1.5, 0], windDirection: [0, 0] },
    '20261004182000': { temp: [14, 0], wind: [1, 0], windDirection: [4, 0] },
  };
  assert.equal(parsePoint(json, '20261004181000').temperature, 14.5);
  assert.equal(parsePoint(json, '20261004181000').windDirection, '静穏');
  assert.equal(parsePoint(json, '20261004235000').windDirection, '東');
  assert.equal(parsePoint(json).time, '2026-10-04 18:20 JST');
});

test('品質が 0 でない値と、壊れた値は使わない', () => {
  const p = parsePoint({ '20261004210000': { temp: [12, 1], wind: [3, 0], windDirection: [99, 0] } }, '20261004210000');
  assert.deepEqual(p, { time: '2026-10-04 21:00 JST', temperature: null, wind: 3, windDirection: null });
  assert.equal(widgetText(p), '気温 — ・ 風 3.0m/s');
});

test('想定外の形は null(ウィジェットを出さない)', () => {
  const cases = [null, 'x', [], {}, { foo: 1 }, { '20261004210000': null }, { '20261004210000': { temp: [null, 0], wind: ['1', 0] } }];
  for (const c of cases) assert.equal(parsePoint(c, '20261004210000'), null, JSON.stringify(c));
  // latestKey より新しいキーしかない
  assert.equal(parsePoint(sample, '20261004205000'), null);
});

test('16方位の表', () => {
  assert.equal(WIND_DIRECTIONS.length, 17);
  assert.equal(WIND_DIRECTIONS[8], '南');
  assert.equal(WIND_DIRECTIONS[16], '北');
});

// 取得の差し替え: URL ごとに応答を返す(タイマーを残さないよう、すぐに解決する)
const fakeFetch = (routes) => async (url) => {
  const r = routes[url];
  if (r instanceof Error) throw r;
  if (r === undefined) return { ok: false, status: 404, text: async () => 'not found' };
  return { ok: true, status: 200, text: async () => r };
};
const POINT_URL = 'https://www.jma.go.jp/bosai/amedas/data/point/14163/20261004_21.json';

test('loadLatest: latest_time → 点のファイルの順に取り、読んだ値を返す', async () => {
  const p = await loadLatest(fakeFetch({ [LATEST_TIME_URL]: '2026-10-04T21:00:00+09:00', [POINT_URL]: JSON.stringify(sample) }));
  assert.equal(p.temperature, 12);
});

test('loadLatest: どの失敗でも null(例外にしない)', async () => {
  assert.equal(await loadLatest(fakeFetch({})), null); // 404
  assert.equal(await loadLatest(fakeFetch({ [LATEST_TIME_URL]: new TypeError('Failed to fetch') })), null); // ネットワークなし
  assert.equal(await loadLatest(fakeFetch({ [LATEST_TIME_URL]: '<html>maintenance</html>' })), null);
  assert.equal(await loadLatest(fakeFetch({ [LATEST_TIME_URL]: '2026-10-04T21:00:00+09:00' })), null); // 点のファイルが 404
  assert.equal(await loadLatest(fakeFetch({ [LATEST_TIME_URL]: '2026-10-04T21:00:00+09:00', [POINT_URL]: '{broken' })), null);
  assert.equal(await loadLatest(fakeFetch({ [LATEST_TIME_URL]: '2026-10-04T21:00:00+09:00', [POINT_URL]: '{"x":1}' })), null);
});
```

```bash
node --test test/web/jma.test.mjs
```

期待: FAIL(`Cannot find module '…/web/src/lib/jma.js'`)。

- [ ] **Step 3: 実装する**

`web/src/lib/jma.js`:

```js
// 気象庁アメダス「札幌」(観測所 14163)の最新値の読み取り(純関数)。
// 取得元は気象庁ホームページの bosai の JSON。公式の API 仕様ではないため、形が変わる可能性がある。
// 読めない形のときは null を返し、ウィジェットを出さない(主画面には影響させない)。
//
// 1. latest_time.txt: 「2026-10-04T21:00:00+09:00」のような最新の観測時刻(JST)
// 2. point/14163/<YYYYMMDD>_<HH>.json: 3時間ごとのファイル(HH は 00、03、…、21)。
//    キーは「YYYYMMDDhhmmss」(JST)、値は { temp: [値, 品質], wind: [...], windDirection: [...], snow: [...], … }。
//    品質の 0 だけを採用する(2026-10-04 の実データでは、積雪は snow: [null, 5]、snow1h: [0, 6] のように 0 以外)。
// 積雪は、冬季の観測が再開してから形を確かめる(設計書 5.4)。それまでは気温と風だけを表示する。

export const JMA_AMEDAS_BASE = 'https://www.jma.go.jp/bosai/amedas/data';
export const SAPPORO_STATION = '14163';
export const LATEST_TIME_URL = `${JMA_AMEDAS_BASE}/latest_time.txt`;

const LATEST_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\+09:00$/;

// 16方位(風向の値は 0〜16。0 は静穏、16 は北)
export const WIND_DIRECTIONS = Object.freeze([
  '静穏', '北北東', '北東', '東北東', '東', '東南東', '南東', '南南東',
  '南', '南南西', '南西', '西南西', '西', '西北西', '北西', '北北西', '北',
]);

// latest_time.txt の本文から、観測時刻のキー(YYYYMMDDhhmmss)と、点のファイルの URL を作る
export function parseLatestTime(text, station = SAPPORO_STATION) {
  const m = LATEST_RE.exec(String(text ?? '').trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const block = String(Math.floor(Number(h) / 3) * 3).padStart(2, '0');
  return {
    key: `${y}${mo}${d}${h}${mi}${s}`,
    url: `${JMA_AMEDAS_BASE}/point/${station}/${y}${mo}${d}_${block}.json`,
  };
}

// [値, 品質] の組から、品質 0 の数だけを取り出す
function good(pair) {
  if (!Array.isArray(pair) || pair[1] !== 0) return null;
  return typeof pair[0] === 'number' && Number.isFinite(pair[0]) ? pair[0] : null;
}

// 点のファイルの JSON から、latestKey 以前で最も新しい観測を読む。
// 戻り値: { time: '2026-10-04 21:00 JST', temperature, wind, windDirection } | null(気温も風もなければ null)
export function parsePoint(json, latestKey) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  const keys = Object.keys(json).filter((k) => /^\d{14}$/.test(k) && (!latestKey || k <= latestKey)).sort();
  const key = keys.at(-1);
  if (!key) return null;
  const r = json[key];
  const temperature = good(r?.temp);
  const wind = good(r?.wind);
  if (temperature === null && wind === null) return null;
  const dir = good(r?.windDirection);
  const windDirection = Number.isInteger(dir) && dir >= 0 && dir <= 16 ? WIND_DIRECTIONS[dir] : null;
  return {
    time: `${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6, 8)} ${key.slice(8, 10)}:${key.slice(10, 12)} JST`,
    temperature,
    wind,
    windDirection,
  };
}

// ウィジェットの本文: 「気温 12.0℃ ・ 風 南 0.9m/s」
export function widgetText(p) {
  const t = Number.isFinite(p.temperature) ? `${p.temperature.toFixed(1)}℃` : '—';
  const w = Number.isFinite(p.wind) ? `${p.windDirection ?? ''} ${p.wind.toFixed(1)}m/s`.trim() : '—';
  return `気温 ${t} ・ 風 ${w}`;
}

// 取得して読む。どんな失敗(ネットワーク、タイムアウト、HTTP の失敗、形の違い)でも null を返し、例外にしない。
// fetchImpl はテストで差し替える。タイマーは、応答のあとに必ず止める(テストのプロセスを残さない)。
export async function loadLatest(fetchImpl = globalThis.fetch, { timeoutMs = 8000 } = {}) {
  const get = async (url) => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const r = await fetchImpl(url, { signal: ctl.signal, cache: 'no-store' });
      if (!r.ok) return null;
      return await r.text();
    } finally {
      clearTimeout(timer);
    }
  };
  try {
    const latest = parseLatestTime(await get(LATEST_TIME_URL));
    if (!latest) return null;
    const text = await get(latest.url);
    if (text === null) return null;
    return parsePoint(JSON.parse(text), latest.key);
  } catch {
    return null;
  }
}
```

```bash
node --test test/web/jma.test.mjs && npx -y node@22 --test test/web/jma.test.mjs
```

期待: どちらの Node でも 9件とも PASS(テストが終わったあとに、プロセスが残らない)。

- [ ] **Step 4: ウィジェットを書いて、組み込む**

`web/src/live-widget.js`:

```js
// 当日の最新値(気象庁アメダス「札幌」)。右の欄の下に小さく出す(設計書 5.4)。
// 取れたときだけ表示し、出典(気象庁)と加工した旨を、すぐ下に書く。
// 取れなければ、出典も含めて何も出さない。主画面の動作には関わらない(受信や演出とは独立に動く)。
// ?live=off で取りに行かない(ネットワークのない会場、通しの確認)。
import { loadLatest, widgetText } from './lib/jma.js';

const REFRESH_MS = 10 * 60 * 1000;

export function installLiveWidget(app) {
  if (!app.config.liveWidget) return;
  const panel = document.createElement('section');
  panel.id = 'live-widget';
  panel.hidden = true;
  panel.setAttribute('aria-label', '当日の最新値');
  const heading = document.createElement('h2');
  heading.textContent = 'いまの札幌(気象庁アメダス)';
  const value = document.createElement('div');
  value.className = 'live-value';
  const meta = document.createElement('div');
  meta.className = 'live-meta';
  const source = document.createElement('div');
  source.className = 'live-source';
  source.textContent = '出典: 気象庁ホームページ(アメダス「札幌」)の値を加工して表示';
  panel.append(heading, value, meta, source);
  document.getElementById('side').append(panel);

  const refresh = async () => {
    const p = await loadLatest();
    if (!p) {
      panel.hidden = true;
      return;
    }
    value.textContent = widgetText(p);
    meta.textContent = `${p.time} の観測`;
    panel.hidden = false;
  };
  refresh();
  setInterval(refresh, REFRESH_MS);
}
```

`web/src/style.css` の末尾に足す:

```css
/* ---- 当日の最新値(Task 14) ---- */
#live-widget {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--line);
}

#live-widget .live-value {
  font-size: 15px;
  font-variant-numeric: tabular-nums;
}

#live-widget .live-meta,
#live-widget .live-source {
  font-size: 11px;
  color: var(--dim);
}
```

`web/src/main.js` の import の並びの末尾に足す:

```js
import { installLiveWidget } from './live-widget.js';
```

`installLog(app);` の次の行に足す:

```js
  installLiveWidget(app);
```

- [ ] **Step 5: 取れるとき、取れないときを確かめる**

```bash
npm run lint && npm test && npm run web:build && npm run web:preview
```

1. ネットワークのある状態で `browser_navigate` → `http://127.0.0.1:4173/`、10秒待って `browser_evaluate` → `() => ({ hidden: document.getElementById('live-widget').hidden, text: document.getElementById('live-widget').textContent })`。期待: `hidden: false`、「いまの札幌(気象庁アメダス)気温 N℃ ・ 風 …m/s …の観測 出典: 気象庁ホームページ(アメダス「札幌」)の値を加工して表示」。
2. 取得の失敗: `browser_navigate` → `http://127.0.0.1:4173/?live=off`。期待: `document.getElementById('live-widget')` が null(取りに行かない)。ネットワークを切った状態(Wi-Fi をオフ)で `http://127.0.0.1:4173/` を開いた場合も、ウィジェットと出典が出ず、`browser_console_messages`(level: error)に気象庁の取得の失敗以外のエラーがなく、地図、時計、HUD はふつうに動く(fake-notify を流して確かめる)。

- [ ] **Step 6: コミット**

```bash
git add web/src/lib/jma.js web/src/live-widget.js web/src/main.js web/src/style.css test/web/jma.test.mjs test/web/fixtures
git commit -m "feat: 当日の最新値(気象庁アメダス「札幌」の気温と風)を、取れたときだけ出典つきで表示する"
```

### Task 15: README「地図アプリ」(工程4)

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: Task 1〜14 のコマンドと URL パラメーター
- Produces: README の「地図アプリ」の節。冒頭の「地図アプリは作業中です。」を消す

- [ ] **Step 1: 冒頭を直す**

`README.md` の2段落目の末尾の「地図アプリは作業中です。」を消す。

- [ ] **Step 2: 「地図アプリ」の節を足す**

「### 再生の速度」の直前(「動かし方」の節のコマンドの説明のあと、「止めるときは…」の段落の後ろ)に、次を入れる:

````markdown
### 地図アプリ

通知を地図に表示する Web アプリです(`web/`。Vite と MapLibre GL JS、mqtt.js)。地図のタイルは使わず、ビルドしたものは外部への通信なしで動きます(外部へ通信するのは、当日の最新値(気象庁)だけです)。

```bash
npm run web:build      # dist/web/ にビルドする
npm run web:preview    # http://127.0.0.1:4173/ で配信する(127.0.0.1 だけで待ち受けます)
```

ブラウザーで http://127.0.0.1:4173/ を開いてから、`npm run setup` と `npm run replay` を実行します。
開発中は `npm run web:dev`(http://127.0.0.1:5173/)を使います。

| URL パラメーター | 既定値 | 内容 |
|---|---|---|
| `mqtt` | `ws://127.0.0.1:9001` | MQTT の WebSocket の URL(例: `?mqtt=ws://127.0.0.1:9001`) |
| `debug` | なし | 受信した通知を記録する(`window.__sapporo.received`) |
| `live` | なし | `?live=off` で、当日の最新値(気象庁)を取りに行かない |

画面の見方:

- 観測時刻: いま届いた通知の観測時刻(`dateObserved`)。2025年11月の時刻が進みます。現在時刻は、この PC の時計です。
- 配信の遅延: 通知を受けた時刻 − 書き込んだ時刻(`sentAt`)。ブローカーと地図アプリが同じ PC で動いていることが前提です。
- 条件付き購読の通知: 1時間降雪量が 3cm 以上(橙)、5cm 以上(赤)の区。同じ書き込みの2つの購読の通知は、強い方の1件にまとめます。
- 区の色: 積雪深(0、5、15、25、35cm の刻み)。通知をまだ受けていない区は灰色です。気温が欠測のとき(または1時間以上古いとき)は「—」と表示します。
- 当日の最新値: 会場のネットワークがあるときだけ、気象庁のアメダス(札幌)の気温と風を表示します。取れないときは何も表示しません。

ブローカーなしで画面だけを確かめるときは、Mosquitto だけを起動して、通知と同じ形のメッセージを流せます(配信の遅延の測定には使えません)。

```bash
docker compose -f compose/docker-compose.yml up -d mosquitto
npm run fake-notify -- --from 2025-11-18T13:50:00+09:00 --to 2025-11-18T15:10:00+09:00 --interval 1500
npm run fake-notify -- --bare --order weak-first    # 封筒のない形、弱い購読が先に届く場合
```

画面の確認で撮ったスクリーンショットは、リポジトリに入れないでください(公開リポジトリのため)。
````

- [ ] **Step 3: 出典の節を確かめる**

`data/ATTRIBUTION.md` の「当日の最新の気象値(気象庁)」の節が、Task 14 の表示(出典と、加工した旨)と食い違わないことを読んで確かめる(変更は不要のはず)。

- [ ] **Step 4: コミット**

```bash
git add README.md
git commit -m "docs: README に地図アプリの節(起動、URL パラメーター、画面の見方)を追加"
```

### レビューゲート E(次点)

- [ ] **Step 5:** サブエージェントに、Task 12〜15 のレビューを依頼する(`git diff <ゲート D のコミット>..HEAD`、設計書 5.2〜5.4、6.4、7.1)。観点: (1) 当日の最新値が失敗しても主画面に影響せず、出典も出ないこと、(2) 気象庁の取得以外に外部への通信がないこと、(3) 出典が常に見えること、(4) README の手順が、きれいな環境(`git clone` → `npm ci` → `npm run web:build`)で通ること、(5) 公開されて困るものが入っていないこと。

---

## 工程3(余裕があれば): 雪の粒、円表示、音

この3つは、それぞれ単独で外せる。外すときは、そのタスクを飛ばす(実装後に外すときは、main.js の import と `install〜(app);` の1行ずつを消す)。

### Task 16: 雪の粒(`intensity.js`、`snow.js`)

**Files:**
- Create: `web/src/lib/intensity.js`、`web/src/effects/snow.js`
- Modify: `web/src/main.js`(2行)、`web/src/style.css`(節を足す)
- Test: `test/web/intensity.test.mjs`

**Interfaces:**
- Consumes: `live(obs, wardState)` のイベント(`wardState.snowfall1h`、`snowDelta1h`、`temperature`、`windSpeed`。Task 5)、`app.positions`、`app.fx`、`app.controls`(Task 12)
- Produces: `snowIntensity({ snowfall1h, snowDelta1h, temperature }) → 0..1`、`canvasScale(dpr) → min(dpr, 1.5)`、`approach(current, target, dtSec, rate = 1.5)`、`spawnCount(intensity, dtSec, carry, perSecond = 200) → { count, carry }`、`RAIN_ABOVE_C = 3`、`installSnow(app)`(`app.snow = { count() }`)

- [ ] **Step 1: 失敗するテストを書く**

`test/web/intensity.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snowIntensity, canvasScale, approach, spawnCount } from '../../web/src/lib/intensity.js';

test('降雪量 5cm で最大、2cm で 0.4', () => {
  assert.equal(snowIntensity({ snowfall1h: 5, temperature: -1 }), 1);
  assert.equal(snowIntensity({ snowfall1h: 8, temperature: -1 }), 1);
  assert.equal(snowIntensity({ snowfall1h: 2, temperature: -1 }), 0.4);
});

test('積雪深の増分が降雪量より大きければ、増分を使う。減少は 0', () => {
  assert.equal(snowIntensity({ snowfall1h: 1, snowDelta1h: 3, temperature: 0 }), 0.6);
  assert.equal(snowIntensity({ snowfall1h: 0, snowDelta1h: -4, temperature: 0 }), 0);
});

test('気温が 3℃ を超えると 0。ちょうど 3℃ は降る', () => {
  assert.equal(snowIntensity({ snowfall1h: 5, temperature: 3.1 }), 0);
  assert.equal(snowIntensity({ snowfall1h: 5, temperature: 3 }), 1);
});

test('気温が欠測(null)なら、降雪の値だけで決める', () => {
  assert.equal(snowIntensity({ snowfall1h: 5, temperature: null }), 1);
  assert.equal(snowIntensity({ snowfall1h: null, snowDelta1h: null, temperature: null }), 0);
  assert.equal(snowIntensity(), 0);
});

test('canvas の倍率は 1.5 まで', () => {
  assert.equal(canvasScale(1), 1);
  assert.equal(canvasScale(2), 1.5);
  assert.equal(canvasScale(3), 1.5);
  assert.equal(canvasScale(1.25), 1.25);
  assert.equal(canvasScale(undefined), 1);
  assert.equal(canvasScale(0), 1);
});

test('approach: 目標へ近づき、行き過ぎない', () => {
  assert.ok(Math.abs(approach(0, 1, 0.1) - 0.15) < 1e-9);
  assert.equal(approach(0, 1, 10), 1);
  assert.equal(approach(1, 0, -1), 1);
});

test('spawnCount: 端数を持ち越す、弱すぎれば 0', () => {
  assert.deepEqual(spawnCount(1, 1 / 60, 0, 120), { count: 2, carry: 0 });
  const a = spawnCount(0.5, 1 / 60, 0, 120);
  assert.equal(a.count, 1);
  const b = spawnCount(0.5, 1 / 60, a.carry, 120);
  assert.equal(a.count + b.count, 2);
  assert.deepEqual(spawnCount(0.01, 1, 0.5), { count: 0, carry: 0 });
});
```

```bash
node --test test/web/intensity.test.mjs
```

期待: FAIL(`Cannot find module '…/web/src/lib/intensity.js'`)。

- [ ] **Step 2: 強さの計算を書く**

`web/src/lib/intensity.js`:

```js
// 雪の粒の強さ(純関数)。
// 強さ = max(降雪量 snowfall1h, 積雪深の1時間の増分(正の分だけ)) / 5cm を 0〜1 に収めたもの。
// 気温が 3℃ を超えるときは 0(雨とみなす)。気温が欠測のときは、降雪の値だけで決める(欠測で粒を止めない)。

export const RAIN_ABOVE_C = 3;
export const FULL_AT_CM = 5;
export const MAX_CANVAS_SCALE = 1.5;

export function snowIntensity({ snowfall1h = null, snowDelta1h = null, temperature = null } = {}) {
  if (Number.isFinite(temperature) && temperature > RAIN_ABOVE_C) return 0;
  const fall = Number.isFinite(snowfall1h) && snowfall1h > 0 ? snowfall1h : 0;
  const delta = Number.isFinite(snowDelta1h) && snowDelta1h > 0 ? snowDelta1h : 0;
  return Math.min(1, Math.max(fall, delta) / FULL_AT_CM);
}

// canvas の描画倍率。Retina(DPR 2)でも 1.5 に抑える(設計書 5.3)
export function canvasScale(devicePixelRatio) {
  const d = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  return Math.min(d, MAX_CANVAS_SCALE);
}

// 表示中の強さを、目標へなめらかに近づける(dtSec: 前のフレームからの秒、rate: 1秒あたりの追従の速さ)
export function approach(current, target, dtSec, rate = 1.5) {
  return current + (target - current) * Math.min(1, Math.max(0, dtSec) * rate);
}

// このフレームで出す粒の数。carry は端数の持ち越し。perSecond は強さ 1 のときの、区あたり毎秒の粒の数
export function spawnCount(intensity, dtSec, carry, perSecond = 200) {
  if (!(intensity > 0.02)) return { count: 0, carry: 0 };
  const total = carry + intensity * perSecond * Math.max(0, dtSec);
  const count = Math.floor(total);
  return { count, carry: total - count };
}
```

```bash
node --test test/web/intensity.test.mjs && npx -y node@22 --test test/web/intensity.test.mjs
```

期待: どちらの Node でも 7件とも PASS。

- [ ] **Step 3: 粒の描画を書いて、組み込む**

`web/src/effects/snow.js`:

```js
// 雪の粒(余裕があれば)。2D canvas を地図とラベルの間に重ねる。
// 区ごとに、観測点の上空から粒を落とす。強さは lib/intensity.js(降雪量と積雪深の増分、3℃ を超えたら 0)。
// 描画の倍率は min(devicePixelRatio, 1.5)(Retina での負荷を抑える。設計書 5.3)。
import { snowIntensity, canvasScale, approach, spawnCount } from '../lib/intensity.js';

const MAX_PARTICLES = 3000;

export function installSnow(app) {
  const canvas = document.createElement('canvas');
  canvas.id = 'snow';
  canvas.setAttribute('aria-hidden', 'true');
  app.fx.before(canvas);
  const ctx = canvas.getContext('2d');

  let width = 0;
  let height = 0;
  const fit = () => {
    const s = canvasScale(window.devicePixelRatio);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * s);
    canvas.height = Math.round(height * s);
    ctx.setTransform(s, 0, 0, s, 0, 0);
  };
  fit();
  window.addEventListener('resize', fit);

  const emitters = new Map(); // 区 -> { current, target, carry, vx }
  const particles = [];
  let enabled = true;
  app.controls?.addToggle('雪の粒', true, (v) => {
    enabled = v;
    if (!v) particles.length = 0;
  });

  app.on('live', (obs, state) => {
    const e = emitters.get(obs.ward) ?? { current: 0, target: 0, carry: 0, vx: 0 };
    e.target = snowIntensity(state);
    // 風下へ流す(風向は風の吹いてくる方位。画面の右が東)
    const speed = state.windSpeed ?? 0;
    const dir = obs.attrs.windDirection?.value;
    e.vx = Number.isFinite(dir) ? -Math.sin((dir * Math.PI) / 180) * speed * 9 : 0;
    emitters.set(obs.ward, e);
  });

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    ctx.clearRect(0, 0, width, height);
    if (enabled) {
      for (const [ward, e] of emitters) {
        e.current = approach(e.current, e.target, dt);
        const p = app.positions.get(ward);
        if (!p) continue;
        const { count, carry } = spawnCount(e.current, dt, e.carry);
        e.carry = carry;
        for (let i = 0; i < count && particles.length < MAX_PARTICLES; i++) {
          particles.push({
            x: p.x + (Math.random() + Math.random() + Math.random() - 1.5) * 110,
            y: p.y - 150 + Math.random() * 60,
            vx: e.vx * (0.6 + Math.random() * 0.8),
            vy: (70 + 90 * e.current) * (0.7 + Math.random() * 0.6),
            r: 0.9 + Math.random() * 1.9,
            bottom: p.y + 170,
          });
        }
      }
      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.beginPath();
      for (const q of particles) {
        ctx.moveTo(q.x + q.r, q.y);
        ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2);
      }
      ctx.fill();
      for (let i = particles.length - 1; i >= 0; i--) {
        const q = particles[i];
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        if (q.y > q.bottom) {
          particles[i] = particles[particles.length - 1];
          particles.pop();
        }
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  app.snow = { count: () => particles.length };
}
```

`web/src/style.css` の末尾に足す:

```css
/* ---- 雪の粒(Task 16) ---- */
#snow {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 2;
}
```

`web/src/main.js` の import の並びの末尾に足す:

```js
import { installSnow } from './effects/snow.js';
```

`installLiveWidget(app);` の次の行(Task 14 を飛ばした場合は `installLog(app);` の次の行)に足す:

```js
  installSnow(app);
```

- [ ] **Step 4: 画面と負荷を確かめる**

```bash
npm run lint && npm test && npm run web:build && npm run web:preview
```

`browser_navigate` → `http://127.0.0.1:4173/?debug`、別の端末で `npm run fake-notify -- --from 2025-11-18T13:00:00+09:00 --to 2025-11-18T16:10:00+09:00 --interval 800 --gap 100`。10秒後に `browser_evaluate` → `() => ({ n: window.__sapporo.app.snow.count(), w: document.getElementById('snow').width, dpr: devicePixelRatio })`。

期待: `n` が 0 より大きく 3000 以下。`w` は `innerWidth × min(dpr, 1.5)`。降雪量の多い区(東区、手稲区、北区)の上で粒が多い。切り替えの「雪の粒」を外すと、粒が消える。Retina の実機での負荷は Task 19 で測る。

- [ ] **Step 5: コミット**

```bash
git add web/src/lib/intensity.js web/src/effects/snow.js web/src/main.js web/src/style.css test/web/intensity.test.mjs
git commit -m "feat: 降雪量と積雪深の増分に連動する雪の粒を追加(気温 3℃ 超では降らせない)"
```

### Task 17: 円表示の切り替え(`circle-view.js`)

**Files:**
- Create: `web/src/effects/circle-view.js`
- Modify: `web/src/main.js`(2行)

**Interfaces:**
- Consumes: `app.mapLayer`(`map`、`ready`。`stations` のソースと、その `feature-state` の `snow`。Task 9)、`snowColorExpression`(Task 7)、`app.controls.addButton`(Task 12)
- Produces: `installCircleView(app)`(レイヤー `station-circle` を `station-dot` の下に足す。ボタン「表示: 面(区)」⇔「表示: 円(観測点)」)

- [ ] **Step 1: 円表示を書いて、組み込む**

`web/src/effects/circle-view.js`:

```js
// 円表示への切り替え(余裕があれば)。観測点に、積雪深の大きさと色の円を描く。面の塗りは隠す。
// 色は面と同じ式(lib/color.js)。円の値は map-layer の setSnow が stations の feature-state にも入れている。
import { snowColorExpression } from '../lib/color.js';

export function installCircleView(app) {
  const { map } = app.mapLayer;
  let view = 'area';
  app.mapLayer.ready.then(() => {
    map.addLayer(
      {
        id: 'station-circle',
        type: 'circle',
        source: 'stations',
        layout: { visibility: 'none' },
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['to-number', ['coalesce', ['feature-state', 'snow'], 0]], 0, 10, 35, 46],
          'circle-color': snowColorExpression(),
          'circle-opacity': 0.85,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5,
        },
      },
      'station-dot',
    );
  });
  app.controls?.addButton('表示: 面(区)', (button) => {
    view = view === 'area' ? 'circle' : 'area';
    map.setLayoutProperty('ward-fill', 'visibility', view === 'area' ? 'visible' : 'none');
    map.setLayoutProperty('station-circle', 'visibility', view === 'area' ? 'none' : 'visible');
    button.textContent = view === 'area' ? '表示: 面(区)' : '表示: 円(観測点)';
  });
}
```

`web/src/main.js` の import の並びの末尾に足す:

```js
import { installCircleView } from './effects/circle-view.js';
```

`install〜(app);` の並びの末尾に足す:

```js
  installCircleView(app);
```

- [ ] **Step 2: 画面で確かめる**

```bash
npm run lint && npm run web:build && npm run web:preview
```

fake-notify でピーク時を流しながら、左下の「表示: 面(区)」を押す(`browser_click` → `#controls button` のうち、その文字のもの)。`browser_evaluate` → `() => { const m = window.__sapporo.app.mapLayer.map; return [m.getLayoutProperty('ward-fill', 'visibility'), m.getLayoutProperty('station-circle', 'visibility')]; }`。期待: `['none', 'visible']`、ボタンの文字は「表示: 円(観測点)」。北区の円が最も大きく白に近い。もう一度押すと面に戻る。

- [ ] **Step 3: コミット**

```bash
git add web/src/effects/circle-view.js web/src/main.js
git commit -m "feat: 観測点の円表示への切り替えを追加"
```

### Task 18: 音(`sound.js`)

**Files:**
- Create: `web/src/effects/sound.js`
- Modify: `web/src/main.js`(2行)

**Interfaces:**
- Consumes: `hit(decision)` のイベント(Task 4、10)、`app.controls.addButton`(Task 12)
- Produces: `installSound(app)`(ボタン「音を有効化(クリックが必要)」。`app.soundPlays` に鳴らした回数)

- [ ] **Step 1: 音を書いて、組み込む**

`web/src/effects/sound.js`:

```js
// 音(余裕があれば。任意)。条件ヒットで短いチャイムを鳴らす(5cm 以上は高め、3cm 以上は低め)。
// ブラウザーは、利用者の操作なしでは音を出さない。発表の冒頭に「音を有効化」を1回押す(ページを読み直したら、また押す)。
// 同じ書き込みの ge3 と ge5 が続けて届いたとき(封筒のないブローカーでは順不同)に二度鳴らさないよう、
// 最初の通知から 200ms 待って、その時点の強い方で1回だけ鳴らす(画面の演出は待たない)。
const SETTLE_MS = 200;

export function installSound(app) {
  let ctx = null;
  let on = false;
  const pending = new Map(); // hit.key -> tier

  function chime(tier) {
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const freqs = tier === 'ge5' ? [880, 1318] : [660, 880];
    freqs.forEach((hz, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = hz;
      const start = t + i * 0.09;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.18, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.7);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.75);
    });
    app.soundPlays = (app.soundPlays ?? 0) + 1;
  }

  app.controls?.addButton('音を有効化(クリックが必要)', async (button) => {
    try {
      ctx = ctx ?? new AudioContext();
      if (ctx.state !== 'running') {
        await ctx.resume();
        on = true;
      } else {
        on = !on;
      }
      button.textContent = on ? `音: オン(${ctx.state})` : '音: オフ';
      if (on) chime('ge3');
    } catch (e) {
      console.warn('音を有効にできません', e);
      button.textContent = '音: 使えません';
    }
  });

  app.on('hit', (hit) => {
    if (!on) return;
    const known = pending.get(hit.key);
    pending.set(hit.key, hit.tier === 'ge5' || known === 'ge5' ? 'ge5' : 'ge3');
    if (known !== undefined) return;
    setTimeout(() => {
      chime(pending.get(hit.key));
      pending.delete(hit.key);
    }, SETTLE_MS);
  });
}
```

`web/src/main.js` の import の並びの末尾に足す:

```js
import { installSound } from './effects/sound.js';
```

`install〜(app);` の並びの末尾に足す:

```js
  installSound(app);
```

- [ ] **Step 2: 画面で確かめる**

```bash
npm run lint && npm run web:build && npm run web:preview
```

`browser_navigate` → `http://127.0.0.1:4173/`、「音を有効化(クリックが必要)」を `browser_click`。期待: ボタンが「音: オン(running)」になる。別の端末で `npm run fake-notify -- --from 2025-11-18T06:50:00+09:00 --to 2025-11-18T07:00:00+09:00 --interval 1500 --gap 0 --bare --order weak-first` を流し、`browser_evaluate` → `() => window.__sapporo.app.soundPlays`。期待: 2(有効にしたときの1回と、ヒットの1回。ge3 と ge5 で二度鳴らない)。もう一度押すと「音: オフ」になり、ヒットで鳴らない。自動化では聞こえ方は判断できないので、実機の聞こえ方は Task 19 で確かめる。

- [ ] **Step 3: コミット**

```bash
git add web/src/effects/sound.js web/src/main.js
git commit -m "feat: 条件ヒットのチャイム(任意。ボタンで有効化)を追加"
```

### レビューゲート F(余裕があれば)

- [ ] **Step 4:** 入れた余裕のタスクについて、サブエージェントにレビューを依頼する。観点: (1) それぞれが main.js の2行で外せること(実際に外して `npm run web:build` が通るか)、(2) 雪の粒の描画の倍率と、気温の扱い、(3) 音が利用者の操作なしで鳴らないこと。

---

## 工程4: 通しの確認と、発表前のリハーサル

### Task 19: Stellio での通しの確認と、リハーサルの手順

**Files:**
- Create: `scripts/smoke/compare-browser.mjs`
- Modify: なし(確認の結果は、PR の本文に書く。スクリーンショットはリポジトリに入れない)

**Interfaces:**
- Consumes: `coverage`、`countDuplicates`(`scripts/smoke/analyze.mjs`)、`replay --log` の1行の形 `{ id, ward, t, sentAt, status }`、`window.__sapporo.received`(Task 10)
- Produces: `node scripts/smoke/compare-browser.mjs <replay のログ> <ブラウザーの受信ログ>`(欠落か重複があれば終了コード 1)

- [ ] **Step 1: 突き合わせのスクリプトを書く**

`scripts/smoke/compare-browser.mjs`:

```js
// 地図アプリが受けた通知と、replay が送った書き込みを突き合わせる(設計書 5.6)。
// 使い方: node scripts/smoke/compare-browser.mjs <replay の --log のファイル> <ブラウザーの受信ログ(JSON)>
// ブラウザーの受信ログは、?debug で開いた地図アプリの window.__sapporo.received を JSON で保存したもの。
// 欠落か重複(amedas/live)が1件でもあれば、終了コードは 1。
import { readFileSync } from 'node:fs';
import { coverage, countDuplicates } from './analyze.mjs';

const [logPath, receivedPath] = process.argv.slice(2);
if (!logPath || !receivedPath) {
  console.error('使い方: node scripts/smoke/compare-browser.mjs <replay の --log のファイル> <ブラウザーの受信ログ(JSON)>');
  process.exit(2);
}

const sent = new Set(
  readFileSync(logPath, 'utf8')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l))
    .filter((r) => typeof r.status === 'number' && r.status >= 200 && r.status < 300)
    .map((r) => `${r.id}|${r.sentAt}`),
);
const received = JSON.parse(readFileSync(receivedPath, 'utf8'));
const counts = new Map();
for (const r of received) {
  if (r.topic !== 'amedas/live' || !r.sentAt) continue;
  const key = `${r.id}|${r.sentAt}`;
  counts.set(key, (counts.get(key) ?? 0) + 1);
}
const { missing } = coverage(sent, new Set(counts.keys()));
const duplicates = countDuplicates(counts, sent);
const cond = (suffix) => received.filter((r) => r.topic.endsWith(suffix)).length;
console.log(`送信 ${sent.size} 件、受信(amedas/live、送った書き込みの分)${[...counts.keys()].filter((k) => sent.has(k)).length} 件、欠落 ${missing.length} 件、重複 ${duplicates.count} 件`);
console.log(`条件付き購読の通知: 5cm 以上 ${cond('ge5')} 件、3cm 以上 ${cond('ge3')} 件`);
if (missing.length > 0) console.log(`欠落の例: ${missing.slice(0, 5).join(', ')}`);
if (duplicates.count > 0) console.log(`重複の例: ${duplicates.examples.join(', ')}`);
process.exit(missing.length > 0 || duplicates.count > 0 ? 1 : 0);
```

```bash
npm run lint
git add scripts/smoke/compare-browser.mjs
git commit -m "feat: replay の送信ログと、地図アプリの受信ログを突き合わせるスクリプトを追加"
```

- [ ] **Step 2: 本番と同じ構成で、通しで再生する(約13分)**

README の手順で Stellio を起動する(`docker compose -f compose/docker-compose.yml up -d`、Exited があればもう一度 `up -d`、`curl … /subscriptions` が 200)。作業用の場所はリポジトリの外にする:

```bash
mkdir -p ~/sapporo-e2e
npm run web:build && npm run web:preview
```

Playwright MCP: `browser_resize`(1920 × 1080)、`browser_navigate` → `http://127.0.0.1:4173/?debug`。HUD の点が緑(`connected`)になってから、別の端末で:

```bash
npm run setup
npm run replay -- --log ~/sapporo-e2e/replay.jsonl
```

見るもの(期待):

| 時点 | 画面 |
|---|---|
| `setup` の直後 | 清田区だけ色とラベルが入り、観測時刻が「2025-11-18 02:40 JST」(setup の余分な通知。申し送り 6節) |
| 再生の開始から | 観測時刻が 6 秒ごとに 10 分進む。区の書き込みは 0.6 秒ずつずれて届き、観測点に細い波紋が順に出る。通知レートは約 100 件/分、遅延の中央値は約 400ms(申し送り 8節: 中央値 0.38〜0.39 秒、p95 0.54〜0.81 秒、最大 約 2 秒) |
| 約 2分30秒(07:00) | 北区 5cm(赤のラベル1つ、ヒット欄に赤の1行) |
| 約 3分(08:00)、約 3分42秒(09:00) | 北区 4cm(橙)、北区 5cm(赤) |
| 約 6分42秒(14:00) | 厚別区 3、北区 3、東区 5、手稲区 5 |
| 約 7分18秒(15:00) | 中央区 3、東区 3、白石区 3、厚別区 4、手稲区 5 |
| 約 7分54秒(16:00)、約 8分30秒(17:00) | 西区 3、清田区 3 |
| 約 12分42秒(終了) | 観測時刻「2025-11-19 00:00 JST」。HUD の条件付き購読は「5cm 以上 5 ・ 3cm 以上 16」(設計書 4.2)。ヒット欄の行は計 16 件のうち新しい 8 件 |

ヒットのたびに、同じ区のラベルが二重に出ないこと(Stellio では ge5 → ge3 → live の順に約 430ms ずつ空いて届く。申し送り 7節)。ヒットの約 1 秒後に届く live の通知で、太い波紋が出直さないこと。

途中で3回 `browser_take_screenshot`(`filename: .playwright-mcp/e2e-<内容>.png`。通常の更新、北区 07:00 のヒットの直後、15:00 のピーク)を撮る。

- [ ] **Step 3: 取りこぼしと遅延を突き合わせる**

再生が終わって 15 秒待ってから:
- `browser_evaluate`(`filename: .playwright-mcp/received.json`)→ `() => window.__sapporo.received`
- `browser_evaluate` → `() => window.__sapporo.stats()`

```bash
mv .playwright-mcp/received.json .playwright-mcp/e2e-*.png ~/sapporo-e2e/
node scripts/smoke/compare-browser.mjs ~/sapporo-e2e/replay.jsonl ~/sapporo-e2e/received.json
```

期待: `送信 1280 件、受信(amedas/live、送った書き込みの分)1280 件、欠落 0 件、重複 0 件`、`条件付き購読の通知: 5cm 以上 5 件、3cm 以上 16 件`、終了コード 0。`stats()` の `latency.median` は 300〜600ms、`latency.p95` は 2000ms 以下、`total` は 1281(setup の1件を含む)。

結果(件数、遅延の中央値 / p95 / 最大、測定した機)を、PR の本文に書く。スクリーンショットは `~/sapporo-e2e/` に残し、リポジトリには入れない。`git status --short` で、何も増えていないことを確かめる。

- [ ] **Step 4: 発表前のリハーサルの手順(本番機で、11/28 より前に。結果を Issue #2 か PR に書く)**

本番機(発表で使うノート PC)で、次を順に確かめる。発表当日のブローカーで行う場合は、そのブローカーの WebSocket を `?mqtt=` で、書き込み先を `BROKER_URL` などの環境変数で指定する(README「別のブローカーで動かすとき」)。地図アプリの側に、ブローカーごとの設定はない。

1. **プロジェクターの解像度**: 会場のプロジェクター(不明なら 1920 × 1080 と 1280 × 720 の両方)にミラーリングして、Task 13 Step 3 の確認項目(ラベルが隠れない、北区の上で文字が読める、タイトルと出典が見える)を、実際の画面で見る。
2. **Retina(DPR 2)**: 本番機の内蔵ディスプレイで開き、`browser_evaluate` か開発者ツールで `devicePixelRatio` が 2、`document.getElementById('snow').width` が `innerWidth × 1.5` であることを確かめる(雪の粒を入れた場合)。アクティビティモニタで、ブラウザー(GPU とレンダラー)と Docker の CPU を、ピーク時(15:00 前後)に記録する。
3. **1時間の連続運転**: `npm run setup -- --from 2025-11-15T00:00:00+09:00` と `npm run replay -- --from 2025-11-15T00:00:00+09:00 --to 2025-11-19T04:00:00+09:00`(601 ステップ、6,000ms/ステップで約 60 分)。開始時と終了時に、開発者ツールの Memory(または `performance.memory.usedJSHeapSize`)と、アクティビティモニタのメモリを記録し、増え続けていないこと、HUD の遅延の p95 が 2 秒以下のままであること、`compare-browser.mjs` で欠落 0 件、重複 0 件を確かめる(`--log` を付けて実行する)。
4. **音**: 会場のスピーカーにつないで、「音を有効化」を押す手順を、発表の最初の段取りに入れる(ページを読み直すと、もう一度押す必要がある)。音量と聞こえ方を確かめる。
5. **ネットワーク**: 有線 LAN を使う(Wi-Fi は混雑で切れやすい)。Stellio の初回の起動と `setup` は、ネットワークのある状態で行う(コア context の取得。README)。会場のネットワークが使えない場合は `?live=off` で開く。
6. **ポートの公開**: Mosquitto(1883、9001)、Stellio(8080)、地図アプリ(4173)が `127.0.0.1` だけで待ち受けていることを `lsof -nP -iTCP -sTCP:LISTEN | grep -E ':(1883|9001|8080|4173|3120)'` で確かめる。`*:` や `0.0.0.0:` で待ち受けているものがあれば止める(会場の LAN から、認証なしで書き込めてしまう)。ポート 3120 のような、ホストで動かす別のブローカーも同じ(`127.0.0.1` にだけ結び付ける)。
7. **当日の段取り**: ブラウザーを全画面(F11 か ⌃⌘F)にし、ページを開いてから `setup`、`replay` の順に実行する。やり直すときは、ページを読み直してから `setup` を実行する(HUD の件数と遅延の統計を、新しい再生だけにするため)。

### レビューゲート G(工程4)

- [ ] **Step 5:** サブエージェントに、全体のレビューを依頼する(`git diff main...HEAD`、設計書全体、申し送り、Step 3 の結果)。観点: (1) 設計書 5章と 6.4、6.5、7.1 の項目がすべて入っているか、外したもの(余裕の演出)が README と食い違わないか、(2) 公開されて困るものが入っていないか(スクリーンショット、製品固有の記述)、(3) CI(lint、Node 22 と 24 のテスト、ビルド)が通るか。指摘を直したら、PR を作る(本文に、設計書とこの計画へのリンク、Step 3 の結果、Task 13 の判定を書く)。

---

## 自己レビュー(計画の作成者による)

**設計書との対応(工程3〜4の範囲)**

| 設計書 | タスク |
|---|---|
| 1.2 成功の基準 3(「いま配信されている」ことが画面から伝わる) | Task 10(2つの時計、HUD)、Task 11(波紋、条件ヒット) |
| 1.5 不変条件(公開リポジトリの内容) | Global Constraints、Task 9〜19 のスクリーンショットの扱い、レビューゲート D〜G |
| 2.1、2.3 `web/` の位置づけ | ファイル構成の表 |
| 4.4 通知の形の違い(`msg.body ?? msg`) | Task 3、Task 8(`--bare`)、Task 10 Step 5 |
| 5 前文(タイルなし、外部通信なし) | Task 1(`page.test.mjs`)、Task 9(グリフを使わない)、レビューゲート D |
| 5.1 モジュール構成 | `mqtt-feed` = Task 3、10。`dedupe` = Task 4。`store` = Task 5、6(区の値と統計を2つのファイルに分けた)。`map-layer` = Task 9、17。`effects/` = Task 11、16、18。`panels/` = Task 9〜12。`live-widget` = Task 14 |
| 5.2 演出 1〜6 | HUD = Task 10。時計 = Task 9、10。波紋 = Task 11。ヒット欄と通知ログ = Task 11、12。ダーク背景・面表示・雪の粒 = Task 1、9、13、16。音 = Task 18 |
| 5.3 試作からの修正点 | 文字の読みやすさ = Task 7、9。「観測時刻」= Task 1。DPR 1.5 = Task 16。書き込みの識別子での重複排除 = Task 4。N03 の境界と出典 = Task 1、9。色の刻み = Task 7。札幌市のタイトル = Task 1 |
| 5.4 当日の最新値 | Task 14 |
| 5.5 設定(`?mqtt=`、表示範囲) | Task 2、9 |
| 5.6 検証(純関数の単体テスト、Playwright、受信数の突き合わせ、実機) | Task 2〜7、16(単体)、Task 9〜18(Playwright)、Task 19 Step 3(`?debug` と突き合わせ)、Step 4(実機) |
| 6.1 テストの層(画面は手動、スクリーンショットは入れない、発表前の通し) | Task 9〜19、Task 19 Step 4 |
| 6.3 出典(画面に常時表示、気象庁) | Task 1、14、15 Step 3 |
| 6.4 README | Task 15(既存の節に「地図アプリ」を足す。1〜6 の構成は計画A で入れた形のまま) |
| 6.5 CI(lint は計画Bで入れる、SHA のピン留め) | Task 1 Step 6〜8 |
| 7 工程3〜4、7.1 優先度 | 必須 = Task 1〜11(ゲート D)、次点 = Task 12〜15(ゲート E)、余裕 = Task 16〜18(ゲート F)、工程4 = Task 14、15、19(ゲート G) |
| 申し送り 1〜11 | 1、3 = Task 3。2、5 = Task 3、5。4 = Task 3(`metadata` を読まない)。6 = Task 5、6、19。7 = Task 4、11、19。8 = Task 6、19。9 = Task 2、3。10 = Task 5、13 |

**プレースホルダーの確認:** 「TBD」「あとで」「適切に」などの、内容のない手順はない。コードの手順は、すべて完全なコードを載せた。判定によって変わる手順(Task 13 Step 2 と Step 4)は、判定の基準と、両方の場合の手順を書いた。

**型と名前の整合:** `Observation`(Task 3)は Task 4〜6、8、10〜12、16 で同じ形を使う。`Decision`(Task 4)の `key`、`tier`、`ward`、`value` は Task 11 の `ripples.hit`、`createHitList.render`、Task 18 の `installSound` で使う。`WardState`(Task 5)の `snowHeight`、`temperature`、`snowfall1h`、`snowDelta1h`、`windSpeed` は Task 9(`labels.update`)、Task 10(`setSnow`)、Task 12(ログ)、Task 16(`snowIntensity`)で使う。`app` の `on`、`positions`、`mapLayer`、`fx`、`wardNames`、`config`(Task 10)と、`app.ripples`(Task 11)、`app.controls`(Task 12)、`app.snow`(Task 16)、`app.soundPlays`(Task 18)は、定義したタスクより後でだけ使う。`snowColorExpression`(Task 7)は Task 9、13、17 で同じ名前。`window.__sapporo.received` の要素の `id` と `sentAt`(Task 10)は、`compare-browser.mjs`(Task 19)のキー `` `${id}|${sentAt}` `` と、`replay --log` の `id`、`sentAt` に一致する。

**Review Focus:** 5項目のそれぞれに、担当のタスクのテスト(または画面の確認の手順)を入れた。MQTT の再接続のあとも購読が成立していること(`resubscribe: false` と、接続のたびの購読)は、単体テストにできないため、Task 10 Step 5 の画面の確認(件数が 30 ずつ増える)で確かめる。

**計画を書いたときに確かめたこと(2026-10-04)**
- `npm view`: vite 8.3.2、maplibre-gl 6.12.0、mqtt 5.16.0、eslint 10.12.0、@eslint/js 10.0.1、globals 17.13.0。
- 使い捨ての場所で、Vite 8.3.2 + MapLibre 6.12.0 + mqtt.js 5.16.0 のアプリをビルドし、`vite preview` と `vite`(開発サーバー)の両方で、地図の描画(Worker を含む)、Mosquitto への WebSocket の接続と受信、`data/` の import を確かめた。この計画のすべての `web/`、`scripts/`、`test/` のファイルを、この計画の本文と同じ内容で置き、`npm run lint`、`npm test`(Node 24 と、`npx -y node@22`。既存の 124 件を含めて 209 件)、`npm run web:build` が通ること、fake-notify(封筒あり・なし、3つの順序)で、HUD、時計、波紋、ヒット欄、通知ログ、当日の最新値(実際の気象庁の取得)、雪の粒、円表示、音のボタンが動くことを、Playwright で確かめた。Task 9 と Task 10 の段階の main.js も、それぞれビルドと lint が通ることを確かめた。
