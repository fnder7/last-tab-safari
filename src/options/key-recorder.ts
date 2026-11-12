// Decides what a keypress means while the settings page is recording a shortcut key.
import { isAllowedCode } from '../content/shortcut.ts';

export type KeyOutcome =
  | { kind: 'cancel' }
  | { kind: 'wait' }
  | { kind: 'invalid' }
  | { kind: 'accept'; code: string };

const MODIFIER_KEYS = new Set(['Alt', 'Control', 'Meta', 'Shift']);

export function classifyKey(e: Pick<KeyboardEvent, 'key' | 'code'>): KeyOutcome {
  if (e.key === 'Escape') return { kind: 'cancel' };
  if (MODIFIER_KEYS.has(e.key)) return { kind: 'wait' };
  if (!isAllowedCode(e.code)) return { kind: 'invalid' };
  return { kind: 'accept', code: e.code };
}
