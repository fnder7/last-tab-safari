import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SHORTCUTS,
  comboFromEvent,
  effectiveReverse,
  isValidCombo,
  label,
  parseStored,
  safariConflict,
  type Combo,
  type KeyLike,
} from '../src/shared/combo.ts';

const combo = (code: string, mods: Partial<Omit<Combo, 'code'>> = {}): Combo => ({
  code,
  meta: false,
  alt: false,
  ctrl: false,
  shift: false,
  ...mods,
});

const key = (over: Partial<KeyLike>): KeyLike => ({
  code: 'KeyQ',
  key: 'œ',
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  ...over,
});

test('default is ⌥Q with automatic reverse', () => {
  assert.deepEqual(DEFAULT_SHORTCUTS, { forward: combo('KeyQ', { alt: true }), reverse: null });
});

test('migrates legacy {modifier, code}', () => {
  assert.deepEqual(parseStored({ modifier: 'ctrl', code: 'KeyE' }), { forward: combo('KeyE', { ctrl: true }), reverse: null });
  assert.deepEqual(parseStored({ modifier: 'alt', code: 'KeyE' }), { forward: combo('KeyE', { alt: true }), reverse: null });
});

test('reads the new format and falls back on garbage', () => {
  const stored = { forward: combo('KeyE', { meta: true }), reverse: combo('KeyW', { ctrl: true }) };
  assert.deepEqual(parseStored(stored), stored);
  assert.deepEqual(parseStored({ forward: combo('KeyE', { meta: true }), reverse: combo('KeyW') }), {
    forward: combo('KeyE', { meta: true }),
    reverse: null,
  });
  assert.deepEqual(parseStored(undefined), DEFAULT_SHORTCUTS);
  assert.deepEqual(parseStored({ forward: combo('KeyE') }), DEFAULT_SHORTCUTS);
});

test('invalid without cmd/alt/ctrl', () => {
  assert.equal(isValidCombo(combo('KeyE')), false);
  assert.equal(isValidCombo(combo('KeyE', { shift: true })), false);
  assert.equal(isValidCombo(combo('KeyE', { meta: true })), true);
  assert.equal(isValidCombo(combo('KeyE', { ctrl: true, shift: true })), true);
  assert.equal(isValidCombo(combo('F13', { alt: true })), false);
  for (const code of ['Digit0', 'Comma', 'Backslash', 'Space', 'Tab', 'F1', 'F12']) {
    assert.equal(isValidCombo(combo(code, { alt: true })), true, code);
  }
});

test('effectiveReverse auto adds shift', () => {
  assert.deepEqual(effectiveReverse({ forward: combo('KeyE', { alt: true }), reverse: null }), combo('KeyE', { alt: true, shift: true }));
});

test('effectiveReverse keeps a custom reverse', () => {
  const reverse = combo('KeyW', { ctrl: true });
  assert.deepEqual(effectiveReverse({ forward: combo('KeyE', { alt: true }), reverse }), reverse);
});

test('effectiveReverse is nil when forward has shift', () => {
  assert.equal(effectiveReverse({ forward: combo('KeyE', { meta: true, shift: true }), reverse: null }), null);
});

test('comboFromEvent reads code and all modifiers, whatever the layout', () => {
  assert.deepEqual(comboFromEvent(key({ altKey: true, key: 'й' })), combo('KeyQ', { alt: true }));
  assert.deepEqual(
    comboFromEvent(key({ metaKey: true, altKey: true, ctrlKey: true, shiftKey: true, code: 'KeyE' })),
    combo('KeyE', { meta: true, alt: true, ctrl: true, shift: true }),
  );
  for (const k of ['Alt', 'Control', 'Meta', 'Shift']) assert.equal(comboFromEvent(key({ key: k, code: `${k}Left` })), null);
});

test('label orders modifiers like macOS', () => {
  assert.equal(label(combo('KeyE', { meta: true, alt: true, ctrl: true, shift: true })), '⌃ ⌥ ⇧ ⌘ E');
  assert.equal(label(combo('Digit1', { alt: true })), '⌥ 1');
  assert.equal(label(combo('Comma', { ctrl: true })), '⌃ ,');
  assert.equal(label(combo('F5', { ctrl: true })), '⌃ F5');
  assert.equal(label(combo('Space', { alt: true })), '⌥ Space');
});

test('warns about Safari shortcuts', () => {
  assert.equal(safariConflict(combo('KeyL', { meta: true })), 'Open Location');
  assert.equal(safariConflict(combo('KeyT', { meta: true, shift: true })), 'Reopen Last Closed Tab');
  assert.equal(safariConflict(combo('KeyE', { meta: true, alt: true })), 'Empty Caches');
  assert.equal(safariConflict(combo('KeyE', { alt: true })), null);
  assert.equal(safariConflict(combo('KeyL', { meta: true, ctrl: true })), null);
});
