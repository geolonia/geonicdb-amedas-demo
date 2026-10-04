# compose/stellio/ について

`compose/stellio/` の3つのファイル(`docker-compose.yml`、`docker-compose-dependencies.yml`、`stellio.env`)は、
Stellio Context Broker(https://github.com/stellio-hub/stellio-context-broker)のタグ 2.37.0 の
`docker-compose.yml`、`docker-compose-dependencies.yml`、`.env` です。

これらのファイルは **Apache License 2.0** であり、このリポジトリのライセンス(MIT)ではありません。
ライセンスの全文は `compose/stellio/LICENSE-Apache-2.0`(upstream のタグ 2.37.0 の `LICENSE.txt`、無編集)にあります。
upstream の著作権者の表記は、upstream の LICENSE とリポジトリを参照してください。

変更点は、`stellio.env` の末尾に、ポートを 127.0.0.1 にだけ公開する設定と、upstream の `.env` にない変数
(`APPLICATION_TENANTS_0_CLIENTID`、`APPLICATION_TENANTS_0_CLIENTSECRET`)を追記したことです。

`stellio.env` の `POSTGRES_PASS=stellio_password` は、Stellio が公開している既定値です(ローカルでの実行専用)。
シークレットのスキャンに検出される場合があります。
