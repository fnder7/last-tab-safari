// Keyboard shortcut model, shared with the app (same JSON as Combo.swift in "Last Tab/Core").

/** A key (DOM `KeyboardEvent.code`) plus the modifiers held with it. */
export type Combo = { code: string; meta: boolean; alt: boolean; ctrl: boolean; shift: boolean };
/** `reverse: null` means "forward + ⇧", following forward when it changes. */
export type Shortcuts = { forward: Combo; reverse: Combo | null };
export type KeyLike = Pick<KeyboardEvent, 'code' | 'key' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>;

export const DEFAULT_SHORTCUTS: Shortcuts = {
  forward: { code: 'KeyQ', meta: false, alt: true, ctrl: false, shift: false },
  reverse: null,
};

const PUNCTUATION: Record<string, string> = {
  Backquote: '`',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Semicolon: ';',
  Quote: "'",
  BracketLeft: '[',
  BracketRight: ']',
  Minus: '-',
  Equal: '=',
  Backslash: '\\',
  Space: 'Space',
  Tab: 'Tab',
};

const MODIFIER_KEYS = new Set(['Alt', 'Control', 'Meta', 'Shift']);

/** Display text of a key, or null when the app can't register it. */
function keyLabel(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^F([1-9]|1[0-2])$/.test(code)) return code;
  return PUNCTUATION[code] ?? null;
}

export function isValidCombo(c: Combo): boolean {
  return keyLabel(c.code) !== null && (c.meta || c.alt || c.ctrl);
}

function isCombo(value: unknown): value is Combo {
  if (!value || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  return typeof c.code === 'string' && ['meta', 'alt', 'ctrl', 'shift'].every((k) => typeof c[k] === 'boolean');
}

const clean = (c: Combo): Combo => ({ code: c.code, meta: c.meta, alt: c.alt, ctrl: c.ctrl, shift: c.shift });

/** Reads `storage.local`: the current format, the old `{modifier, code}` one, or the default. */
export function parseStored(value: unknown): Shortcuts {
  if (value && typeof value === 'object') {
    const v = value as Record<string, unknown>;
    if (isCombo(v.forward) && isValidCombo(v.forward)) {
      const reverse = isCombo(v.reverse) && isValidCombo(v.reverse) ? clean(v.reverse) : null;
      return { forward: clean(v.forward), reverse };
    }
    if ((v.modifier === 'alt' || v.modifier === 'ctrl') && typeof v.code === 'string') {
      const forward = { code: v.code, meta: false, alt: v.modifier === 'alt', ctrl: v.modifier === 'ctrl', shift: false };
      if (isValidCombo(forward)) return { forward, reverse: null };
    }
  }
  return DEFAULT_SHORTCUTS;
}

/** The reverse shortcut in effect: the custom one, else forward + ⇧ (null when forward already has ⇧). */
export function effectiveReverse(s: Shortcuts): Combo | null {
  if (s.reverse) return s.reverse;
  return s.forward.shift ? null : { ...s.forward, shift: true };
}

/** The combo a keydown describes; null while only modifiers are down. */
export function comboFromEvent(e: KeyLike): Combo | null {
  if (MODIFIER_KEYS.has(e.key)) return null;
  return { code: e.code, meta: e.metaKey, alt: e.altKey, ctrl: e.ctrlKey, shift: e.shiftKey };
}

/** "⌃ ⌥ ⇧ ⌘ E": modifiers in macOS menu order, then the key. */
export function label(c: Combo): string {
  const parts: string[] = [];
  if (c.ctrl) parts.push('⌃');
  if (c.alt) parts.push('⌥');
  if (c.shift) parts.push('⇧');
  if (c.meta) parts.push('⌘');
  parts.push(keyLabel(c.code) ?? c.code);
  return parts.join(' ');
}

// Safari menu shortcuts the popup can still see (Safari keeps ⌘Q, ⌘W, ⌘T… for itself).
// Keyed by label() so the table reads like the menus.
const SAFARI_SHORTCUTS: Record<string, string> = {
  '⌘ L': 'Open Location',
  '⌘ R': 'Reload Page',
  '⌘ F': 'Find',
  '⌘ G': 'Find Next',
  '⌘ E': 'Use Selection for Find',
  '⌘ D': 'Add Bookmark',
  '⌘ N': 'New Window',
  '⌘ T': 'New Tab',
  '⌘ W': 'Close Tab',
  '⌘ Y': 'Show History',
  '⌘ Z': 'Undo',
  '⌘ X': 'Cut',
  '⌘ C': 'Copy',
  '⌘ V': 'Paste',
  '⌘ A': 'Select All',
  '⌘ P': 'Print',
  '⌘ S': 'Save As',
  '⌘ O': 'Open File',
  '⌘ M': 'Minimize',
  '⌘ H': 'Hide Safari',
  '⌘ Q': 'Quit Safari',
  '⌘ ,': 'Settings',
  '⌘ [': 'Back',
  '⌘ ]': 'Forward',
  '⇧ ⌘ T': 'Reopen Last Closed Tab',
  '⇧ ⌘ N': 'New Private Window',
  '⇧ ⌘ L': 'Show Sidebar',
  '⇧ ⌘ D': 'Add to Reading List',
  '⇧ ⌘ G': 'Find Previous',
  '⇧ ⌘ Z': 'Redo',
  '⇧ ⌘ \\': 'Show All Tabs',
  '⇧ ⌘ ]': 'Show Next Tab',
  '⇧ ⌘ [': 'Show Previous Tab',
  '⌥ ⌘ L': 'Show Downloads',
  '⌥ ⌘ E': 'Empty Caches',
  '⌥ ⌘ I': 'Show Web Inspector',
  '⌥ ⌘ C': 'Show JavaScript Console',
  '⌥ ⌘ R': 'Reload Page From Origin',
  '⌥ ⌘ U': 'Show Page Source',
  '⌥ ⌘ A': 'Show Page Resources',
  '⌥ ⌘ H': 'Hide Others',
  '⌥ ⌘ Q': 'Quit and Keep Windows',
  '⌃ ⌘ F': 'Enter Full Screen',
  '⌃ ⌘ 1': 'Show Bookmarks',
  ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => [`⌘ ${n}`, `Tab ${n}`])),
};

/** Name of the Safari menu item this combo would take over while Safari is active, if any. */
export function safariConflict(c: Combo): string | null {
  return SAFARI_SHORTCUTS[label(c)] ?? null;
}
