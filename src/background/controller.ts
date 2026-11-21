// Wires browser tab/window events to the pure MRU state (mru.ts) and keeps the Last Tab app
// up to date through the native bridge: tab order per window, previews, the focused window.
import type { Browser, Tabs } from 'webextension-polyfill';
import * as mru from './mru.ts';
import type { MruState } from './mru.ts';
import type { NativeBridge } from './native-bridge.ts';
import type { SnapshotMessage } from '../shared/native.ts';
import { MRU_STATE } from '../shared/storage-keys.ts';
import { createPreviewCache } from './previews.ts';

/** Wait after activation / load so the page has painted before capturing. */
const CAPTURE_DELAY_MS = 300;
/** `windows.WINDOW_ID_NONE`: focus left Safari. */
const WINDOW_ID_NONE = -1;

/** The part of the native bridge the controller feeds. */
export type SnapshotSink = Pick<NativeBridge, 'publishSnapshot' | 'publishPreview' | 'onActivate' | 'ackActivated'>;

export type ControllerOptions = {
  /** Captures the visible tab of a window as a data URL. Without it, no previews are made. */
  capture?: (windowId: number) => Promise<string>;
  /** Defers work; defaults to setTimeout. */
  schedule?: (fn: () => void, ms: number) => void;
  /** Where snapshots and previews go. Without it nothing is published. */
  bridge?: SnapshotSink;
};

export type Controller = {
  /** Resolves once state is loaded from storage and open windows are seeded. */
  ready: Promise<void>;
  /** Resolves when every queued event has been processed (used by tests). */
  idle(): Promise<void>;
};

/** MRU ids first (only those still open), then open tabs we have not seen, in tab-bar order. */
function reconcile(order: readonly number[], openTabs: Tabs.Tab[]): Tabs.Tab[] {
  const byId = new Map(openTabs.map((t) => [t.id!, t]));
  const known = order.filter((id) => byId.has(id)).map((id) => byId.get(id)!);
  const seen = new Set(order);
  const unseen = openTabs.filter((t) => !seen.has(t.id!)).sort((a, b) => a.index - b.index);
  return [...known, ...unseen];
}

export function createController(browser: Browser, options: ControllerOptions = {}): Controller {
  const capture = options.capture ?? (() => Promise.reject(new Error('capture disabled')));
  const schedule = options.schedule ?? ((fn, ms) => void setTimeout(fn, ms));
  const bridge = options.bridge;
  const previews = createPreviewCache();
  let state: MruState = mru.emptyState();
  let focusedWindowId: number | null = null;

  async function captureInto(windowId: number, tabId: number): Promise<void> {
    let dataUrl: string;
    try {
      dataUrl = await capture(windowId);
    } catch (e) {
      console.debug('[LastTab] capture failed', e);
      return;
    }
    previews.set(tabId, dataUrl);
    bridge?.publishPreview(tabId, dataUrl);
    enqueue(publish);
  }

  /** Captures `tabId` later, only if it is still the active tab of its window by then. */
  function captureLater(windowId: number, tabId: number): void {
    schedule(() => {
      browser.tabs
        .query({ active: true, windowId })
        // Private tabs are never captured: nothing from them may reach the app's disk cache.
        .then(([active]) => (active?.id === tabId && !active.incognito ? captureInto(windowId, tabId) : undefined))
        .catch((e) => console.debug('[LastTab] capture skipped', e));
    }, CAPTURE_DELAY_MS);
  }

  const save = () => browser.storage.session.set({ [MRU_STATE]: state });

  /** Sends every window's tabs in MRU order (private windows left out). */
  async function publish(): Promise<void> {
    if (!bridge) return;
    const byWindow = new Map<number, Tabs.Tab[]>();
    for (const t of await browser.tabs.query({})) {
      if (t.incognito || t.windowId === undefined || t.id === undefined) continue;
      byWindow.set(t.windowId, [...(byWindow.get(t.windowId) ?? []), t]);
    }
    const windows: SnapshotMessage['windows'] = {};
    for (const [windowId, openTabs] of byWindow) {
      windows[String(windowId)] = {
        tabs: reconcile(mru.orderFor(state, windowId), openTabs).map((t) => ({
          id: t.id!,
          title: t.title ?? '',
          favIconUrl: t.favIconUrl ?? null,
          hasPreview: previews.get(t.id!) !== undefined,
        })),
      };
    }
    bridge.publishSnapshot({ type: 'snapshot', focusedWindowId, windows });
  }

  async function load(): Promise<void> {
    focusedWindowId = (await browser.windows.getLastFocused()).id ?? null;
    const data = await browser.storage.session.get(MRU_STATE);
    state = mru.normalize(data[MRU_STATE]);
    // Seed every open window (e.g. restored at launch) that has no entry yet.
    const activeTabs = await browser.tabs.query({ active: true });
    const unseeded = activeTabs.filter((t) => !(String(t.windowId) in state));
    for (const t of unseeded) state = mru.onActivated(state, t.windowId!, t.id!);
    if (unseeded.length > 0) await save();
    await publish();
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
      await publish();
    });

  async function activateTab(tabId: number): Promise<void> {
    try {
      await browser.tabs.update(tabId, { active: true });
    } catch {
      // The tab was closed while the menu was open: nothing to switch to.
    }
    bridge?.ackActivated(tabId);
  }

  // Registered synchronously so they survive the background being unloaded.
  browser.tabs.onActivated.addListener(({ tabId, windowId }) => {
    apply((s) => mru.onActivated(s, windowId, tabId));
    captureLater(windowId, tabId);
  });
  browser.tabs.onRemoved.addListener((tabId, { windowId, isWindowClosing }) => {
    previews.delete(tabId);
    apply((s) => (isWindowClosing ? mru.onWindowRemoved(s, windowId) : mru.onTabRemoved(s, windowId, tabId)));
  });
  browser.tabs.onDetached.addListener((tabId, { oldWindowId }) => {
    apply((s) => mru.onTabRemoved(s, oldWindowId, tabId));
  });
  browser.tabs.onUpdated.addListener((tabId, info, tab) => {
    if (info.status === 'complete' && tab.active && !tab.incognito && tab.windowId !== undefined) captureLater(tab.windowId, tabId);
    if (info.title !== undefined || info.favIconUrl !== undefined || info.status === 'complete') enqueue(publish);
  });
  browser.windows.onRemoved.addListener((windowId) => {
    apply((s) => mru.onWindowRemoved(s, windowId));
  });
  browser.windows.onFocusChanged.addListener((windowId) => {
    if (windowId === WINDOW_ID_NONE) return; // focus left Safari: the app keeps the last window
    focusedWindowId = windowId;
    enqueue(publish);
  });
  bridge?.onActivate((tabId) => void enqueue(() => activateTab(tabId)));

  async function idle(): Promise<void> {
    let seen: Promise<void>;
    do {
      seen = chain;
      await seen;
    } while (seen !== chain);
  }

  return { ready, idle };
}
