import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPreviewIds } from '../src/background/previews.ts';

test('add/has/delete', () => {
  const ids = createPreviewIds();
  ids.add(1);
  assert.ok(ids.has(1));
  ids.delete(1);
  assert.ok(!ids.has(1));
  assert.equal(ids.size, 0);
});

test('evicts oldest when full', () => {
  const ids = createPreviewIds([], { maxEntries: 2 });
  ids.add(1);
  ids.add(2);
  ids.add(3);
  assert.deepEqual(ids.toJSON(), [2, 3]);
});

test('re-add refreshes age', () => {
  const ids = createPreviewIds([], { maxEntries: 2 });
  ids.add(1);
  ids.add(2);
  ids.add(1);
  ids.add(3);
  assert.deepEqual(ids.toJSON(), [1, 3]);
});

test('restores from stored ids, ignoring junk', () => {
  assert.deepEqual(createPreviewIds([3, 'x', 1.5, 4]).toJSON(), [3, 4]);
  assert.deepEqual(createPreviewIds(undefined).toJSON(), []);
  assert.deepEqual(createPreviewIds({ 1: 2 }).toJSON(), []);
});
