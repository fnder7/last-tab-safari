// Options page: pick the menu shortcut (modifier + key). Saved to storage.local.
import { SHORTCUT } from '../shared/storage-keys.ts';
import { DEFAULT_SHORTCUT, MODIFIERS, isAllowedCode, isShortcut, label, type ModifierName, type Shortcut } from '../content/shortcut.ts';

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const modifierSelect = byId<HTMLSelectElement>('modifier');
const keyButton = byId<HTMLButtonElement>('key');
const errorText = byId<HTMLElement>('error');
const forwardText = byId<HTMLElement>('forward');
const reverseText = byId<HTMLElement>('reverse');

let shortcut: Shortcut = DEFAULT_SHORTCUT;
let recording = false;

for (const [name, info] of Object.entries(MODIFIERS)) {
  const option = document.createElement('option');
  option.value = name;
  option.textContent = `${info.symbol} ${info.name}`;
  modifierSelect.append(option);
}

function keyName(s: Shortcut): string {
  return label(s).split(' + ').at(-1)!;
}

function show(): void {
  modifierSelect.value = shortcut.modifier;
  keyButton.textContent = recording ? 'Press a key…' : keyName(shortcut);
  keyButton.classList.toggle('recording', recording);
  forwardText.textContent = label(shortcut);
  reverseText.textContent = label(shortcut, { shift: true });
}

async function save(next: Shortcut): Promise<void> {
  shortcut = next;
  show();
  await browser.storage.local.set({ [SHORTCUT]: shortcut });
}

modifierSelect.addEventListener('change', () => {
  void save({ ...shortcut, modifier: modifierSelect.value as ModifierName });
});

keyButton.addEventListener('click', () => {
  recording = true;
  errorText.textContent = '';
  show();
});

window.addEventListener(
  'keydown',
  (event) => {
    if (!recording) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape') {
      recording = false;
      show();
      return;
    }
    if (['Alt', 'Control', 'Meta', 'Shift'].includes(event.key)) return; // wait for the actual key
    if (!isAllowedCode(event.code)) {
      errorText.textContent = "This key can't be used. Pick a letter, digit or punctuation key.";
      return;
    }
    recording = false;
    errorText.textContent = '';
    void save({ ...shortcut, code: event.code });
  },
  true,
);

browser.storage.local.get(SHORTCUT).then((data) => {
  if (isShortcut(data[SHORTCUT])) shortcut = data[SHORTCUT];
  show();
});
show();
