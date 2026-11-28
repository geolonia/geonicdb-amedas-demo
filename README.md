# 札幌積雪タイムラプス

札幌市10区の2025年11月の観測データ(10分ごと)を、NGSI-LD の形式でブローカーに書き込み直し、
購読通知(MQTT)で地図に届けるデモです。FOSS4G Hokkaido 2026(2026-11-28)の発表のために作っています。

設計は [docs/superpowers/specs/2026-10-04-sapporo-snow-timelapse-design.md](docs/superpowers/specs/2026-10-04-sapporo-snow-timelapse-design.md)
を参照してください。

## 動かし方(OSS のブローカー Stellio で再現する)

必要なもの:

- Docker。compose ファイルが `include` を使うため、新しい版の Docker Compose が必要です(2026-11-28 に v5.7.1 で確認)。メモリに約 2GB の余裕
- Node.js 22.13 以上の 22 系、または 24 以上(23 系は対象外)。`node -v` で確かめられます
- 初回の起動と `setup` のときのネットワーク。Docker のイメージを取得するほか、Stellio が NGSI-LD のコア context(`https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context-v1.9.jsonld`)を外部から取りに行きます。このリポジトリが配信する `weather.jsonld` だけでは足りません。取れないときの症状は、次のとおりです。その場合は、TLS の検査がなく、外部に届くネットワークにつないで試してください
  - 社内のプロキシなどで TLS を検査している(証明書が差し替わる)ネットワーク: 手順 4 の確認が 400(`LOADING_DOCUMENT_FAILED`)のまま変わらない(2026-11-28 に確認)
  - ネットワークのない状態で新規に起動したとき: `setup` のエンティティ作成が 503(`LOADING_REMOTE_CONTEXT_FAILED`)で失敗する

端末を 2 つ使います。端末 A で地図アプリを、端末 B で Stellio と再生を動かします。どちらの端末も、リポジトリのルート(clone したディレクトリ)で開きます。端末 A(`npm ci` を含む)を先に実行してください。

```bash
# 端末 A: 地図アプリ(前面で動く。止めるときは Ctrl-C)
npm ci
npm run web:build
npm run web:preview   # ブラウザーで http://127.0.0.1:4173/ を開く
```

```bash
# 端末 B
# 1. 前に動かした Stellio のデータが残っていれば消す(ボリューム名が固定のため。初めてなら何も起きない)
#    同じ名前のボリュームを使う、別の Stellio のデータも消える。残したいデータがあるときは実行しない
docker compose -f compose/docker-compose.yml down -v

# 2. 起動する(イメージをまだ取得していないときは、取得のため、コマンドが戻るまで数分かかる)
docker compose -f compose/docker-compose.yml up -d

# 3. 1 分ほど待ってから、終了したサービスがないかを見る
#    Exited のものがあれば、待っても直らないので、もう一度 up -d を実行する(下の説明を参照)
docker compose -f compose/docker-compose.yml ps -a

# 4. 準備ができると 200 が返る(Exited が出て 2 回目の up -d をしたときは、そこから数秒〜10 秒ほど)
#    500 や 400 が続くときは、3. に戻って Exited のサービスがないかを見る
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8080/ngsi-ld/v1/subscriptions

# 5. 再生する(地図アプリを開いてから)
npm run setup         # エンティティと購読を作る
npm run replay        # 2025-11-18 の1日(128 ステップ)を、6,000ms/ステップ(約13分)で再生する
```

`replay` が最後に `完了: 128 ステップ、書き込み 1280 件、失敗 0 件` のように、失敗 0 件を表示すれば成功です。
地図では、通知が届くたびに観測点に波紋が出て、区の色(積雪深)が変わります。

Stellio は、初回の `up -d` で、`stellio-search-service` や `stellio-subscription-service` が終了することがあります。
PostgreSQL が接続を受け付ける前に、データベースの移行(Flyway)が接続しようとして失敗するためです(ログに `Connection to postgres:5432 refused`)。
`up -d` の直後は、すべてのコンテナが Up に見え、しばらくしてから終了するため、すぐに `ps` を見ても判断できません。
終了したサービスは、待っても起動しません(2026-11-28 の確認では、5 分待っても手順 4 は 500 のままでした)。もう一度 `up -d` を実行すると起動します。

