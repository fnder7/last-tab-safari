import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPreviewCache } from '../src/background/previews.ts';

test('set/get/delete', () => {
  const cache = createPreviewCache();
  cache.set(1, 'a');
  assert.equal(cache.get(1), 'a');
  cache.delete(1);
  assert.equal(cache.get(1), undefined);
  assert.equal(cache.size, 0);
});

test('evicts oldest when full', () => {
  const cache = createPreviewCache({ maxEntries: 2 });
  cache.set(1, 'a');
  cache.set(2, 'b');
  cache.set(3, 'c');
  assert.equal(cache.get(1), undefined);
  assert.equal(cache.get(2), 'b');
  assert.equal(cache.get(3), 'c');
  assert.equal(cache.size, 2);
});

test('re-set refreshes age', () => {
  const cache = createPreviewCache({ maxEntries: 2 });
  cache.set(1, 'a');
  cache.set(2, 'b');
  cache.set(1, 'a2');
  cache.set(3, 'c');
  assert.equal(cache.get(2), undefined);
  assert.equal(cache.get(1), 'a2');
});
