// Wires browser tab/window/command events to the pure MRU state (mru.ts).
import type { Browser } from 'webextension-polyfill';
import * as mru from './mru.ts';
import type { MruState } from './mru.ts';
import { MRU_STATE } from '../shared/storage-keys.ts';

const COMMAND = 'toggle-last-tab';

export type ControllerOptions = Record<string, never>;

export type Controller = {
  /** Resolves once state is loaded from storage and open windows are seeded. */
  ready: Promise<void>;
  /** Resolves when every queued event has been processed (used by tests). */
  idle(): Promise<void>;
};

export function createController(browser: Browser, _options: ControllerOptions = {}): Controller {
  let state: MruState = mru.emptyState();

  const save = () => browser.storage.session.set({ [MRU_STATE]: state });

  async function load(): Promise<void> {
    const data = await browser.storage.session.get(MRU_STATE);
    state = (data[MRU_STATE] as MruState | undefined) ?? mru.emptyState();
    // Seed every open window (e.g. restored at launch) that has no entry yet.
    const activeTabs = await browser.tabs.query({ active: true });
    const unseeded = activeTabs.filter((t) => !(String(t.windowId) in state));
    if (unseeded.length === 0) return;
    for (const t of unseeded) state = mru.onActivated(state, t.windowId!, t.id!);
    await save();
  }

  const logError = (e: unknown) => console.error('[LastTab]', e);

  // Every event runs strictly after the previous one, starting after load().
  let chain: Promise<void> = load().catch(logError);
  const ready = chain;
  const enqueue = (fn: () => Promise<void>) => {
    chain = chain.then(fn).catch(logError);
    return chain;
  };
  const apply = (update: (s: MruState) => MruState) =>
    enqueue(async () => {
      state = update(state);
      await save();
    });

  async function toggle(): Promise<void> {
    const win = await browser.windows.getLastFocused();
    if (!win || win.id === undefined) return;
    const target = mru.targetFor(state, win.id);
    if (target === null) return;
    try {
      await browser.tabs.update(target, { active: true });
      // Record the switch now, so a second press queued before Safari's
      // onActivated arrives goes back instead of repeating this switch.
      state = mru.onActivated(state, win.id, target);
    } catch {
      state = mru.onTabRemoved(state, win.id, target);
    }
    await save();
  }

  // Registered synchronously so they survive the background being unloaded.
  browser.tabs.onActivated.addListener(({ tabId, windowId }) => {
    apply((s) => mru.onActivated(s, windowId, tabId));
  });
  browser.tabs.onRemoved.addListener((tabId, { windowId, isWindowClosing }) => {
    apply((s) => (isWindowClosing ? mru.onWindowRemoved(s, windowId) : mru.onTabRemoved(s, windowId, tabId)));
  });
  browser.tabs.onDetached.addListener((tabId, { oldWindowId }) => {
    apply((s) => mru.onTabRemoved(s, oldWindowId, tabId));
  });
  browser.windows.onRemoved.addListener((windowId) => {
    apply((s) => mru.onWindowRemoved(s, windowId));
  });
  browser.commands.onCommand.addListener((command) => {
    if (command === COMMAND) enqueue(toggle);
  });

  async function idle(): Promise<void> {
    let seen: Promise<void>;
    do {
      seen = chain;
      await seen;
    } while (seen !== chain);
  }

  return { ready, idle };
}
