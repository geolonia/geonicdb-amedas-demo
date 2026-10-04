import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SNOW_STOPS, NO_DATA_COLOR, LABEL_TEXT, LABEL_BG, snowColor, snowColorExpression, legendGradientCss,
  relativeLuminance, contrastRatio, compositeOver, hexToRgb,
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
