// Decides what a keypress means while the settings page is recording a shortcut.
import { comboFromEvent, isValidCombo, type Combo, type KeyLike } from '../shared/combo.ts';

export type ComboOutcome =
  | { kind: 'cancel' }
  | { kind: 'wait' }
  | { kind: 'invalid'; reason: 'modifier' | 'key' }
  | { kind: 'accept'; combo: Combo };

export function classifyCombo(e: KeyLike): ComboOutcome {
  if (e.key === 'Escape') return { kind: 'cancel' };
  const combo = comboFromEvent(e);
  if (!combo) return { kind: 'wait' };
  if (!combo.meta && !combo.alt && !combo.ctrl) return { kind: 'invalid', reason: 'modifier' };
  if (!isValidCombo(combo)) return { kind: 'invalid', reason: 'key' };
  return { kind: 'accept', combo };
}
