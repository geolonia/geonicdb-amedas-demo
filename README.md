# 札幌積雪タイムラプス

札幌市10区の2025年11月の観測データ(10分ごと)を、NGSI-LD の形式でブローカーに書き込み直し、
購読通知(MQTT)で地図に届けるデモです。FOSS4G Hokkaido 2026(2026-11-28)の発表のために作っています。

設計は [docs/superpowers/specs/2026-10-04-sapporo-snow-timelapse-design.md](docs/superpowers/specs/2026-10-04-sapporo-snow-timelapse-design.md)
を参照してください。地図アプリは作業中です。

## 動かし方(OSS のブローカー Stellio で再現する)

必要なもの: Docker、Node.js 22 以上、メモリに約 2GB の余裕。

```bash
npm ci

docker compose -f compose/docker-compose.yml up -d
# 数十秒待ってから、終了したサービスがないかを見る。Exited のものがあれば、もう一度 up -d を実行する
docker compose -f compose/docker-compose.yml ps -a
# 準備ができると 200 が返る
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8080/ngsi-ld/v1/subscriptions

npm run setup         # エンティティと購読を作る
npm run replay        # 2025-11-18 の1日(128 ステップ)を、6,000ms/ステップ(約13分)で再生する

# 動作の確認: setup と replay を実行しながら通知を受信し、欠落と遅延を表示する(引数は replay と同じ)
npm run smoke -- --from 2025-11-18T15:00:00+09:00 --to 2025-11-18T15:30:00+09:00
```

Stellio は、初回の `up -d` で、`stellio-search-service` と `stellio-subscription-service` が終了することがあります。
PostgreSQL が接続を受け付ける前に、データベースの移行(Flyway)が接続しようとして失敗するためです(ログに `Connection to postgres:5432 refused`)。
`up -d` の直後は、すべてのコンテナが Up に見え、約 11 秒後に終了するため、すぐに `ps` を見ても判断できません。
もう一度 `up -d` を実行すると起動します。

止めるときは `docker compose -f compose/docker-compose.yml down -v` です(`-v` で、Stellio のデータと、滞留した通知も消えます)。

観測データ(`data/`)は、作成済みのものがコミットされているため、作り直す必要はありません。

通知は、MQTT のトピック `amedas/live`、`amedas/cond/snowfall1h_ge5`、`amedas/cond/snowfall1h_ge3` に届きます
(`ws://127.0.0.1:9001` から、MQTT の WebSocket で購読できます)。

### 再生の速度

Stellio は、書き込んだ属性1つにつき1件の通知を出します。この環境で観測した通知の処理速度は、毎秒 約 2.1〜2.4 件(1件あたり約 0.45 秒)で、CPU には余裕がありました(原因は調べていません)。
そのため、このデモは次の2つで通知の数と集中を抑えています。

- 全件の購読(`amedas/live`)は `sentAt` だけを監視します。`replay` は書き込みごとに `sentAt` を更新するので、PATCH 1回につき通知は1回です(通知には全属性が入ります)。
- 1ステップの中の10区の書き込みを、ステップの時間に均等に散らします(逐次のまま、k 件目を `k × interval / 10` ずらす)。

既定の間隔は 6,000ms/ステップ(既定の128ステップで約13分)です。2026-10-04 に、1台のマシン(Apple M1 の MacBook Air、
Docker に 8 CPU、約 7.75GB を割り当て、ほかのコンテナも動いている状態)で測った結果です。基準は、欠落 0 件、遅延の p95 が 2 秒以下、
後半の遅延が前半の2倍(と 0.5 秒)以内です。

| 範囲 | 間隔 | 欠落 | 遅延の中央値 / p95 / 最大 | 遅延の中央値: 最初の1/4 → 最後の1/4 | 判定 |
|---|---|---|---|---|---|
| 12ステップ | 8,000ms | 0件 | 0.41 / 0.61 / 1.28 秒 | 0.43 → 0.40 秒 | 満たす |
| 12ステップ | 6,000ms | 0件 | 0.41 / 0.59 / 0.84 秒 | 0.42 → 0.40 秒 | 満たす |
| 12ステップ | 5,000ms | 0件 | 0.42 / 0.85 / 0.93 秒 | 0.43 → 0.40 秒 | 満たす(余裕が小さい) |
| 12ステップ | 4,000ms | 0件 | 4.0 / 7.1 / 7.4 秒 | 1.7 → 6.7 秒 | 満たさない(滞留する) |
| **128ステップ(既定の範囲)** | **6,000ms** | **0件** | **0.39 / 0.54 / 1.91 秒** | **0.40 → 0.38 秒** | **満たす** |

