// Wires browser tab/window events to the pure MRU state (mru.ts) and keeps the Last Tab app
// up to date through the native bridge: tab order per window, previews, the focused window.
import type { Browser, Tabs } from 'webextension-polyfill';
import * as mru from './mru.ts';
import type { MruState } from './mru.ts';
import type { NativeBridge } from './native-bridge.ts';
import type { SnapshotMessage } from '../shared/native.ts';
import { FOCUSED_AT, MRU_STATE, PREVIEW_IDS, PROFILE_ID } from '../shared/storage-keys.ts';
import { createPreviewIds } from './previews.ts';

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
  /** Current time in ms; defaults to Date.now. */
  now?: () => number;
  /** Makes this profile's id the first time; defaults to crypto.randomUUID. */
  newProfileId?: () => string;
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
  const now = options.now ?? Date.now;
  const newProfileId = options.newProfileId ?? (() => crypto.randomUUID());
  let previews = createPreviewIds();
  let state: MruState = mru.emptyState();
  let focusedWindowId: number | null = null;
  let focusedAt = 0;
  let profile = '';

  async function captureInto(windowId: number, tabId: number): Promise<void> {
    let dataUrl: string;
    try {
      dataUrl = await capture(windowId);
    } catch (e) {
      console.debug('[LastTab] capture failed', e);
      return;
    }
    enqueue(async () => {
      bridge?.publishPreview(profile, tabId, dataUrl);
      previews.add(tabId);
      await savePreviews();
      await publish();
    });
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
  const savePreviews = () => browser.storage.session.set({ [PREVIEW_IDS]: previews.toJSON() });

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
          hasPreview: previews.has(t.id!),
        })),
      };
    }
    bridge.publishSnapshot({ type: 'snapshot', profile, focusedAt, focusedWindowId, windows });
  }

  async function load(): Promise<void> {
    const stored = (await browser.storage.local.get(PROFILE_ID))[PROFILE_ID];
    profile = typeof stored === 'string' && stored !== '' ? stored : newProfileId();
    if (profile !== stored) await browser.storage.local.set({ [PROFILE_ID]: profile });
    focusedWindowId = (await browser.windows.getLastFocused()).id ?? null;
    const data = await browser.storage.session.get([MRU_STATE, PREVIEW_IDS, FOCUSED_AT]);
    if (typeof data[FOCUSED_AT] === 'number') focusedAt = data[FOCUSED_AT];
    state = mru.normalize(data[MRU_STATE]);
    // Safari unloads an idle background: the app still has these previews on disk.
    previews = createPreviewIds(data[PREVIEW_IDS]);
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
    enqueue(async () => {
      previews.delete(tabId);
      await savePreviews();
    });
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
    // Focus left Safari or went to another profile's window: the app keeps showing whichever
    // profile was focused last, so this one just keeps its window.
    if (windowId === WINDOW_ID_NONE) return;
    const at = now();
    enqueue(async () => {
      focusedWindowId = windowId;
      focusedAt = at;
      await browser.storage.session.set({ [FOCUSED_AT]: focusedAt });
      await publish();
    });
  });
  bridge?.onActivate((tabId, target) => {
    // Every profile's background hears the request; only the one it is meant for answers.
    void enqueue(async () => {
      if (target === undefined || target === profile) await activateTab(tabId);
    });
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
