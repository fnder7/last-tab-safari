// Minimal in-memory stand-in for the parts of `browser.*` the controller uses.
export function createFakeBrowser({ tabs = [], focusedWindowId = 1, sessionData = {} } = {}) {
  const listeners = new Map();
  const event = (path) => ({
    addListener(fn) {
      if (!listeners.has(path)) listeners.set(path, []);
      listeners.get(path).push(fn);
    },
  });
  const session = structuredClone(sessionData);
  const updateCalls = [];

  const browser = {
    tabs: {
      onActivated: event('tabs.onActivated'),
      onRemoved: event('tabs.onRemoved'),
      onDetached: event('tabs.onDetached'),
      async query({ active, windowId }) {
        return tabs.filter((t) => t.active === active && (windowId === undefined || t.windowId === windowId));
      },
      async update(id, props) {
        updateCalls.push([id, props]);
        const tab = tabs.find((t) => t.id === id);
        if (!tab) throw new Error(`No tab with id: ${id}`);
        return tab;
      },
    },
    windows: {
      onRemoved: event('windows.onRemoved'),
      async getLastFocused() {
        return { id: focusedWindowId };
      },
    },
    commands: { onCommand: event('commands.onCommand') },
    storage: {
      session: {
        async get(key) {
          return key in session ? { [key]: structuredClone(session[key]) } : {};
        },
        async set(obj) {
          Object.assign(session, structuredClone(obj));
        },
      },
    },
  };

  const fire = (path, ...args) => {
    for (const fn of listeners.get(path) ?? []) fn(...args);
  };

  return { browser, fire, updateCalls, session, listeners };
}
