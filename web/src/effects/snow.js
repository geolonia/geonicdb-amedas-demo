// 雪の粒(余裕があれば)。2D canvas を地図とラベルの間に重ねる。
// 区ごとに、観測点の上空から粒を落とす。強さは lib/intensity.js(降雪量と積雪深の増分、3℃ を超えたら 0)。
// 描画の倍率は min(devicePixelRatio, 1.5)(Retina での負荷を抑える。設計書 5.3)。
// 切り替えを外すと canvas を消してループを止める。タブが隠れている間は requestAnimationFrame が止まり、
// 戻った最初のフレームの dt は 0.05 秒までに抑える(粒が飛ばない)。
import { snowIntensity, canvasScale, approach, spawnCount } from '../lib/intensity.js';

const MAX_PARTICLES = 3000;

export function installSnow(app) {
  const canvas = document.createElement('canvas');
  canvas.id = 'snow';
  canvas.setAttribute('aria-hidden', 'true');
  app.fx.before(canvas);
  const ctx = canvas.getContext('2d');

  let width = 0;
  let height = 0;
  const fit = () => {
    const s = canvasScale(window.devicePixelRatio);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * s);
    canvas.height = Math.round(height * s);
    ctx.setTransform(s, 0, 0, s, 0, 0);
  };
  fit();
  window.addEventListener('resize', fit);

  const emitters = new Map(); // 区 -> { current, target, carry, vx }
  const particles = [];
  let enabled = true;
  let raf = 0;
  let last = performance.now();
  app.controls?.addToggle('雪の粒', true, (v) => {
    enabled = v;
    if (v) {
      last = performance.now();
      if (!raf) raf = requestAnimationFrame(frame);
    } else {
      particles.length = 0;
      ctx.clearRect(0, 0, width, height);
    }
  });
  document.addEventListener('visibilitychange', () => {
    last = performance.now();
  });

  app.on('live', (obs, state) => {
    const e = emitters.get(obs.ward) ?? { current: 0, target: 0, carry: 0, vx: 0 };
    e.target = snowIntensity(state);
    // 風下へ流す(風向は風の吹いてくる方位。画面の右が東)
    const speed = state.windSpeed ?? 0;
    const dir = obs.attrs.windDirection?.value;
    e.vx = Number.isFinite(dir) ? -Math.sin((dir * Math.PI) / 180) * speed * 9 : 0;
    emitters.set(obs.ward, e);
  });

  function frame(now) {
    raf = 0;
    if (!enabled) return; // 切り替えを外している間は、ループを止める
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    ctx.clearRect(0, 0, width, height);
    for (const [ward, e] of emitters) {
      e.current = approach(e.current, e.target, dt);
      const p = app.positions.get(ward);
      if (!p) continue;
      const { count, carry } = spawnCount(e.current, dt, e.carry);
      e.carry = carry;
      for (let i = 0; i < count && particles.length < MAX_PARTICLES; i++) {
        particles.push({
          x: p.x + (Math.random() + Math.random() + Math.random() - 1.5) * 110,
          y: p.y - 150 + Math.random() * 60,
          vx: e.vx * (0.6 + Math.random() * 0.8),
          vy: (70 + 90 * e.current) * (0.7 + Math.random() * 0.6),
          r: 0.9 + Math.random() * 1.9,
          bottom: p.y + 170,
        });
      }
    }
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.beginPath();
    for (const q of particles) {
      ctx.moveTo(q.x + q.r, q.y);
      ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2);
    }
    ctx.fill();
    for (let i = particles.length - 1; i >= 0; i--) {
      const q = particles[i];
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      if (q.y > q.bottom) {
        particles[i] = particles[particles.length - 1];
        particles.pop();
      }
    }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  app.snow = { count: () => particles.length, running: () => raf !== 0 };
}