動作を数字で確かめるときは、`smoke` を使います。`smoke` は、`setup` と `replay` を自分で実行しながら通知を受信し、欠落、重複、遅延を表示します(引数は `replay` と同じです。先に `setup` を実行する必要はありません)。
欠落か重複(PATCH 1回につき `amedas/live` の通知は1回のはず)が1件でもあれば、終了コードは 1 です。

```bash
npm run smoke -- --from 2025-11-18T15:00:00+09:00 --to 2025-11-18T15:30:00+09:00
```

止めるときは、端末 B で次のどちらかを実行し、端末 A の `web:preview` を Ctrl-C で止めます。

- データを消してもよいとき: `docker compose -f compose/docker-compose.yml down -v`(`-v` で、Stellio のデータと、滞留した通知も消えます)
- データを残すとき: `docker compose -f compose/docker-compose.yml down`(`-v` を付けないので、Stellio のデータは残ります)

### 発表で見せた範囲だけを再生する

FOSS4G Hokkaido 2026 の発表では、2025-11-18 の 12:40〜16:00(21 ステップ)を再生しました。Stellio では、10分を6秒(6,000ms)で再生すると約 2 分です(4,000ms では、Stellio は通知が滞留します。「再生の速度」の節を参照)。

```bash
npm run setup -- --from 2025-11-18T12:40:00+09:00
npm run replay -- --from 2025-11-18T12:40:00+09:00 --to 2025-11-18T16:00:00+09:00 --interval 6000
```

`setup` と `replay` には、同じ `--from` を指定します。もう一度流すときは、ブラウザーを読み直してから、`setup` と `replay` をもう一度実行します。
2026-11-28 に Stellio で `smoke` を同じ範囲で実行したときは、書き込み 210 件、欠落 0 件、重複 0 件、条件付き購読の通知は 5cm 以上 3 件・3cm 以上 11 件でした。
`smoke` の成功の判定は、欠落 0 件・重複 0 件です。遅延は実行ごとにばらつきます。同じ日の別の実行では、遅延の p95 が 3.3 秒、最大が 57 秒の通知がありました(原因は調べていません。欠落と重複は 0 件でした)。

観測データ(`data/`)は、作成済みのものがコミットされているため、作り直す必要はありません。

通知は、MQTT のトピック `amedas/live`、`amedas/cond/snowfall1h_ge5`、`amedas/cond/snowfall1h_ge3` に届きます
(`ws://127.0.0.1:9001` から、MQTT の WebSocket で購読できます)。

### 地図アプリ

通知を地図に表示する Web アプリです(`web/`。Vite と MapLibre GL JS、mqtt.js)。地図のタイルは使いません。ブローカーへの接続(MQTT の WebSocket)のほかに外部へ通信するのは、当日の最新値(気象庁)の取得だけです。画面は 1280×720 以上を想定しています。

```bash
npm run web:build      # dist/web/ にビルドする
npm run web:preview    # http://127.0.0.1:4173/ で配信する(127.0.0.1 だけで待ち受けます)
```

