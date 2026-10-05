// fn を実行し、例外は onError に渡して外へ投げない(戻り値は fn の値。例外のときは undefined)。
// 1件の処理の失敗が、mqtt.js のメッセージのコールバックに届かないようにする。
export function safely(fn, onError) {
  try {
    return fn();
  } catch (e) {
    onError(e);
    return undefined;
  }
}
