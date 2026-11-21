// Settings UI, shared by the toolbar popup and Safari's extension settings: two shortcut rows,
// Forward and Back. Back follows Forward + ⇧ until the user records one of their own.
import { effectiveReverse, label, parseStored, safariConflict, type Combo, type Shortcuts } from '../shared/combo.ts';
import type { StatusResponse } from '../shared/native.ts';
import { SHORTCUT } from '../shared/storage-keys.ts';
import { classifyCombo } from './key-recorder.ts';

type Field = 'forward' | 'reverse';

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const buttons: Record<Field, HTMLButtonElement> = { forward: byId('forward'), reverse: byId('reverse') };
const warnings: Record<Field, HTMLElement> = { forward: byId('forward-warning'), reverse: byId('reverse-warning') };
const resetReverse = byId<HTMLButtonElement>('reset-reverse');
const errorText = byId<HTMLElement>('error');
const statusBox = byId<HTMLElement>('status');

let shortcuts: Shortcuts = parseStored(undefined);
let recording: Field | null = null;

const sameCombo = (a: Combo | null, b: Combo | null) => !!a && !!b && label(a) === label(b);

const warningFor = (combo: Combo | null) => {
  const conflict = combo && safariConflict(combo);
  return conflict ? `Overrides Safari's “${conflict}” while Safari is active.` : '';
};

function show(): void {
  const reverse = effectiveReverse(shortcuts);
  const shown: Record<Field, Combo | null> = { forward: shortcuts.forward, reverse };
  for (const field of ['forward', 'reverse'] as const) {
    const button = buttons[field];
    button.classList.toggle('recording', recording === field);
    button.textContent = recording === field ? 'Press a shortcut…' : shown[field] ? label(shown[field]!) : 'Click to set';
    warnings[field].textContent = recording === field ? '' : warningFor(shown[field]);
  }
  buttons.reverse.classList.toggle('auto', shortcuts.reverse === null && recording !== 'reverse');
  buttons.reverse.title = shortcuts.reverse === null ? 'Follows Forward + ⇧' : '';
  resetReverse.hidden = shortcuts.reverse === null;
}

async function save(next: Shortcuts): Promise<void> {
  shortcuts = next;
  show();
  try {
    await browser.storage.local.set({ [SHORTCUT]: shortcuts });
  } catch {
    errorText.textContent = "Couldn't save the shortcut. Try again.";
  }
}

function stopRecording(): void {
  if (!recording) return;
  recording = null;
  show();
}

for (const field of ['forward', 'reverse'] as const) {
  buttons[field].addEventListener('click', () => {
    recording = field;
    errorText.textContent = '';
    show();
  });
}

resetReverse.addEventListener('click', () => {
  errorText.textContent = '';
  void save({ ...shortcuts, reverse: null });
});

window.addEventListener(
  'keydown',
  (event) => {
    if (!recording) return;
    event.preventDefault();
    event.stopPropagation();
    const outcome = classifyCombo(event);
    switch (outcome.kind) {
      case 'cancel':
        stopRecording();
        return;
      case 'wait':
        return;
      case 'invalid':
        errorText.textContent =
          outcome.reason === 'modifier'
            ? 'Add ⌘ Command, ⌥ Option or ⌃ Control to the shortcut.'
            : "This key can't be used. Pick a letter, digit, punctuation, Space, Tab or F1–F12.";
        return;
      case 'accept': {
        const field = recording;
        const next: Shortcuts =
          field === 'forward' ? { ...shortcuts, forward: outcome.combo } : { ...shortcuts, reverse: outcome.combo };
        if (sameCombo(next.forward, effectiveReverse(next))) {
          errorText.textContent = "Back can't be the same as forward.";
          return;
        }
        recording = null;
        errorText.textContent = '';
        void save(next);
      }
    }
  },
  true,
);

// Clicking anywhere else, or leaving the page, cancels recording.
document.addEventListener('mousedown', (event) => {
  if (recording && event.target !== buttons[recording]) stopRecording();
});
window.addEventListener('blur', stopRecording);

browser.storage.local.get(SHORTCUT).then((data) => {
  shortcuts = parseStored(data[SHORTCUT]);
  show();
});
browser.runtime
  .sendMessage({ type: 'app:status' })
  .then((reply) => {
    statusBox.hidden = (reply as StatusResponse | undefined)?.appRunning !== false;
  })
  .catch(() => {});
show();
