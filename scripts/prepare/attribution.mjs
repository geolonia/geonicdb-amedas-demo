const N03_PAGE = 'https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2025.html';

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
  区ごとの CSV の URL は、\`data/source-meta.json\` と、各 \`data/observations/*.json\` の \`source\` に記録しています。

## 区の境界(国土数値情報)

- 出典: 「国土数値情報(行政区域データ)」(国土交通省)(${n03.version})を加工して作成
- 取得元: ${n03.url}(データのページ: ${N03_PAGE})
- 加工: 札幌市10区だけを抽出し、座標を小数点以下4桁に丸めて GeoJSON にしました(国土数値情報を加工して作成)。
  結果は \`data/wards.geojson\` にあります。

## 観測地点の座標(国土地理院)

- 出典:国土地理院ウェブサイト(https://www.gsi.go.jp/)
- 加工: 各区の土木センターの住所を国土地理院の住所検索 API で検索して得た座標を、観測地点の位置として採用しました(住所から座標への変換、加工して作成)。
  結果は \`data/stations.json\` にあります。

## 当日の最新の気象値(気象庁)

地図アプリは、会場のネットワークがあるとき、気象庁のホームページで公開されているアメダスの観測値(札幌)を取得して表示します。
表示するときは、出典(気象庁)と、加工した旨を画面に示します。
`;
}
