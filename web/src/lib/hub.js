// 演出をつなぐ小さなイベントの仕組み(純関数)。
// main.js は、受信した通知を 'live'、'hit'、'conditional' として流し、'tick'(4回/秒)と 'layout'(地図の再配置)を流す。
// 各演出は app.on(...) で受け取る。演出を削るときは、main.js の install の1行を消せばよい。
// 1つの演出が例外を投げても、ほかの演出と受信の処理は止めない。

export const EVENTS = Object.freeze(['live', 'conditional', 'hit', 'tick', 'layout']);

export function createHub({ onError = (e) => console.error(e) } = {}) {
  const handlers = new Map(EVENTS.map((e) => [e, []]));
  return {
    on(event, fn) {
      const list = handlers.get(event);
      if (!list) throw new Error(`未知のイベント: ${event}`);
      list.push(fn);
    },
    emit(event, ...args) {
      for (const fn of handlers.get(event) ?? []) {
        try {
          fn(...args);
        } catch (e) {
          onError(e);
        }
      }
    },
  };
}
