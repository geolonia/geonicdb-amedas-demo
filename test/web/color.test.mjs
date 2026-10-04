import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SNOW_STOPS, NO_DATA_COLOR, LABEL_TEXT, LABEL_BG, snowColor, snowColorExpression, legendGradientCss,
  relativeLuminance, contrastRatio, compositeOver, hexToRgb, HIT_PILL, requiredContrast,
} from '../../web/src/lib/color.js';

test('刻みは 0、5、15、25、35cm(設計書 5.3)', () => {
  assert.deepEqual(SNOW_STOPS.map(([v]) => v), [0, 5, 15, 25, 35]);
});

test('snowColor: 刻みの上では刻みの色、間は線形、範囲の外は端の色、欠測は NO_DATA_COLOR', () => {
  for (const [v, c] of SNOW_STOPS) assert.equal(snowColor(v), c);
  assert.equal(snowColor(-3), SNOW_STOPS[0][1]);
  assert.equal(snowColor(80), SNOW_STOPS.at(-1)[1]);
  assert.equal(snowColor(null), NO_DATA_COLOR);
  // 0 と 5 の中間(#16233a と #1f4e79 の平均)
  assert.equal(snowColor(2.5), '#1b395a');
});

test('積雪が増えるほど明るくなる', () => {
  let prev = -1;
  for (let cm = 0; cm <= 35; cm++) {
    const l = relativeLuminance(snowColor(cm));
    assert.ok(l >= prev, `${cm}cm`);
    prev = l;
  }
});

test('上限の色は、試作の純白(#f4fbff)より暗い', () => {
  assert.ok(relativeLuminance(SNOW_STOPS.at(-1)[1]) < relativeLuminance('#f4fbff'));
});

test('ラベル(白い文字 + 暗い背景)は、どの積雪の色の上でもコントラスト比 4.5 以上', () => {
  for (let cm = 0; cm <= 35; cm++) {
    const bg = compositeOver(LABEL_BG, snowColor(cm));
    assert.ok(contrastRatio(LABEL_TEXT, bg) >= 4.5, `${cm}cm: ${contrastRatio(LABEL_TEXT, bg)}`);
  }
  assert.ok(contrastRatio(LABEL_TEXT, compositeOver(LABEL_BG, NO_DATA_COLOR)) >= 4.5);
});

test('MapLibre の式: 値がなければ NO_DATA_COLOR、あれば刻みで補間', () => {
  const e = snowColorExpression();
  assert.equal(e[0], 'case');
  assert.equal(e[2], NO_DATA_COLOR);
  assert.deepEqual(e[3].slice(3), [0, '#16233a', 5, '#1f4e79', 15, '#3c88c4', 25, '#8cc7f0', 35, '#dcecf8']);
});

test('凡例のグラデーション', () => {
  assert.equal(legendGradientCss(), 'linear-gradient(90deg, #16233a 0%, #1f4e79 14.3%, #3c88c4 42.9%, #8cc7f0 71.4%, #dcecf8 100%)');
});

test('hexToRgb は不正な形を拒む', () => {
  assert.deepEqual(hexToRgb('#ff0080'), { r: 255, g: 0, b: 128 });
  assert.throws(() => hexToRgb('red'));
});

test('ラベルの背景は、CSS の --label-bg と同じ値', () => {
  const css = readFileSync('web/src/style.css', 'utf8');
  const { r, g, b, a } = LABEL_BG;
  assert.ok(css.includes(`--label-bg: rgba(${r}, ${g}, ${b}, ${a});`));
});

test('requiredContrast: WCAG の大きい文字(太字 18.66px 以上、通常 24px 以上)は 3、それ以外は 4.5', () => {
  assert.equal(requiredContrast(16, true), 4.5);
  assert.equal(requiredContrast(18, true), 4.5);
  assert.equal(requiredContrast(18.67, true), 3);
  assert.equal(requiredContrast(20, true), 3);
  assert.equal(requiredContrast(20, false), 4.5);
  assert.equal(requiredContrast(24, false), 3);
});

test('ヒットのピル(ge5、ge3)は、16px と 20px の太字のどちらでも、コントラスト比 4.5 以上', () => {
  for (const tier of ['ge5', 'ge3']) {
    const { bg, text } = HIT_PILL[tier];
    const ratio = contrastRatio(text, bg);
    for (const px of [16, 20]) assert.ok(ratio >= requiredContrast(px, true), `${tier} ${px}px: ${ratio}`);
    assert.ok(ratio >= 4.5, `${tier}: ${ratio}`);
  }
});

test('ヒットのピルの強さの色は区別できる(ge5 は赤系、ge3 は橙系で、背景の色が違う)', () => {
  const r5 = hexToRgb(HIT_PILL.ge5.bg);
  const r3 = hexToRgb(HIT_PILL.ge3.bg);
  assert.ok(r5.r > r5.g * 2, 'ge5 は赤系');
  assert.ok(r3.g > r3.b * 2 && r3.r > r3.g, 'ge3 は橙系');
  assert.notEqual(HIT_PILL.ge5.bg, HIT_PILL.ge3.bg);
});

test('ヒットのピルの色は、CSS の --pill5-bg / --pill5-text / --pill3-bg / --pill3-text と同じ値', () => {
  const css = readFileSync('web/src/style.css', 'utf8');
  assert.ok(css.includes(`--pill5-bg: ${HIT_PILL.ge5.bg};`));
  assert.ok(css.includes(`--pill5-text: ${HIT_PILL.ge5.text};`));
  assert.ok(css.includes(`--pill3-bg: ${HIT_PILL.ge3.bg};`));
  assert.ok(css.includes(`--pill3-text: ${HIT_PILL.ge3.text};`));
});

// CSS から、#attribution の文字色と、--panel の rgba、--bg を読む(テストが CSS に追従する)
function attributionStyle() {
  const css = readFileSync('web/src/style.css', 'utf8');
  const block = /#attribution\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
  const fg = /(?:^|;|\s)color:\s*(#[0-9a-f]{6})\s*;/i.exec(block)?.[1];
  const usesPanel = /background:\s*var\(--panel\)/.test(block);
  const panel = /--panel:\s*rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/.exec(css);
  const bg = /--bg:\s*(#[0-9a-f]{6})/i.exec(css)?.[1];
  return { fg, usesPanel, bg, panel: panel && { r: +panel[1], g: +panel[2], b: +panel[3], a: +panel[4] } };
}

test('出典(#attribution)は、パネルの背景を持ち、どの区の色(0〜80cm、欠測)の上でも、背景の上でも、コントラスト比 4.5 以上', () => {
  const { fg, usesPanel, bg, panel } = attributionStyle();
  assert.ok(fg, '文字色が読めない');
  assert.ok(usesPanel, '背景に var(--panel) を使う');
  assert.ok(panel && bg);
  for (let cm = 0; cm <= 80; cm++) {
    const ratio = contrastRatio(fg, compositeOver(panel, snowColor(cm)));
    assert.ok(ratio >= 4.5, `${cm}cm: ${ratio}`);
  }
  assert.ok(contrastRatio(fg, compositeOver(panel, NO_DATA_COLOR)) >= 4.5, '欠測の区');
  assert.ok(contrastRatio(fg, compositeOver(panel, bg)) >= 4.5, '背景');
});