ブラウザーで http://127.0.0.1:4173/ を開いてから、`npm run setup` と `npm run replay` を実行します。
開発中は `npm run web:dev`(http://127.0.0.1:5173/)を使います。

| URL パラメーター | 既定値 | 内容 |
|---|---|---|
| `mqtt` | `ws://127.0.0.1:9001` | MQTT の WebSocket の URL(例: `?mqtt=ws://127.0.0.1:9001`)。`ws://` か `wss://` の URL でないときは、コンソールに警告を出して既定値を使います(値が空の `?mqtt=` は、警告なしで既定値を使います) |
| `debug` | なし | 受信した通知を記録する(`window.__sapporo.received`)。これを JSON で保存し、`node scripts/smoke/compare-browser.mjs <replay の --log のファイル> <保存した受信ログ>` で、replay が送った書き込みと突き合わせられます(欠落か重複があれば、終了コードは 1) |
| `live` | なし | `?live=off` で、当日の最新値(気象庁)を取りに行かない |

画面の見方:

- 観測時刻: いま届いた通知の観測時刻(`dateObserved`)。2025年11月の時刻が進みます。現在時刻は、この PC の時計です。
- 配信の遅延: 通知を受けた時刻 − 書き込んだ時刻(`sentAt`)。ブローカーと地図アプリが同じ PC で動いていることが前提です。`npm run smoke` と同じ定義ですが、地図アプリは直近の 2000 件だけを残し、負の値(時計のずれ)は数えません。重複した通知は、そのまま数えます。`smoke` は、実行全体を(ID、`sentAt`)の組ごとに集計します。
- 条件付き購読の通知: 1時間降雪量が 3cm 以上(橙)、5cm 以上(赤)の区。3cm と 5cm は、このデモ用に決めた条件で、気象庁の注意報・警報の基準ではありません。同じ書き込みの2つの購読の通知は、強い方の1件にまとめます。`dateObserved` のない通知でも、`snowfall1h` に `observedAt` があれば、ヒットとして表示します(正時の書き込みかどうかは確かめません)。
- 区の色: 積雪深(0、5、15、25、35cm の刻み)。通知をまだ受けていない区は暗い灰色です。気温は、その区にまだ気温の値がないとき、または値の観測時刻が、通知の観測時刻(`dateObserved`)より 1 時間以上古いときは「—」と表示します(欠測が続くと、最後の値が 1 時間前になった時点で「—」になります)。1ステップだけ欠測の通知では、前の値のままです(書き込みは欠測の属性を書かないため)。
- 当日の最新値: 気象庁のアメダス(札幌)の気温と風を、出典つきで右の欄の下に表示します。10分ごとに取り直します。取れないとき、観測時刻が3時間より古いとき、または10分より先の未来のときは、出典も含めて何も表示しません。
- 雪の粒: 区ごとに、降雪量(と積雪深の増分)に連動して粒が降ります。気温が 3℃ を超える区では降りません。
- 円表示: 「表示: 面(区)」のボタンで、区の面の塗り分けと、観測点の円を切り替えます(押すたびに、ボタンの文言が「表示: 円(観測点)」と入れ替わります)。既定は面です。
- 音: 「音を有効化(クリックが必要)」のボタンを押すと、条件ヒットでチャイムが鳴ります。ブラウザーは操作なしに音を出せないため、発表の最初に1回押してください。ページを読み直したら、もう一度押します。既定はオフです。
- 切り替え: 画面の「切り替え」で、時計、HUD、波紋、通知ログ、雪の粒を、それぞれ表示するかどうかを変えられます。同じ欄に、円表示と音のボタンもあります。

ブローカーなしで画面だけを確かめるときは、Mosquitto だけを起動して、通知と同じ形のメッセージを流せます(配信の遅延の測定には使えません)。

```bash
docker compose -f compose/docker-compose.yml up -d mosquitto
npm run fake-notify -- --from 2025-11-18T13:50:00+09:00 --to 2025-11-18T15:10:00+09:00 --interval 1500
npm run fake-notify -- --bare --order weak-first    # 封筒のない形、弱い購読が先に届く場合
```

画面の確認で撮ったスクリーンショットは、リポジトリに入れないでください(公開リポジトリのため)。

### 再生の速度

Stellio は、書き込んだ属性1つにつき1件の通知を出します。通知1件あたり、約 0.4〜0.5 秒(観測した処理速度、毎秒 約 2.1〜2.4 件からの換算)かかり、CPU には余裕がありました(原因は調べていません)。
そのため、このデモは次の2つで通知の数と集中を抑えています。

- 全件の購読(`amedas/live`)は `sentAt` だけを監視します。`replay` は書き込みごとに `sentAt` を更新するので、PATCH 1回につき通知は1回です(通知には全属性が入ります)。
- 1ステップの中の10区の書き込みを、ステップの時間に均等に散らします(逐次のまま、k 件目を `k × interval / 10` ずらす)。

書き込みのたびに、観測時刻 `dateObserved`(FIWARE の WeatherObserved の属性)も `sentAt` と同じ PATCH で書きます。属性ごとの `observedAt` は、値を書いた属性でしか新しくならない(`--changed-only` で値が変わらないステップなど)ため、観測時刻は `dateObserved` から読みます。

既定の間隔は 6,000ms/ステップ(既定の128ステップで約13分)です。2026-10-04 に、1台のマシン(Apple M1 の MacBook Air、
Docker に 8 CPU、約 7.75GB を割り当て、ほかのコンテナも動いている状態)で測った結果です。基準は、欠落 0 件、重複 0 件(重複は、この変更のあとに加えた基準です。表の測定では数えていません)、遅延の p95 が 2 秒以下、
後半の遅延が前半の2倍(と 0.5 秒)以内です。

| 範囲 | 間隔 | 欠落 | 遅延の中央値 / p95 / 最大 | 遅延の中央値: 最初の1/4 → 最後の1/4 | 判定 |
|---|---|---|---|---|---|
| 12ステップ | 8,000ms | 0件 | 0.41 / 0.61 / 1.28 秒 | 0.43 → 0.40 秒 | 満たす |
| 12ステップ | 6,000ms | 0件 | 0.41 / 0.59 / 0.84 秒 | 0.42 → 0.40 秒 | 満たす |
| 12ステップ | 5,000ms | 0件 | 0.42 / 0.85 / 0.93 秒 | 0.43 → 0.40 秒 | 満たす(余裕が小さい) |
| 12ステップ | 4,000ms | 0件 | 4.0 / 7.1 / 7.4 秒 | 1.7 → 6.7 秒 | 満たさない(滞留する) |
| 12ステップ(`dateObserved` あり) | 6,000ms | 0件 | 0.43 / 0.99 / 1.20 秒 | 0.42 → 0.40 秒 | 満たす |
| **128ステップ(既定の範囲、`dateObserved` あり)** | **6,000ms** | **0件** | **0.38 / 0.81 / 1.98 秒** | **0.39 → 0.38 秒** | **満たす** |

128ステップの行は、1回の測定です。条件付き購読の件数は、5cm/h 以上が5件、3cm/h 以上が16件でした。測るたびにばらつきがあります(`dateObserved` を加える前の 128 ステップでは、p95 が 541ms と 588ms)。
`dateObserved` の行以外は、`dateObserved` を加える前の測定です。p95 は 0.54〜0.59 秒から 0.81 秒(128ステップ)に増えましたが、ほかのコンテナも動いている状態での1回の測定のため、`dateObserved` の影響かどうかは分かりません。
4,000ms の行は、同じ構成を変更の前に一時的なコードで測ったものです。この2つの工夫がない場合は、30,000ms/ステップでも遅延の p95 が 17〜24 秒でした。
速いマシンや別のブローカーでは、`--interval`(ミリ秒)で速くできます。`npm run smoke` で、欠落、重複、遅延を確かめられます。

### 別のブローカーで動かすとき

次の環境変数(または引数)で、接続先を変えます。

- 別のブローカーだけを使うときは、`docker compose -f compose/docker-compose.yml up -d mosquitto context` で、MQTT と `@context` の配信だけを起動できます。
  その場合、`CONTEXT` は、`http://127.0.0.1:8081/weather.jsonld` のように、そのブローカーから見える URL にします。
- ホスト(compose の外)で動くブローカーでは、既定値の `mqtt://mosquitto:1883` や `http://context/weather.jsonld` は、そのブローカーから届きません。例えば、ポート 4000 で動くブローカーなら、次のようにします(Mosquitto と context は、上の compose で起動します)。

  ```bash
  BROKER_URL=http://localhost:4000 MQTT_URI_BASE=mqtt://localhost:1883 \
  CONTEXT=https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context-v1.9.jsonld TENANT=demo \
  npm run smoke -- --interval 1000
  ```

  `CONTEXT` は、コア context の URL か、`http://127.0.0.1:8081/weather.jsonld` のような、ブローカーから見える URL にします。
- `setup` と `replay` は、同じ `--from` で実行します(`replay` は、エンティティにある属性を `--from` から再現するため)。

| 環境変数 | 引数 | 既定値(Stellio の compose 用) | 内容 |
|---|---|---|---|
| `BROKER_URL` | `--broker-url` | `http://localhost:8080` | ブローカーの URL(`/ngsi-ld/v1` の手前まで) |
| `TENANT` | `--tenant` | なし | `NGSILD-Tenant` ヘッダーの値。使える文字はブローカーによって制限される(英小文字、数字、`_` なら通りやすい。ハイフンや大文字は 400 になるものがある) |
| `BROKER_TOKEN` | なし | なし | 認証を求めるブローカーで使うトークン。`Authorization: Bearer <トークン>` のヘッダーで送る。シェルの履歴に残らないよう、引数では指定できない(環境変数で渡す)。前後の空白は除き、空白や改行、ASCII 以外の文字を含むときはエラーにする。`BROKER_URL` は HTTPS か、自分の PC(`localhost` など)への HTTP に限る |
| `CONTEXT` | `--context` | `http://context/weather.jsonld` | `@context` の URL(ブローカーから見える URL) |
| `MQTT_URI_BASE` | `--mqtt-base` | `mqtt://mosquitto:1883` | ブローカーから見た MQTT の宛先 |
| `MQTT_VERSION` | `--mqtt-version` | `mqtt5.0` | 購読の `notifierInfo` に書く MQTT のバージョン |
| `REPLAY_FROM` | `--from` | `2025-11-18T02:50:00+09:00` | 再生の開始日時 |
| `REPLAY_TO` | `--to` | `2025-11-19T00:00:00+09:00` | 再生の終了日時 |
| `REPLAY_INTERVAL_MS` | `--interval` | `6000` | 1ステップ(観測の10分)に当てるミリ秒 |
| `REPLAY_REQUEST_TIMEOUT_MS` | `--request-timeout` | `10000` | ブローカーへの1回の HTTP 要求のタイムアウト(ミリ秒) |
| `DATA_DIR` | `--data-dir` | `data` | 観測データのディレクトリ |
| なし | `--log` | なし | `replay` の書き込みを1行1件の JSON で記録するファイル |
| なし | `--changed-only` | なし(全属性を書く) | 前回と同じ値の属性を書かない(`snowfall1h`、`sentAt`、`dateObserved` は常に書く) |
| `SMOKE_MQTT_WS` | なし | `ws://127.0.0.1:9001` | `smoke` が購読する MQTT の WebSocket |
| `SMOKE_DRAIN_MAX_MS` | なし | 再生にかかった時間(最低 10 分) | `smoke` が、再生のあとに通知を待つ上限(ミリ秒) |

開始と終了の日時には、`+09:00` や `Z` のようなタイムゾーンを必ず付けます(付けないとエラーになります)。

通知の形式は、ブローカーによって異なります(ETSI の MQTT バインディングは `{"body":…,"metadata":…}` の封筒ですが、封筒のないブローカーもあります。`npm run smoke` は、どちらの形も扱えます)。

環境変数だけで切り替えられるのは、次をすべて満たすブローカーです。

- 認証が要らない、または NGSI-LD の HTTP API の認証を `BROKER_TOKEN`(Bearer トークン)で通せる。`smoke` が起動する `setup` と `replay` にも使われます。MQTT の接続の認証には使いません。
- `@context` を URL の形で受け付ける。
- 標準の MQTT の通知を送る。

「速度」の節の測定(128ステップ、約13分)と、この次の起動の注意は、Stellio の場合のものです。別のブローカーでは、`--interval` を `npm run smoke` で決めてください(通知が滞留しないブローカーでは、もっと短い間隔でも通ります)。Stellio は、初回の起動と `setup` でネットワークが必要です(「動かし方」の「必要なもの」を参照)。

### データを作り直したいとき

```bash
npm run build:data    # 札幌市の CKAN と国土数値情報から data/ を作り直す(ネットワークが必要)
```

取得日は、キャッシュ(`data/raw/`)のファイルごとに、実際にダウンロードしたときに `data/raw/retrieved-at.json` へ記録します。`data/ATTRIBUTION.md` の札幌市の取得日は、10区の CSV のうち最も早い日付です(国土数値情報の取得日は別に記録します)。
取得日の記録がないキャッシュ(以前の形式の記録を含む)があると、取得日を推測せずにエラーで止まります。その場合は、`npm run build:data -- --refresh` で取得し直してください。
取得し直すと、取得日などが書き換わり、作業ツリーに変更が残ります。通常は不要です。

### 注意

- ローカルでのデモ専用です。公開するポートは `127.0.0.1` だけに限っていますが、Mosquitto(`ws://127.0.0.1:9001`)と
  Stellio(`http://127.0.0.1:8080`)は認証なしで接続できるため、ブラウザーで開いた任意の Web ページからも接続できます。
- Stellio の compose(upstream のもの)は、コンテナ名(`stellio-*`)とボリューム名(`stellio-postgres-storage`)が固定です。
  同じ機で、別の Stellio の compose を同時に動かすと衝突します。
- 自分の PC(`127.0.0.1`)で使うポートは、1883、9001(Mosquitto)、8081(`@context` の配信)、8080(Stellio の API)、18083、18084(Stellio の内部のサービス)、55432(Stellio の PostgreSQL)、29092(Kafka)、4173(地図アプリの `web:preview`)です。同じ番号を使うものが動いていると、起動に失敗します。
- Kafka の 29092 は、Kafka が広告するアドレスと同じ番号です。別の Kafka とぶつかるときは、`compose/stellio/stellio.env` の `KAFKA_PORT` を変えてください(ホストの Kafka クライアントからは使えなくなりますが、Stellio の動作には影響しません)。
- `compose/stellio/` のファイルは、Stellio の Apache License 2.0 のファイルです([compose/NOTICE.md](compose/NOTICE.md))。

## 仕組み

```
札幌市 CKAN(CSV、CC BY 4.0)
   │ npm run build:data(作成済みのものを data/ にコミット済み)
   ▼
data/(区ごとの観測値、観測地点、区の境界)
   │ npm run setup: 10区のエンティティを作り、購読を3本登録する
   │ npm run replay: 時計に合わせて、1区ずつ順に書き込む(区の間も並列にしない)
   ▼
NGSI-LD ブローカー
   │ 購読通知(MQTT、QoS 0)
   ▼
Mosquitto ── WebSocket(ws://127.0.0.1:9001)──► 地図アプリ(web/)
```

エンティティは区ごとに1件です(型 `WeatherObserved`、ID `urn:ngsi-ld:WeatherObserved:sapporo-<区>`)。

| 属性 | 型 | 内容 |
|---|---|---|
| `temperature`、`snowHeight`、`precipitation`、`windSpeed`、`windDirection` | Property(`unitCode` と `observedAt` つき) | 10分ごとの観測値。欠測の行では書きません |
| `snowfall1h` | Property(同上) | 前1時間の降雪量。正時の行にだけ書きます |
| `dateObserved` | Property(DateTime) | その書き込みの観測時刻。書き込みのたびに付けます。地図アプリの「観測時刻」はこれです |
| `sentAt` | Property(DateTime) | 書き込んだ時刻(ミリ秒まで)。書き込みのたびに付けます。地図アプリは、受信時刻との差を配信の遅延として表示します |
| `name`、`location` | Property、GeoProperty | 区名と、観測地点(各区の土木センター)の座標 |

購読は3本です(対象は ID が `urn:ngsi-ld:WeatherObserved:sapporo-` で始まるエンティティ)。

| トピック | `q` | `watchedAttributes` | 届く通知 |
|---|---|---|---|
| `amedas/live` | なし | `["sentAt"]` | 書き込みごとに1件(エンティティの全属性) |
| `amedas/cond/snowfall1h_ge5` | `snowfall1h>=5` | `["snowfall1h"]` | 正時に、降雪量が 5cm 以上だった区 |
| `amedas/cond/snowfall1h_ge3` | `snowfall1h>=3` | `["snowfall1h"]` | 正時に、降雪量が 3cm 以上だった区 |

条件付きの購読は、条件が成り立っている間、監視する属性が書かれるたびに通知されます。`snowfall1h` を正時にだけ書くことで、「その1時間に条件を満たした」通知になります。

## データの出典

札幌市の気象観測データ(CC BY 4.0)などを加工して使っています。出典と加工の内容は
[data/ATTRIBUTION.md](data/ATTRIBUTION.md)を参照してください。

## ライセンス

コードは MIT ライセンスです([LICENSE](LICENSE))。データは、それぞれの出典のライセンスに従います。
`compose/stellio/` は Apache License 2.0 です([compose/NOTICE.md](compose/NOTICE.md))。
