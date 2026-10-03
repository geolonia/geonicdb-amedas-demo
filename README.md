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
