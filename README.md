# 札幌積雪タイムラプス

札幌市10区の2025年11月の観測データ(10分ごと)を、NGSI-LD の形式でブローカーに書き込み直し、
購読通知(MQTT)で地図に届けるデモです。FOSS4G Hokkaido 2026(2026-11-28)の発表のために作っています。

設計は [docs/superpowers/specs/2026-10-04-sapporo-snow-timelapse-design.md](docs/superpowers/specs/2026-10-04-sapporo-snow-timelapse-design.md)
を参照してください。地図アプリは作業中です。

## 動かし方(OSS のブローカー Stellio で再現する)

必要なもの: Docker、Node.js 22 以上、メモリに約 2GB の余裕。

```bash
npm ci
npm run build:data    # 札幌市と国土数値情報から data/ を作る(作成済みのものがコミットされています)

docker compose -f compose/docker-compose.yml up -d
# Stellio は、初回の起動で stellio-search-service と stellio-subscription-service が終了することがあります
# (PostgreSQL の準備が終わる前に起動するため)。その場合は、同じコマンドをもう一度実行します。
docker compose -f compose/docker-compose.yml ps -a    # すべて running になるまで待つ

npm run setup         # エンティティと購読を作る
npm run replay        # 2025-11-18 の1日(128 ステップ)を再生する。Stellio では通知が遅れます(下の「再生の速度」)

# 動作の確認: setup と replay を実行しながら通知を受信し、欠落と遅延を表示する(引数は replay と同じ)
npm run smoke -- --from 2025-11-18T15:00:00+09:00 --to 2025-11-18T15:30:00+09:00 --interval 5000
```

止めるときは `docker compose -f compose/docker-compose.yml down -v` です(`-v` で、Stellio のデータと、滞留した通知も消えます)。

通知は、MQTT のトピック `amedas/live`、`amedas/cond/snowfall1h_ge5`、`amedas/cond/snowfall1h_ge3` に届きます
(`ws://127.0.0.1:9001` から、MQTT の WebSocket で購読できます)。

### 再生の速度

Stellio は、書き込みの属性ごとに購読を評価し、書き込んだ属性1つにつき1件の通知を出します(1回の書き込みで約6件)。
2026-10-04 に Apple M1(MacBook Air、Docker に 8 CPU、約 7.75GB を割り当て)で測ったところ、通知の処理は毎秒約 2.4 件で、
1ステップ(10区)の通知を出し終えるまでに 18〜26 秒かかりました。

| 書き込み方 | ステップの間隔 | 欠落 | 遅延の中央値 / p95 / 最大 | 遅延の中央値: 最初の1/4 → 最後の1/4 |
|---|---|---|---|---|
| 全属性 | 5,000ms(4ステップ) | 0件 | 50.9 / 90.1 / 95.2 秒 | 14.3 → 82.3 秒(滞留が増え続ける) |
| 変わった属性だけ(`--changed-only`) | 30,000ms(12ステップ) | 0件 | 8.9 / 16.6 / 21.4 秒 | 9.4 → 8.1 秒 |
| 全属性 | 30,000ms(12ステップ) | 0件 | 12.8 / 23.7 / 28.1 秒 | 12.8 → 10.6 秒 |

通知の取りこぼしはありませんが、**今の実装では、遅れなく届く速度(遅延の p95 が 2 秒以下)は、この環境で見つかっていません**。
30,000ms/ステップ(128 ステップで約64分)でも、通知は 10〜20 秒ほど遅れて届きます。
`replay` の既定の間隔(`--interval`)は、測定前の暫定値 4,000ms のままで、Stellio ではこの速度だと通知が滞留し、遅れが増え続けます。
`--interval`(ミリ秒)で変えられます。

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
| `REPLAY_INTERVAL_MS` | `--interval` | `4000` | 1ステップ(観測の10分)に当てるミリ秒 |

開始と終了の日時には、`+09:00` や `Z` のようなタイムゾーンを必ず付けます(付けないとエラーになります)。

通知の形式は、ブローカーによって異なります(ETSI の MQTT バインディングは `{"body":…,"metadata":…}` の封筒)。

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
