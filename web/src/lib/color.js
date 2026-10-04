// 区の面の色(積雪深の連続色)と、ラベルの読みやすさの計算(純関数)。
//
// 刻みは試作と同じ 0、5、15、25、35cm(暗い青 → 白)。上限の色は、純白(#f4fbff)から少し落として
// 白い文字のラベルが埋もれないようにする(設計書 5.3)。ラベルには暗い半透明の背景を付ける。

export const SNOW_STOPS = Object.freeze([
  [0, '#16233a'],
  [5, '#1f4e79'],
  [15, '#3c88c4'],
  [25, '#8cc7f0'],
  [35, '#dcecf8'],
]);

// まだ通知を受けていない区の色
export const NO_DATA_COLOR = '#262b36';

// ラベルの文字と背景(背景は rgba。CSS の --label-bg と同じ値にする)
export const LABEL_TEXT = '#ffffff';
export const LABEL_BG = Object.freeze({ r: 7, g: 13, b: 24, a: 0.72 });

// MapLibre の fill-color / circle-color の式。feature-state の snow(cm)を読む。値がなければ NO_DATA_COLOR
export function snowColorExpression() {
  return [
    'case',
    ['<', ['to-number', ['coalesce', ['feature-state', 'snow'], -1]], 0],
    NO_DATA_COLOR,
    ['interpolate', ['linear'], ['to-number', ['feature-state', 'snow']], ...SNOW_STOPS.flat()],
  ];
}

export function hexToRgb(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`色の形式が違います: ${hex}`);
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

const toHex = ({ r, g, b }) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const lerp = (a, b, f) => a + (b - a) * f;

// 積雪深(cm)の色。MapLibre の interpolate と同じく、範囲の外は端の色
export function snowColor(cm) {
  if (!Number.isFinite(cm)) return NO_DATA_COLOR;
  const first = SNOW_STOPS[0];
  const last = SNOW_STOPS.at(-1);
  if (cm <= first[0]) return first[1];
  if (cm >= last[0]) return last[1];
  for (let i = 1; i < SNOW_STOPS.length; i++) {
    const [v1, c1] = SNOW_STOPS[i];
    const [v0, c0] = SNOW_STOPS[i - 1];
    if (cm <= v1) {
      const f = (cm - v0) / (v1 - v0);
      const a = hexToRgb(c0);
      const b = hexToRgb(c1);
      return toHex({ r: lerp(a.r, b.r, f), g: lerp(a.g, b.g, f), b: lerp(a.b, b.b, f) });
    }
  }
  return last[1];
}

// 凡例の CSS のグラデーション
export function legendGradientCss() {
  const max = SNOW_STOPS.at(-1)[0];
  const stops = SNOW_STOPS.map(([v, c]) => `${c} ${Math.round((v / max) * 1000) / 10}%`);
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}

// WCAG 2 の相対輝度とコントラスト比
export function relativeLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(a, b) {
  const [l1, l2] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

// 半透明の色を、下の色に重ねた結果
export function compositeOver({ r, g, b, a }, underHex) {
  const u = hexToRgb(underHex);
  return toHex({ r: lerp(u.r, r, a), g: lerp(u.g, g, a), b: lerp(u.b, b, a) });
}
