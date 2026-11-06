// Minimal in-memory stand-in for the parts of `browser.*` the controller uses.
import type { Browser } from 'webextension-polyfill';

export type FakeTab = { id: number; windowId: number; active: boolean };

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
      async query({ active, windowId }: { active?: boolean; windowId?: number }) {
        return tabs.filter((t) => t.active === active && (windowId === undefined || t.windowId === windowId));
      },
      async update(id: number, props: { active: boolean }) {
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
        async get(key: string) {
          return key in session ? { [key]: structuredClone(session[key]) } : {};
        },
        async set(obj: Record<string, unknown>) {
          Object.assign(session, structuredClone(obj));
        },
      },
    },
  };

  const fire = (path: string, ...args: unknown[]) => {
    for (const fn of listeners.get(path) ?? []) fn(...args);
  };

  return { browser: fake as unknown as Browser, fire, updateCalls, session, listeners };
}

export type FakeBrowser = ReturnType<typeof createFakeBrowser>;
