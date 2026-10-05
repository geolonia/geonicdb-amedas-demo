import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canPulse, MAX_LIVE_RINGS } from '../../web/src/lib/pulse.js';

test('隠れたタブでは、通常の波紋を出さない', () => {
  assert.equal(canPulse({ hidden: true, active: 0 }), false);
  assert.equal(canPulse({ hidden: false, active: 0 }), true);
});

test('同時に出ている波紋が上限に達したら、出さない', () => {
  assert.equal(MAX_LIVE_RINGS, 40);
  assert.equal(canPulse({ hidden: false, active: 39 }), true);
  assert.equal(canPulse({ hidden: false, active: 40 }), false);
  assert.equal(canPulse({ hidden: false, active: 3, max: 3 }), false);
});
