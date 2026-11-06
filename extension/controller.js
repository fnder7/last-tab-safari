// Wires browser tab/window/command events to the pure MRU state (mru.js).
// Classic script; API published on globalThis.LastTabController.
(() => {
  'use strict';

  const COMMAND = 'toggle-last-tab';
  const STORAGE_KEY = 'mruState';

  function createController(browser) {
    const mru = globalThis.LastTabMRU;
    let state = mru.emptyState();

    const save = () => browser.storage.session.set({ [STORAGE_KEY]: state });

    async function load() {
      const data = await browser.storage.session.get(STORAGE_KEY);
      state = data[STORAGE_KEY] ?? mru.emptyState();
      // Seed every open window (e.g. restored at launch) that has no entry yet.
      const activeTabs = await browser.tabs.query({ active: true });
      const unseeded = activeTabs.filter((t) => !(String(t.windowId) in state));
      if (unseeded.length === 0) return;
      for (const t of unseeded) state = mru.onActivated(state, t.windowId, t.id);
      await save();
    }

    // Every event runs strictly after the previous one, starting after load().
    let chain = load().catch((e) => console.error('[LastTab]', e));
    const ready = chain;
    const enqueue = (fn) => {
      chain = chain.then(fn).catch((e) => console.error('[LastTab]', e));
      return chain;
    };
    const apply = (update) => enqueue(async () => {
      state = update(state);
      await save();
    });

    async function toggle() {
      const win = await browser.windows.getLastFocused();
      if (!win) return;
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
    browser.tabs.onActivated.addListener(({ tabId, windowId }) =>
      apply((s) => mru.onActivated(s, windowId, tabId)));
    browser.tabs.onRemoved.addListener((tabId, { windowId, isWindowClosing }) =>
      apply((s) => (isWindowClosing
        ? mru.onWindowRemoved(s, windowId)
        : mru.onTabRemoved(s, windowId, tabId))));
    browser.tabs.onDetached.addListener((tabId, { oldWindowId }) =>
      apply((s) => mru.onTabRemoved(s, oldWindowId, tabId)));
    browser.windows.onRemoved.addListener((windowId) =>
      apply((s) => mru.onWindowRemoved(s, windowId)));
    browser.commands.onCommand.addListener((command) => {
      if (command === COMMAND) enqueue(toggle);
    });

    async function idle() {
      let seen;
      do {
        seen = chain;
        await seen;
      } while (seen !== chain);
    }

    return { ready, idle };
  }

  globalThis.LastTabController = { createController };
})();
