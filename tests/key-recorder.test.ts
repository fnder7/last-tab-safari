import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyCombo } from '../src/options/key-recorder.ts';
import type { KeyLike } from '../src/shared/combo.ts';

const key = (over: Partial<KeyLike>): KeyLike => ({
  code: 'KeyE',
  key: 'e',
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  ...over,
});

test('Escape cancels recording', () => {
  assert.deepEqual(classifyCombo(key({ key: 'Escape', code: 'Escape' })), { kind: 'cancel' });
});

test('modifier alone keeps waiting', () => {
  for (const k of ['Alt', 'Control', 'Meta', 'Shift']) {
    assert.deepEqual(classifyCombo(key({ key: k, code: `${k}Left`, altKey: k === 'Alt' })), { kind: 'wait' });
  }
});

test('⇧E is invalid: needs ⌘, ⌥ or ⌃', () => {
  assert.deepEqual(classifyCombo(key({ shiftKey: true, key: 'E' })), { kind: 'invalid', reason: 'modifier' });
  assert.deepEqual(classifyCombo(key({})), { kind: 'invalid', reason: 'modifier' });
});

test('⌥F13 is invalid: unsupported key', () => {
  assert.deepEqual(classifyCombo(key({ altKey: true, code: 'F13', key: 'F13' })), { kind: 'invalid', reason: 'key' });
});

test('⌃⌥E is accepted with both flags, whatever the layout', () => {
  assert.deepEqual(classifyCombo(key({ ctrlKey: true, altKey: true, key: 'у' })), {
    kind: 'accept',
    combo: { code: 'KeyE', meta: false, alt: true, ctrl: true, shift: false },
  });
});

test('⌘L is accepted (the page warns about the Safari conflict)', () => {
  assert.equal(classifyCombo(key({ metaKey: true, code: 'KeyL', key: 'l' })).kind, 'accept');
});
