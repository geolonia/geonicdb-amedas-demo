// 音(余裕があれば。任意)。条件ヒットで短いチャイムを鳴らす(5cm 以上は高め、3cm 以上は低め)。
// ブラウザーは、利用者の操作なしでは音を出さない。発表の冒頭に「音を有効化」を1回押す(ページを読み直したら、また押す)。
// 同じ書き込みの ge3 と ge5 が続けて届いたとき(封筒のないブローカーでは順不同)に二度鳴らさないよう、
// 最初の通知から 200ms 待って、その時点の強い方で1回だけ鳴らす(画面の演出は待たない)。
// 待ったあとに届く同じ書き込みの通知(Stellio では ge5 が約 430ms 後)は、判定済みのキーとして鳴らさない(60 秒後の再表示では鳴らす)。
// 大量の通知や隠れたタブで溜まらないよう、master の音量・間引き・同時数の上限・鮮度の確認・タブの表示の確認を入れる(lib/sound-gate.js)。
import { isFresh, createChimeLimiter, createSoundedKeys } from '../lib/sound-gate.js';

const SETTLE_MS = 200;

export function installSound(app) {
  let ctx = null;
  let master = null;
  let on = false;
  const limiter = createChimeLimiter();
  const sounded = createSoundedKeys(); // 判定を済ませたキー。発音後に届く同じ書き込みの upgrade では鳴らさない
  const pending = new Map(); // hit.key -> { tier, receivedAt }
  const visible = () => document.visibilityState === 'visible';

  function chime(tier) {
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const freqs = tier === 'ge5' ? [880, 1318] : [660, 880];
    freqs.forEach((hz, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = hz;
      const start = t + i * 0.09;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.18, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.7);
      osc.connect(gain).connect(master);
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
      osc.start(start);
      osc.stop(start + 0.75);
    });
    app.soundPlays = (app.soundPlays ?? 0) + 1;
  }

  const label = () => (on ? `音: オン(${ctx.state})` : ctx && ctx.state !== 'running' ? `音: オフ(${ctx.state}。もう一度押す)` : '音: オフ');

  app.controls?.addButton('音を有効化(クリックが必要)', async (button) => {
    try {
      if (on) {
        on = false;
      } else {
        if (!ctx) {
          ctx = new AudioContext();
          master = ctx.createGain();
          master.gain.value = 0.3;
          master.connect(ctx.destination);
        }
        if (ctx.state !== 'running') await ctx.resume();
        on = ctx.state === 'running'; // 再生できない状態(suspended など)のままなら、オンにしない
      }
      button.textContent = label();
      if (on) chime('ge3');
    } catch (e) {
      on = false;
      console.warn('音を有効にできません', e);
      button.textContent = '音: 使えません';
    }
  });

  app.on('hit', (hit, obs) => {
    if (!on || !visible() || sounded.has(hit.key, Date.now())) return;
    const known = pending.get(hit.key);
    const tier = hit.tier === 'ge5' || known?.tier === 'ge5' ? 'ge5' : 'ge3';
    pending.set(hit.key, { tier, receivedAt: known?.receivedAt ?? obs?.receivedAt ?? Date.now() });
    if (known !== undefined) return;
    setTimeout(() => {
      const p = pending.get(hit.key);
      try {
        // 待っている間にオフ・タブが隠れた、または古くなっていたら鳴らさない
        if (on && visible() && isFresh(p.receivedAt, Date.now()) && limiter.admit(p.tier, Date.now())) chime(p.tier);
      } finally {
        sounded.add(hit.key, Date.now());
        pending.delete(hit.key);
      }
    }, SETTLE_MS);
  });
}