128ステップの行は、1回の測定です。測るたびにばらつきがあります(同じ条件で測り直したときは、p95 が 541ms と 588ms)。
4,000ms の行は、同じ構成を変更の前に一時的なコードで測ったものです。この2つの工夫がない場合は、30,000ms/ステップでも遅延の p95 が 17〜24 秒でした。
速いマシンや別のブローカーでは、`--interval`(ミリ秒)で速くできます。`npm run smoke` で、欠落と遅延を確かめられます。

### 別のブローカーで動かすとき

次の環境変数(または引数)で、接続先を変えます。

| 環境変数 | 引数 | 既定値(Stellio の compose 用) | 内容 |
|---|---|---|---|
| `BROKER_URL` | `--broker-url` | `http://localhost:8080` | ブローカーの URL(`/ngsi-ld/v1` の手前まで) |
| `TENANT` | `--tenant` | なし | `NGSILD-Tenant` ヘッダーの値 |
| `CONTEXT` | `--context` | `http://context/weather.jsonld` | `@context` の URL(ブローカーから見える URL) |
| `MQTT_URI_BASE` | `--mqtt-base` | `mqtt://mosquitto:1883` | ブローカーから見た MQTT の宛先 |
| `MQTT_VERSION` | `--mqtt-version` | `mqtt5.0` | 購読の `notifierInfo` に書く MQTT のバージョン |
| `REPLAY_FROM` | `--from` | `2025-11-18T02:50:00+09:00` | 再生の開始日時 |
| `REPLAY_TO` | `--to` | `2025-11-19T00:00:00+09:00` | 再生の終了日時 |
| `REPLAY_INTERVAL_MS` | `--interval` | `6000` | 1ステップ(観測の10分)に当てるミリ秒 |
| `DATA_DIR` | `--data-dir` | `data` | 観測データのディレクトリ |
| なし | `--log` | なし | `replay` の書き込みを1行1件の JSON で記録するファイル |
| なし | `--changed-only` | なし(全属性を書く) | 前回と同じ値の属性を書かない(`snowfall1h` と `sentAt` は常に書く) |
| `SMOKE_MQTT_WS` | なし | `ws://127.0.0.1:9001` | `smoke` が購読する MQTT の WebSocket |
| `SMOKE_DRAIN_MAX_MS` | なし | 再生にかかった時間(最低 10 分) | `smoke` が、再生のあとに通知を待つ上限(ミリ秒) |

開始と終了の日時には、`+09:00` や `Z` のようなタイムゾーンを必ず付けます(付けないとエラーになります)。

通知の形式は、ブローカーによって異なります(ETSI の MQTT バインディングは `{"body":…,"metadata":…}` の封筒)。

### データを作り直したいとき

```bash
npm run build:data    # 札幌市の CKAN と国土数値情報から data/ を作り直す(ネットワークが必要)
```

実行すると、取得日(`retrievedAt`)などが書き換わり、作業ツリーに変更が残ります。通常は不要です。

### 注意

- ローカルでのデモ専用です。公開するポートは `127.0.0.1` だけに限っていますが、Mosquitto(`ws://127.0.0.1:9001`)と
  Stellio(`http://127.0.0.1:8080`)は認証なしで接続できるため、ブラウザーで開いた任意の Web ページからも接続できます。
- Stellio の compose(upstream のもの)は、コンテナ名(`stellio-*`)とボリューム名(`stellio-postgres-storage`)が固定です。
  同じ機で、別の Stellio の compose を同時に動かすと衝突します。
- Kafka のポート(`127.0.0.1:39092`)はホストに公開していますが、Kafka が広告するアドレスと合わないため、ホストのクライアントからは使えません。
- `compose/stellio/` のファイルは、Stellio の Apache License 2.0 のファイルです([compose/NOTICE.md](compose/NOTICE.md))。

## データの出典

札幌市の気象観測データ(CC BY 4.0)などを加工して使っています。出典と加工の内容は
[data/ATTRIBUTION.md](data/ATTRIBUTION.md)を参照してください。

## ライセンス

コードは MIT ライセンスです([LICENSE](LICENSE))。データは、それぞれの出典のライセンスに従います。
`compose/stellio/` は Apache License 2.0 です([compose/NOTICE.md](compose/NOTICE.md))。
