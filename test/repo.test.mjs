import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

test('LICENSE がある', () => {
  assert.ok(existsSync('LICENSE'));
});

test('.gitignore が秘密情報と生データを除外している', () => {
  const lines = readFileSync('.gitignore', 'utf8').split('\n').map((l) => l.trim());
  for (const required of ['.env', 'data/raw/', 'node_modules/', '.playwright-mcp/', '.claude/', '.superpowers/']) {
    assert.ok(lines.includes(required), `.gitignore に ${required} がありません`);
  }
});
