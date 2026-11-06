import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyState,
  normalize,
  onActivated,
  onTabRemoved,
  onWindowRemoved,
  orderFor,
  type MruState,
} from '../src/background/mru.ts';

const activateAll = (state: MruState, windowId: number, ids: number[]) =>
  ids.reduce((s, id) => onActivated(s, windowId, id), state);

test('activation moves tab to front', () => {
  const s = activateAll(emptyState(), 1, [10, 20, 30, 20]);
  assert.deepEqual(orderFor(s, 1), [20, 30, 10]);
});

test('re-activating front tab returns same object', () => {
  const s = activateAll(emptyState(), 1, [10, 20]);
  assert.equal(onActivated(s, 1, 20), s);
});

test('closing a tab removes it', () => {
  const s = onTabRemoved(activateAll(emptyState(), 1, [10, 20, 30]), 1, 20);
  assert.deepEqual(orderFor(s, 1), [30, 10]);
});

test('windows are independent', () => {
  let s = activateAll(emptyState(), 1, [10, 20]);
  s = activateAll(s, 2, [30, 40]);
  assert.deepEqual(orderFor(s, 1), [20, 10]);
  assert.deepEqual(orderFor(s, 2), [40, 30]);
});

test('removing a window deletes its entry', () => {
  const s = onWindowRemoved(activateAll(emptyState(), 1, [10, 20]), 1);
  assert.deepEqual(s, {});
});

test('normalize converts legacy entries', () => {
  const s = normalize({ 1: { current: 20, previous: 10 }, 2: { current: 5, previous: null } });
  assert.deepEqual(orderFor(s, 1), [20, 10]);
  assert.deepEqual(orderFor(s, 2), [5]);
});

test('normalize keeps new-format entries', () => {
  const s = normalize({ 1: { order: [3, 2, 1] } });
  assert.deepEqual(orderFor(s, 1), [3, 2, 1]);
});

test('normalize ignores garbage', () => {
  assert.deepEqual(normalize(undefined), {});
  assert.deepEqual(normalize({ 1: 'x', 2: { order: 'y' } }), {});
});

test('functions do not mutate input', () => {
  const s = activateAll(emptyState(), 1, [10, 20]);
  Object.freeze(s);
  Object.freeze(s['1']);
  Object.freeze(s['1'].order);
  assert.doesNotThrow(() => {
    onActivated(s, 1, 10);
    onTabRemoved(s, 1, 10);
    onWindowRemoved(s, 1);
  });
});

test('orderFor on unknown window is []', () => {
  assert.deepEqual(orderFor(emptyState(), 7), []);
});
