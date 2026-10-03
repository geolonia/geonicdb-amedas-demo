# compose/stellio/ について

`compose/stellio/` の3つのファイルは、Stellio Context Broker(https://github.com/stellio-hub/stellio-context-broker)
のタグ 2.37.0 の `docker-compose.yml`、`docker-compose-dependencies.yml`、`.env` です(Apache License 2.0)。
変更点は、`stellio.env` の末尾に、ポートを 127.0.0.1 にだけ公開する設定を追記したことです。
`stellio.env` のパスワードは、Stellio が公開している既定値です(ローカルでの実行専用)。
