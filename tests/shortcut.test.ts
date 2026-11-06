import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SHORTCUT,
  MODIFIERS,
  isAllowedCode,
  isModifierRelease,
  isShortcut,
  label,
  matches,
  type KeyLike,
} from '../src/content/shortcut.ts';

const key = (over: Partial<KeyLike>): KeyLike => ({
  code: 'KeyQ',
  key: 'œ',
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  ...over,
});

test('forward', () => {
  assert.equal(matches(key({ altKey: true }), DEFAULT_SHORTCUT), 'forward');
});

test('reverse with shift', () => {
  assert.equal(matches(key({ altKey: true, shiftKey: true }), DEFAULT_SHORTCUT), 'reverse');
});

test('wrong modifier is null', () => {
  assert.equal(matches(key({ ctrlKey: true }), DEFAULT_SHORTCUT), null);
});

test('no modifier is null', () => {
  assert.equal(matches(key({}), DEFAULT_SHORTCUT), null);
});

test('extra modifier is null', () => {
  assert.equal(matches(key({ altKey: true, metaKey: true }), DEFAULT_SHORTCUT), null);
  assert.equal(matches(key({ altKey: true, ctrlKey: true }), DEFAULT_SHORTCUT), null);
});

test('Command is not an available modifier', () => {
  assert.deepEqual(Object.keys(MODIFIERS).sort(), ['alt', 'ctrl']);
});

test('other code is null', () => {
  assert.equal(matches(key({ altKey: true, code: 'KeyW' }), DEFAULT_SHORTCUT), null);
});

test('matches by code regardless of key', () => {
  assert.equal(matches(key({ altKey: true, key: 'й' }), DEFAULT_SHORTCUT), 'forward');
});

test('modifier release detected', () => {
  assert.equal(isModifierRelease({ key: 'Alt' }, DEFAULT_SHORTCUT), true);
  assert.equal(isModifierRelease({ key: 'Shift' }, DEFAULT_SHORTCUT), false);
  assert.equal(isModifierRelease({ key: 'Control' }, { modifier: 'ctrl', code: 'KeyE' }), true);
});

test('isAllowedCode', () => {
  for (const code of ['KeyA', 'KeyZ', 'Digit0', 'Comma', 'Backquote', 'Equal']) assert.equal(isAllowedCode(code), true, code);
  for (const code of ['Tab', 'Space', 'F1', 'Enter', 'KeyAA', '']) assert.equal(isAllowedCode(code), false, code);
});

test('isShortcut', () => {
  assert.equal(isShortcut({ modifier: 'alt', code: 'KeyQ' }), true);
  assert.equal(isShortcut({ modifier: 'shift', code: 'KeyQ' }), false);
  assert.equal(isShortcut({ modifier: 'alt', code: 'Tab' }), false);
  assert.equal(isShortcut(null), false);
  assert.equal(isShortcut({ modifier: 'meta', code: 'KeyQ' }), false); // ⌘ keys belong to Safari
});

test('label', () => {
  assert.equal(label({ modifier: 'alt', code: 'KeyQ' }), '⌥ Option + Q');
  assert.equal(label({ modifier: 'alt', code: 'KeyQ' }, { shift: true }), '⌥ Option + ⇧ Shift + Q');
  assert.equal(label({ modifier: 'ctrl', code: 'Digit1' }), '⌃ Control + 1');
  assert.equal(label({ modifier: 'ctrl', code: 'Comma' }), '⌃ Control + ,');
});
