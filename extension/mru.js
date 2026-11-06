// Pure per-window "current / previous tab" state. No browser APIs.
// Classic script (Safari background) that also loads in Node tests:
// the API is published on globalThis.LastTabMRU.
(() => {
  'use strict';

  const entryFor = (state, windowId) =>
    state[String(windowId)] ?? { current: null, previous: null };

  const withEntry = (state, windowId, entry) => ({ ...state, [String(windowId)]: entry });

  function emptyState() {
    return {};
  }

  function onActivated(state, windowId, tabId) {
    const { current, previous } = entryFor(state, windowId);
    if (tabId === current) return state;
    if (current !== null) return withEntry(state, windowId, { current: tabId, previous: current });
    // Current tab was closed: keep the earlier tab as the target.
    return withEntry(state, windowId, {
      current: tabId,
      previous: previous === tabId ? null : previous,
    });
  }

  function onTabRemoved(state, windowId, tabId) {
    const key = String(windowId);
    if (!(key in state)) return state;
    const { current, previous } = state[key];
    if (tabId !== current && tabId !== previous) return state;
    return withEntry(state, windowId, {
      current: tabId === current ? null : current,
      previous: tabId === previous ? null : previous,
    });
  }

  function onWindowRemoved(state, windowId) {
    const { [String(windowId)]: _removed, ...rest } = state;
    return rest;
  }

  function targetFor(state, windowId) {
    return entryFor(state, windowId).previous;
  }

  globalThis.LastTabMRU = { emptyState, onActivated, onTabRemoved, onWindowRemoved, targetFor };
})();
