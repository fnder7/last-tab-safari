// Link from the background to the Last Tab app: tab snapshots, previews and shortcuts go out
// through the native handler; "activate" requests come in on the native port.
import type { Browser } from 'webextension-polyfill';
import { effectiveReverse, parseStored } from '../shared/combo.ts';
import type { NativeMessage, NativeReply, SnapshotMessage, StatusResponse } from '../shared/native.ts';
import { SHORTCUT } from '../shared/storage-keys.ts';

const APP = 'application.id';
const SNAPSHOT_DEBOUNCE_MS = 100;

export type NativeBridge = {
  publishSnapshot(snapshot: SnapshotMessage): void;
  publishPreview(profile: string, tabId: number, dataUrl: string): void;
  /** `profile` is the one the app asks to switch in; absent from older app builds. */
  onActivate(fn: (tabId: number, profile: string | undefined) => void): void;
  ackActivated(tabId: number): void;
};

type Port = {
  onMessage: { addListener(fn: (message: unknown) => void): void };
  onDisconnect: { addListener(fn: () => void): void };
};

// Safari-only runtime APIs the polyfill types leave out or type differently.
type NativeRuntime = {
  sendNativeMessage(app: string, message: unknown): Promise<unknown>;
  connectNative(app: string): Port;
};

export function createNativeBridge(
  browser: Browser,
  { schedule = (fn: () => void, ms: number) => void setTimeout(fn, ms) }: { schedule?: (fn: () => void, ms: number) => void } = {},
): NativeBridge {
  const runtime = browser.runtime as unknown as NativeRuntime;
  const activateHandlers: Array<(tabId: number, profile: string | undefined) => void> = [];

  const send = (message: NativeMessage): Promise<NativeReply | undefined> =>
    Promise.resolve()
      .then(() => runtime.sendNativeMessage(APP, message))
      .then((reply) => reply as NativeReply | undefined);

  const post = (message: NativeMessage) => {
    ensurePort();
    send(message).catch((e) => console.debug('[LastTab] native message failed', e));
  };

  // The port only listens: anything posted on it would come back as the handler's reply.
  let port: Port | null = null;
  function ensurePort(): void {
    if (port) return;
    try {
      const opened = runtime.connectNative(APP);
      port = opened;
      opened.onMessage.addListener((message) => {
        const m = message as { name?: unknown; userInfo?: { tabId?: unknown; profile?: unknown } } | null;
        if (m?.name !== 'activate' || typeof m.userInfo?.tabId !== 'number') return; // handler replies, junk
        const tabId = m.userInfo.tabId;
        const profile = typeof m.userInfo.profile === 'string' ? m.userInfo.profile : undefined;
        activateHandlers.forEach((fn) => fn(tabId, profile));
      });
      opened.onDisconnect.addListener(() => {
        if (port === opened) port = null;
      });
    } catch (e) {
      console.debug('[LastTab] connectNative failed', e);
    }
  }
  ensurePort();

  let pendingSnapshot: SnapshotMessage | null = null;
  function publishSnapshot(snapshot: SnapshotMessage): void {
    const scheduled = pendingSnapshot !== null;
    pendingSnapshot = snapshot;
    if (scheduled) return;
    schedule(() => {
      const latest = pendingSnapshot!;
      pendingSnapshot = null;
      post(latest);
    }, SNAPSHOT_DEBOUNCE_MS);
  }

  const publishShortcuts = (stored: unknown) => {
    const shortcuts = parseStored(stored);
    post({ type: 'shortcuts', forward: shortcuts.forward, reverse: effectiveReverse(shortcuts) });
  };
  browser.storage.local
    .get(SHORTCUT)
    .then((data) => publishShortcuts(data[SHORTCUT]))
    .catch((e) => console.debug('[LastTab] reading shortcuts failed', e));
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && SHORTCUT in changes) publishShortcuts(changes[SHORTCUT].newValue);
  });

  // Website access, for the app's setup checklist. Safari doesn't reliably fire permission events
  // when the user changes access in its settings, so tab switches re-check too; only changes are sent.
  // Asks about *://*/*: Safari answers false for <all_urls> even with "For other websites: Allow".
  let lastAccess: boolean | null = null;
  const publishAccess = () => {
    Promise.resolve()
      .then(() => browser.permissions.contains({ origins: ['*://*/*'] }))
      .then((allSites) => {
        if (allSites === lastAccess) return;
        lastAccess = allSites;
        post({ type: 'access', allSites });
      })
      .catch((e) => console.debug('[LastTab] checking website access failed', e));
  };
  publishAccess();
  browser.permissions?.onAdded?.addListener(publishAccess);
  browser.permissions?.onRemoved?.addListener(publishAccess);
  browser.tabs.onActivated.addListener(publishAccess);

  browser.runtime.onMessage.addListener((message: unknown) => {
    if ((message as { type?: unknown } | null)?.type !== 'app:status') return undefined;
    ensurePort();
    return send({ type: 'ping' })
      .then((reply): StatusResponse => ({ appRunning: reply?.appRunning === true }))
      .catch((): StatusResponse => ({ appRunning: false }));
  });

  return {
    publishSnapshot,
    publishPreview: (profile, tabId, dataUrl) =>
      post({ type: 'preview', profile, tabId, jpegBase64: dataUrl.slice(dataUrl.indexOf(',') + 1) }),
    onActivate: (fn) => void activateHandlers.push(fn),
    ackActivated: (tabId) => post({ type: 'activated', tabId }),
  };
}
