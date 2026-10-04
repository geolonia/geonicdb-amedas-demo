import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { jstDate, recordRetrievedAt, readRetrievedAt } from '../scripts/prepare/retrieved-at.mjs';

const tmp = () => mkdtempSync(join(tmpdir(), 'ra-'));
const REFRESH = /npm run build:data -- --refresh/;

test('jstDate は UTC ではなく JST の日付を返す', () => {
  assert.equal(jstDate(new Date('2026-10-03T15:00:00Z')), '2026-10-04');
  assert.equal(jstDate(new Date('2026-10-03T14:59:59Z')), '2026-10-03');
});

test('ダウンロード時に、ファイルごとの取得日(JST)を記録し、キャッシュ再利用時に読み戻す', () => {
  const dir = tmp();
  recordRetrievedAt(dir, 'a.csv', new Date('2026-10-03T15:00:00Z'));
  recordRetrievedAt(dir, 'n03.zip', new Date('2026-10-10T00:00:00Z'));
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'retrieved-at.json'), 'utf8')), { 'a.csv': '2026-10-04', 'n03.zip': '2026-10-10' });
  assert.equal(readRetrievedAt(dir, ['a.csv']), '2026-10-04');
  assert.equal(readRetrievedAt(dir, ['n03.zip']), '2026-10-10');
});

test('あとのダウンロードは、そのファイルの取得日だけを書き換える', () => {
  const dir = tmp();
  recordRetrievedAt(dir, 'a.csv', new Date('2026-10-03T15:00:00Z'));
  recordRetrievedAt(dir, 'b.csv', new Date('2026-10-03T15:00:00Z'));
  recordRetrievedAt(dir, 'b.csv', new Date('2026-11-01T00:00:00Z'));
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'retrieved-at.json'), 'utf8')), { 'a.csv': '2026-10-04', 'b.csv': '2026-11-01' });
});

test('複数のファイルの取得日は、最も早い日付を返す', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'retrieved-at.json'), JSON.stringify({ 'a.csv': '2026-10-04', 'b.csv': '2026-09-30', 'c.csv': '2026-10-02' }));
  assert.equal(readRetrievedAt(dir, ['a.csv', 'b.csv', 'c.csv']), '2026-09-30');
});

test('記録のファイルがなければ、今日の日付で補わず、--refresh を促すエラーにする', () => {
  assert.throws(() => readRetrievedAt(tmp(), ['a.csv']), REFRESH);
});

test('記録が壊れていれば(JSON でない)、--refresh を促すエラーにする', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'retrieved-at.json'), 'not json');
  assert.throws(() => readRetrievedAt(dir, ['a.csv']), REFRESH);
});

test('一部のファイルの取得日がない、または日付の形でなければ、そのファイル名を示してエラーにする', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'retrieved-at.json'), JSON.stringify({ 'a.csv': '2026-10-04', 'c.csv': 'yesterday' }));
  assert.throws(() => readRetrievedAt(dir, ['a.csv', 'b.csv', 'c.csv']), (e) => REFRESH.test(e.message) && /b\.csv/.test(e.message) && /c\.csv/.test(e.message));
});

test('以前の形式(全体で1つの { date })は、ファイルごとの取得日が分からないためエラーにする', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'retrieved-at.json'), JSON.stringify({ date: '2026-10-04' }));
  assert.throws(() => readRetrievedAt(dir, ['a.csv']), REFRESH);
});

test('以前の形式や壊れた記録があっても、ダウンロードの記録はファイルごとの形で書き直す', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'retrieved-at.json'), 'not json');
  recordRetrievedAt(dir, 'a.csv', new Date('2026-10-03T15:00:00Z'));
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'retrieved-at.json'), 'utf8')), { 'a.csv': '2026-10-04' });
});
