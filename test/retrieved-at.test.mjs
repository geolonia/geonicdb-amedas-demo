import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { jstDate, recordRetrievedAt, readRetrievedAt } from '../scripts/prepare/retrieved-at.mjs';

test('jstDate は UTC ではなく JST の日付を返す', () => {
  assert.equal(jstDate(new Date('2026-10-03T15:00:00Z')), '2026-10-04');
  assert.equal(jstDate(new Date('2026-10-03T14:59:59Z')), '2026-10-03');
});

test('記録がなければ、今日(JST)の日付にする', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ra-'));
  assert.equal(readRetrievedAt(dir, new Date('2026-10-03T15:00:00Z')), '2026-10-04');
});

test('ダウンロード時に記録した日付を、キャッシュ再利用時に読み戻す', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ra-'));
  recordRetrievedAt(dir, new Date('2026-10-03T15:00:00Z'));
  assert.equal(readRetrievedAt(dir, new Date('2026-12-01T00:00:00Z')), '2026-10-04');
});

test('記録が壊れていれば、今日(JST)の日付にする', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ra-'));
  writeFileSync(join(dir, 'retrieved-at.json'), 'not json');
  assert.equal(readRetrievedAt(dir, new Date('2026-10-03T15:00:00Z')), '2026-10-04');
});
