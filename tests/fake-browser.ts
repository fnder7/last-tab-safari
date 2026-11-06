// Minimal in-memory stand-in for the parts of `browser.*` the controller uses.
import type { Browser } from 'webextension-polyfill';

export type FakeTab = {
  id: number;
  windowId: number;
  active: boolean;
  index?: number;
  title?: string;
  favIconUrl?: string;
};

export type FakeBrowserInit = {
  tabs?: FakeTab[];
  focusedWindowId?: number;
  sessionData?: Record<string, unknown>;
};

type Listener = (...args: any[]) => unknown;

export function createFakeBrowser({ tabs = [], focusedWindowId = 1, sessionData = {} }: FakeBrowserInit = {}) {
  const listeners = new Map<string, Listener[]>();
  const event = (path: string) => ({
    addListener(fn: Listener) {
      if (!listeners.has(path)) listeners.set(path, []);
      listeners.get(path)!.push(fn);
    },
  });
  const session: Record<string, any> = structuredClone(sessionData);
  const updateCalls: Array<[number, { active: boolean }]> = [];

  const fake = {
    tabs: {
      onActivated: event('tabs.onActivated'),
      onRemoved: event('tabs.onRemoved'),
      onDetached: event('tabs.onDetached'),
      onUpdated: event('tabs.onUpdated'),
      async query(filter: Partial<Pick<FakeTab, 'active' | 'windowId'>>) {
        return tabs
          .filter((t) => Object.entries(filter).every(([k, v]) => t[k as keyof FakeTab] === v))
          .map((t) => ({ ...t }));
      },
      async update(id: number, props: { active: boolean }) {
        updateCalls.push([id, props]);
        const tab = tabs.find((t) => t.id === id);
        if (!tab) throw new Error(`No tab with id: ${id}`);
        return tab;
      },
      async captureVisibleTab() {
        return 'data:fake';
      },
    },
    windows: {
      onRemoved: event('windows.onRemoved'),
      async getLastFocused() {
        return { id: focusedWindowId };
      },
    },
    runtime: { onMessage: event('runtime.onMessage') },
    storage: {
      session: {
        async get(key: string) {
          return key in session ? { [key]: structuredClone(session[key]) } : {};
        },
        async set(obj: Record<string, unknown>) {
          Object.assign(session, structuredClone(obj));
        },
      },
    },
  };

  const fire = (path: string, ...args: unknown[]) => (listeners.get(path) ?? []).map((fn) => fn(...args));

  /** Delivers a runtime message and resolves the first listener reply, like Safari does. */
  const send = async (msg: unknown, sender: unknown) => {
    for (const reply of fire('runtime.onMessage', msg, sender)) {
      if (reply !== undefined) return await reply;
    }
    return undefined;
  };

  return { browser: fake as unknown as Browser, fire, send, tabs, updateCalls, session, listeners };
}

export type FakeBrowser = ReturnType<typeof createFakeBrowser>;
