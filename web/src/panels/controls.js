// 切り替えのパネル(発表者が演出をオン・オフする)。凡例の上に置く。
// ほかの演出は app.controls.addToggle / addButton で、自分の切り替えを足す(なければ足さない)。
export function installControls(app) {
  const panel = document.createElement('section');
  panel.id = 'controls';
  panel.className = 'panel';
  panel.setAttribute('aria-label', '切り替え');
  const toggles = document.createElement('div');
  toggles.className = 'toggles';
  const buttons = document.createElement('div');
  buttons.className = 'buttons';
  panel.append(toggles, buttons);
  document.body.append(panel);

  app.controls = {
    addToggle(label, initial, onChange) {
      const wrap = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = initial;
      input.addEventListener('change', () => onChange(input.checked));
      wrap.append(input, ` ${label}`);
      toggles.append(wrap);
      return input;
    },
    addButton(text, onClick) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = text;
      b.addEventListener('click', () => onClick(b));
      buttons.append(b);
      return b;
    },
  };

  const show = (id) => (v) => {
    document.getElementById(id).hidden = !v;
  };
  app.controls.addToggle('時計', true, show('clocks'));
  app.controls.addToggle('HUD', true, show('hud'));
  app.controls.addToggle('波紋', true, (v) => app.ripples?.setEnabled(v));
}
