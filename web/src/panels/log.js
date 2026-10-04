// 通知ログ(背景の演出。主役はヒット欄)。受けた通知を新しい順に最大 MAX_ROWS 行。
// 通知ごとに DOM を触らず、tick(4回/秒)でまとめて足す。条件付き購読の通知は、重複排除の前の1件ずつを色付きで出す。
import { formatSnowDepth, formatTemperature, formatTimeOfDay } from '../lib/format.js';

const MAX_ROWS = 40;

// tick の間に溜まる行(古い順に push する)を、新しい方から max 件だけ残す(裏のタブで tick が間引かれても、溜まり続けない)。
// 渡した配列を直接変える
export function boundPending(pending, max = MAX_ROWS) {
  if (pending.length > max) pending.splice(0, pending.length - max);
  return pending;
}

export function installLog(app) {
  const side = document.getElementById('side');
  const title = document.createElement('h2');
  title.textContent = '通知ログ(新しい順)';
  const list = document.createElement('ol');
  list.id = 'log';
  side.append(title, list);

  let pending = [];
  const row = (className, receivedAt, ward, text) => {
    const li = document.createElement('li');
    li.className = className;
    const time = document.createElement('time');
    time.textContent = formatTimeOfDay(receivedAt);
    const name = document.createElement('span');
    name.className = 'ward';
    name.textContent = app.wardNames.get(ward) ?? ward;
    li.append(time, name, text);
    pending.push(li);
    boundPending(pending);
  };

  let enabled = true;
  app.controls?.addToggle('通知ログ', true, (v) => {
    enabled = v;
    title.hidden = !v;
    list.hidden = !v;
    pending = [];
  });

  app.on('live', (obs, state) => {
    if (enabled) row('live', obs.receivedAt, obs.ward, `積雪深 ${formatSnowDepth(state.snowHeight)} ・ 気温 ${formatTemperature(state.temperature)}`);
  });
  app.on('conditional', (obs) => {
    const threshold = obs.kind === 'ge5' ? 5 : 3;
    const v = obs.attrs.snowfall1h?.value;
    if (enabled) row(obs.kind, obs.receivedAt, obs.ward, `★ snowfall1h=${v ?? '—'}cm(q: snowfall1h>=${threshold})`);
  });
  app.on('tick', () => {
    if (pending.length === 0) return;
    list.prepend(...pending.reverse());
    pending = [];
    while (list.children.length > MAX_ROWS) list.lastElementChild.remove();
  });
}
