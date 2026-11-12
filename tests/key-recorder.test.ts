import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyKey } from '../src/options/key-recorder.ts';

test('Escape cancels recording', () => {
  assert.deepEqual(classifyKey({ key: 'Escape', code: 'Escape' }), { kind: 'cancel' });
});

test('modifier-only presses keep waiting', () => {
  for (const key of ['Alt', 'Control', 'Meta', 'Shift']) {
    assert.deepEqual(classifyKey({ key, code: `${key}Left` }), { kind: 'wait' });
  }
});

test('letter keys are accepted by code, even when Option changes the character', () => {
  assert.deepEqual(classifyKey({ key: 'œ', code: 'KeyQ' }), { kind: 'accept', code: 'KeyQ' });
});

test('disallowed keys are rejected', () => {
  assert.deepEqual(classifyKey({ key: 'Tab', code: 'Tab' }), { kind: 'invalid' });
  assert.deepEqual(classifyKey({ key: 'F5', code: 'F5' }), { kind: 'invalid' });
});
