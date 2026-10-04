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
