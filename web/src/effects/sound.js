// 音(余裕があれば。任意)。条件ヒットで短いチャイムを鳴らす(5cm 以上は高め、3cm 以上は低め)。
// ブラウザーは、利用者の操作なしでは音を出さない。発表の冒頭に「音を有効化」を1回押す(ページを読み直したら、また押す)。
// 同じ書き込みの ge3 と ge5 が続けて届いたとき(封筒のないブローカーでは順不同)に二度鳴らさないよう、
// 最初の通知から 200ms 待って、その時点の強い方で1回だけ鳴らす(画面の演出は待たない)。
const SETTLE_MS = 200;

export function installSound(app) {
  let ctx = null;
  let on = false;
  const pending = new Map(); // hit.key -> tier

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
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.75);
    });
    app.soundPlays = (app.soundPlays ?? 0) + 1;
  }

  app.controls?.addButton('音を有効化(クリックが必要)', async (button) => {
    try {
      ctx = ctx ?? new AudioContext();
      if (ctx.state !== 'running') {
        await ctx.resume();
        on = true;
      } else {
        on = !on;
      }
      button.textContent = on ? `音: オン(${ctx.state})` : '音: オフ';
      if (on) chime('ge3');
    } catch (e) {
      console.warn('音を有効にできません', e);
      button.textContent = '音: 使えません';
    }
  });

  app.on('hit', (hit) => {
    if (!on) return;
    const known = pending.get(hit.key);
    pending.set(hit.key, hit.tier === 'ge5' || known === 'ge5' ? 'ge5' : 'ge3');
    if (known !== undefined) return;
    setTimeout(() => {
      chime(pending.get(hit.key));
      pending.delete(hit.key);
    }, SETTLE_MS);
  });
}
