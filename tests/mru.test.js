import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../extension/mru.js';

const { emptyState, onActivated, onTabRemoved, onWindowRemoved, targetFor } = globalThis.LastTabMRU;

test('toggle: A then B targets A; activating A targets B', () => {
  let s = onActivated(onActivated(emptyState(), 1, 10), 1, 20);
  assert.equal(targetFor(s, 1), 10);
  s = onActivated(s, 1, 10);
  assert.equal(targetFor(s, 1), 20);
});

test('first tab has no target', () => {
  assert.equal(targetFor(onActivated(emptyState(), 1, 10), 1), null);
  assert.equal(targetFor(emptyState(), 1), null);
});

test('re-activating current keeps previous', () => {
  const s = onActivated(onActivated(onActivated(emptyState(), 1, 10), 1, 20), 1, 20);
  assert.equal(targetFor(s, 1), 10);
});

test('closing previous clears target', () => {
  const s = onTabRemoved(onActivated(onActivated(emptyState(), 1, 10), 1, 20), 1, 10);
  assert.equal(targetFor(s, 1), null);
});

test('closing current keeps previous for next activation', () => {
  // tabs A=10, B=20, C=30; on C with previous B; close C, Safari activates A
  let s = [10, 20, 30].reduce((st, t) => onActivated(st, 1, t), emptyState());
  s = onActivated(onTabRemoved(s, 1, 30), 1, 10);
  assert.equal(targetFor(s, 1), 20);
});

test('closing current then activating previous clears previous', () => {
  let s = onActivated(onActivated(emptyState(), 1, 10), 1, 20);
  s = onActivated(onTabRemoved(s, 1, 20), 1, 10);
  assert.equal(targetFor(s, 1), null);
});

test('windows are independent', () => {
  let s = onActivated(onActivated(emptyState(), 1, 10), 1, 20);
  s = onActivated(onActivated(s, 2, 30), 2, 40);
  assert.equal(targetFor(s, 1), 10);
  assert.equal(targetFor(s, 2), 30);
});

test('removing a window deletes its entry', () => {
  const s = onWindowRemoved(onActivated(onActivated(emptyState(), 1, 10), 1, 20), 1);
  assert.deepEqual(s, {});
});

test('functions do not mutate input', () => {
  const s = Object.freeze(onActivated(emptyState(), 1, 10));
  Object.freeze(s['1']);
  assert.doesNotThrow(() => { onActivated(s, 1, 20); onTabRemoved(s, 1, 10); onWindowRemoved(s, 1); });
});
