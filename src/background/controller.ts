// Wires browser tab/window events to the pure MRU state (mru.ts) and answers
// the content script's menu messages.
import type { Browser, Runtime, Tabs } from 'webextension-polyfill';
import * as mru from './mru.ts';
import type { MruState } from './mru.ts';
import type { ListResponse, MenuTab, Request } from '../shared/messages.ts';
import { MRU_STATE } from '../shared/storage-keys.ts';
import { createPreviewCache } from './previews.ts';

/** Wait after activation / load so the page has painted before capturing. */
const CAPTURE_DELAY_MS = 300;
/** How long menu:list may spend refreshing the sender tab's preview. */
const LIST_CAPTURE_BUDGET_MS = 150;

export type ControllerOptions = {
  /** Captures the visible tab of a window as a data URL. Without it, no previews are made. */
  capture?: (windowId: number) => Promise<string>;
  /** Defers work; defaults to setTimeout. */
  schedule?: (fn: () => void, ms: number) => void;
};

export type Controller = {
  /** Resolves once state is loaded from storage and open windows are seeded. */
  ready: Promise<void>;
  /** Resolves when every queued event has been processed (used by tests). */
  idle(): Promise<void>;
};

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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
  const previews = createPreviewCache();
  let state: MruState = mru.emptyState();

  const toMenuTab = (tab: Tabs.Tab): MenuTab => ({
    id: tab.id!,
    title: tab.title ?? '',
    favIconUrl: tab.favIconUrl ?? null,
    preview: previews.get(tab.id!) ?? null,
  });

  async function captureInto(windowId: number, tabId: number): Promise<void> {
    try {
      previews.set(tabId, await capture(windowId));
    } catch (e) {
      console.debug('[LastTab] capture failed', e);
    }
  }

  /** Captures `tabId` later, only if it is still the active tab of its window by then. */
  function captureLater(windowId: number, tabId: number): void {
    schedule(() => {
      browser.tabs
        .query({ active: true, windowId })
        .then(([active]) => (active?.id === tabId ? captureInto(windowId, tabId) : undefined))
        .catch((e) => console.debug('[LastTab] capture skipped', e));
    }, CAPTURE_DELAY_MS);
  }

  const save = () => browser.storage.session.set({ [MRU_STATE]: state });

  async function load(): Promise<void> {
    const data = await browser.storage.session.get(MRU_STATE);
    state = mru.normalize(data[MRU_STATE]);
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

  async function listMenu(windowId: number, senderTabId: number | undefined): Promise<ListResponse> {
    if (senderTabId !== undefined) {
      await Promise.race([captureInto(windowId, senderTabId), wait(LIST_CAPTURE_BUDGET_MS)]);
    }
    await chain; // reflect every activation queued before the request
    const openTabs = await browser.tabs.query({ windowId });
    return { tabs: reconcile(mru.orderFor(state, windowId), openTabs).map(toMenuTab) };
  }

  async function activateTab(tabId: number): Promise<void> {
    try {
      await browser.tabs.update(tabId, { active: true });
    } catch {
      // The tab was closed while the menu was open: nothing to switch to.
    }
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
    if (info.status === 'complete' && tab.active && tab.windowId !== undefined) captureLater(tab.windowId, tabId);
  });
  browser.windows.onRemoved.addListener((windowId) => {
    apply((s) => mru.onWindowRemoved(s, windowId));
  });
  browser.runtime.onMessage.addListener((message: unknown, sender: Runtime.MessageSender) => {
    const request = message as Request;
    const windowId = sender.tab?.windowId;
    if (request?.type === 'menu:list' && windowId !== undefined) return listMenu(windowId, sender.tab?.id);
    if (request?.type === 'menu:activate') return activateTab(request.tabId);
    return undefined;
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
