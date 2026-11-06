// Pure shortcut model: matching keyboard events, validation and display labels.

export type ModifierName = 'alt' | 'ctrl' | 'meta';
export type Shortcut = { modifier: ModifierName; code: string };
export type KeyLike = Pick<KeyboardEvent, 'code' | 'key' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>;

type ModifierInfo = {
  prop: 'altKey' | 'ctrlKey' | 'metaKey';
  key: 'Alt' | 'Control' | 'Meta';
  symbol: string;
  name: string;
};

export const MODIFIERS: Record<ModifierName, ModifierInfo> = {
  alt: { prop: 'altKey', key: 'Alt', symbol: '⌥', name: 'Option' },
  ctrl: { prop: 'ctrlKey', key: 'Control', symbol: '⌃', name: 'Control' },
  meta: { prop: 'metaKey', key: 'Meta', symbol: '⌘', name: 'Command' },
};

export const DEFAULT_SHORTCUT: Shortcut = { modifier: 'alt', code: 'KeyQ' };

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
};

export function isAllowedCode(code: string): boolean {
  return /^Key[A-Z]$/.test(code) || /^Digit[0-9]$/.test(code) || code in PUNCTUATION;
}

export function isShortcut(value: unknown): value is Shortcut {
  if (!value || typeof value !== 'object') return false;
  const { modifier, code } = value as Partial<Shortcut>;
  return typeof modifier === 'string' && modifier in MODIFIERS && typeof code === 'string' && isAllowedCode(code);
}

/** 'forward' for the shortcut, 'reverse' for the shortcut + Shift, otherwise null. */
export function matches(event: KeyLike, shortcut: Shortcut): 'forward' | 'reverse' | null {
  if (event.code !== shortcut.code) return null;
  for (const [name, info] of Object.entries(MODIFIERS) as Array<[ModifierName, ModifierInfo]>) {
    if (event[info.prop] !== (name === shortcut.modifier)) return null;
  }
  return event.shiftKey ? 'reverse' : 'forward';
}

export function isModifierRelease(event: Pick<KeyboardEvent, 'key'>, shortcut: Shortcut): boolean {
  return event.key === MODIFIERS[shortcut.modifier].key;
}

function keyText(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return PUNCTUATION[code] ?? code;
}

export function label(shortcut: Shortcut, { shift = false }: { shift?: boolean } = {}): string {
  const { symbol, name } = MODIFIERS[shortcut.modifier];
  return [`${symbol} ${name}`, ...(shift ? ['⇧ Shift'] : []), keyText(shortcut.code)].join(' + ');
}
