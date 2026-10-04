# 計画B(地図アプリ)への申し送り: 工程2の実測

計画B(`web/` の地図アプリ)を書く人のために、工程2(リプレイ、購読、Stellio の compose)で、実際に観測した事実をまとめる。
測定はすべて、Stellio 2.37.0 の compose(このリポジトリの `compose/`)と Mosquitto で、2026-10-04 に、1台のマシン(Apple M1 の MacBook Air)で行った。
設計書は [../specs/2026-10-04-sapporo-snow-timelapse-design.md](../specs/2026-10-04-sapporo-snow-timelapse-design.md)。

## 1. 通知の封筒

Stellio の MQTT の通知は、ETSI の MQTT バインディングの封筒に入って届く。

```json
{
  "body": {
    "id": "urn:ngsi-ld:Notification:e49ca7fd-…",
    "type": "Notification",
    "subscriptionId": "urn:ngsi-ld:Subscription:7f26949d-…",
    "notifiedAt": "2026-10-04T01:00:35.384372Z",
    "data": [ { "id": "urn:ngsi-ld:WeatherObserved:sapporo-chuo", "type": "WeatherObserved", "…": "…" } ]
  },
  "metadata": {
    "Link": "<http://localhost:8080/ngsi-ld/v1/subscriptions/urn:ngsi-ld:Subscription:7f26949d-…/context>; rel=\"http://www.w3.org/ns/json-ld#context\"; type=\"application/ld+json\"",
    "Content-Type": "application/json"
  }
}
```

- 最上位にも `body` にも、`@context` はない。
- `data` は、観測した範囲では毎回1件だった。ただし、仕様上は配列なので、配列として処理する。
- 封筒を使わないブローカーもあるため、`msg.body ?? msg` で両方を受ける(設計書 4.4)。

## 2. 属性の形

属性は、`@context` で短くした名前(`snowHeight` など)で届く。観測値には `unitCode` と `observedAt` が付く。`createdAt`、`modifiedAt` は付かない。

```json
{
  "id": "urn:ngsi-ld:WeatherObserved:sapporo-kita",
  "type": "WeatherObserved",
  "name": { "type": "Property", "value": "北区" },
  "location": { "type": "GeoProperty", "value": { "type": "Point", "coordinates": [141.3517, 43.13982] } },
  "snowHeight": { "type": "Property", "value": 19, "unitCode": "CMT", "observedAt": "2025-11-18T00:00:00Z" },
  "snowfall1h": { "type": "Property", "value": 5, "unitCode": "CMT", "observedAt": "2025-11-18T00:00:00Z" },
  "sentAt": { "type": "Property", "value": { "type": "DateTime", "@value": "2026-10-04T01:04:17.509Z" } }
}
```

(`temperature`、`windDirection`、`windSpeed`、`precipitation` は省略。)属性の順序は、通知ごとに変わる。

## 3. `sentAt` の形

書き込みでは `{"@type":"DateTime","@value":"…"}` を送るが、通知では `@type` が `type` に置き換わり、`{"type":"DateTime","@value":"…"}` で届く。
`value["@value"]` を読み、`value` が文字列ならそのまま使う(`scripts/smoke/analyze.mjs` の `notificationKeys` と同じ扱い)。

## 4. `metadata.Link`

`metadata.Link` の URL は、Stellio の内側から見た URL(`http://localhost:8080/…`)である。ブラウザーから取りに行く前提にしない(地図アプリは、属性の短い名前をそのまま使えばよい)。

## 5. live の通知に入っている `snowfall1h`

`snowfall1h` は正時の書き込みにだけ書くが、エンティティには残るため、**live の通知には、前回の正時の `snowfall1h` が毎回入っている**(`observedAt` が正時のまま)。

```json
"temperature": { "type": "Property", "value": 0.1, "unitCode": "CEL", "observedAt": "2025-11-17T17:50:00Z" },
"snowfall1h":  { "type": "Property", "value": 0,   "unitCode": "CMT", "observedAt": "2025-11-17T17:00:00Z" }
```

10分ごとの live の通知を、新しい降雪量として扱わない。`snowfall1h.observedAt` が、その通知の観測時刻(ほかの属性の `observedAt`)と一致するときだけ、新しい値として扱う。

## 6. setup のときの、余分な live の通知

`setup` を実行すると、再生の前に、live の通知が1件届く(最後に作ったエンティティ、清田区について。観測時刻は再生の開始より前)。
地図アプリは、再生の開始より前の観測時刻の通知を受けても、おかしくならない作りにする(初期値として表示する、または無視する)。

## 7. 届く順序

同じ正時の書き込みで条件を満たした区については、`amedas/cond/snowfall1h_ge5` → `amedas/cond/snowfall1h_ge3` → `amedas/live` の順に、約 430ms ずつ空けて届いた(Stellio は、購読ごとに順番に通知を出す)。128 ステップの通しで、5件のヒットすべてがこの順だった。

- 設計書 5.3 の「弱い購読の通知が、強い購読の通知のあとに届いたら無視する」は、例外ではなく、通常の場合になる。
- live の通知で、条件ヒットの演出を二重に出さない(live は面の更新だけに使い、条件の演出は条件付き購読の通知だけで出す)。

## 8. タイミング

- PATCH 1回につき、live の通知は1回(live の購読は `sentAt` を監視する。設計書 4.2)。HUD の「通知レート」は、Stellio では書き込みのレートと同じになる。
- 1ステップの10件の書き込みは、`interval / 10` ずつ散らして書かれる(既定の 6,000ms なら 600ms ごと。設計書 4.3)。
- Stellio は、通知1件に約 0.43 秒かかる(観測した処理速度からの換算)。正時に条件を満たす区があると、その書き込みで通知が3件になり、後続の通知が待たされる。128 ステップの通しで、遅延の中央値は約 0.39 秒、p95 は 0.54〜0.59 秒、最大は約 1.9 秒だった。

## 9. トピックと接続先

| トピック | 内容 |
|---|---|
| `amedas/live` | 書き込みごとの全属性 |
| `amedas/cond/snowfall1h_ge5` | 正時の降雪量が 5cm/h 以上(既定の範囲で 5 件) |
| `amedas/cond/snowfall1h_ge3` | 正時の降雪量が 3cm/h 以上(既定の範囲で 16 件) |

接続先は `ws://127.0.0.1:9001`(MQTT over WebSocket、認証なし)、QoS 0。

## 10. 工程1から持ち越す点

- 区の境界の座標を小数4桁に丸めたため、隣の区との境界に細いすき間が出ないか、地図で目視で確かめる。
- 気温の欠測が約 32% ある(11月、多くの区で約 1,380 行)。欠測の表示方法を決める。
- 北区の観測点は推定である(設計書 3.5)。

## 11. 未確認の点

- Stellio が、ETSI のコア context を、ネットワークなしで解決できるか(会場でネットワークを切ったときに動くか)。
- (確認済み)`--changed-only` でも、条件付き購読の通知は届く。12:00〜13:50 JST の範囲(12 ステップ)を 6,000ms で再生し、欠落 0 件、3cm/h 以上が 1 件(全属性を書いた場合と同じ件数)、遅延の p95 は 530ms だった。
