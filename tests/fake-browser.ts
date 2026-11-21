// Minimal in-memory stand-in for the parts of `browser.*` the controller uses.
import type { Browser } from 'webextension-polyfill';

export type FakeTab = {
  id: number;
  windowId: number;
  active: boolean;
  index?: number;
  title?: string;
  favIconUrl?: string;
  url?: string;
  incognito?: boolean;
};

export type FakeBrowserInit = {
  tabs?: FakeTab[];
  focusedWindowId?: number;
  sessionData?: Record<string, unknown>;
  localData?: Record<string, unknown>;
  /** Reply of the native handler; a function lets a test fail or vary it. */
  nativeReply?: (msg: any) => unknown;
  // What permissions.contains answers for any-site origins.
  allSites?: boolean;
};

type Listener = (...args: any[]) => unknown;

export function createFakeBrowser({
  tabs = [],
  focusedWindowId = 1,
  sessionData = {},
  localData = {},
  nativeReply = () => ({ ok: true, appRunning: true }),
  allSites = true,
}: FakeBrowserInit = {}) {
  const listeners = new Map<string, Listener[]>();
  const event = (path: string) => ({
    addListener(fn: Listener) {
      if (!listeners.has(path)) listeners.set(path, []);
      listeners.get(path)!.push(fn);
    },
  });
  const session: Record<string, any> = structuredClone(sessionData);
  const local: Record<string, any> = structuredClone(localData);
  const updateCalls: Array<[number, { active: boolean }]> = [];
  const nativeSent: any[] = [];
  let connects = 0;
  const access = { allSites };

  const fake = {
    tabs: {
      onActivated: event('tabs.onActivated'),
      onRemoved: event('tabs.onRemoved'),
      onDetached: event('tabs.onDetached'),
      onUpdated: event('tabs.onUpdated'),
      async query(filter: Partial<Pick<FakeTab, 'active' | 'windowId'>> = {}) {
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
      onFocusChanged: event('windows.onFocusChanged'),
      async getLastFocused() {
        return { id: focusedWindowId };
      },
    },
    runtime: {
      onMessage: event('runtime.onMessage'),
      async sendNativeMessage(_app: string, msg: unknown) {
        nativeSent.push(structuredClone(msg));
        return nativeReply(msg);
      },
      connectNative(_app: string) {
        connects += 1;
        return { onMessage: event('port.onMessage'), onDisconnect: event('port.onDisconnect') };
      },
    },
    permissions: {
      onAdded: event('permissions.onAdded'),
      onRemoved: event('permissions.onRemoved'),
      async contains(_p: { origins: string[] }) {
        return access.allSites;
      },
    },
    storage: {
      onChanged: event('storage.onChanged'),
      local: {
        async get(key: string) {
          return key in local ? { [key]: structuredClone(local[key]) } : {};
        },
        async set(obj: Record<string, unknown>) {
          Object.assign(local, structuredClone(obj));
        },
      },
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

  return {
    browser: fake as unknown as Browser,
    fire,
    send,
    tabs,
    updateCalls,
    session,
    listeners,
    nativeSent,
    access,
    connects: () => connects,
  };
}

export type FakeBrowser = ReturnType<typeof createFakeBrowser>;
