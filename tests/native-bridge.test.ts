import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNativeBridge } from '../src/background/native-bridge.ts';
import type { SnapshotMessage } from '../src/shared/native.ts';
import { SHORTCUT } from '../src/shared/storage-keys.ts';
import { createFakeBrowser } from './fake-browser.ts';

const tick = () => new Promise((r) => setTimeout(r, 0));

function manualTimer() {
  const pending: Array<() => void> = [];
  return { schedule: (fn: () => void) => void pending.push(fn), flush: () => pending.splice(0).forEach((fn) => fn()) };
}

const snap = (focusedWindowId: number): SnapshotMessage => ({ type: 'snapshot', profile: 'p1', focusedAt: 0, focusedWindowId, windows: {} });
const sentOfType = (sent: any[], type: string) => sent.filter((m) => m.type === type);

test('snapshot is debounced and sends the latest', async () => {
  const f = createFakeBrowser();
  const timer = manualTimer();
  const bridge = createNativeBridge(f.browser, { schedule: timer.schedule });
  bridge.publishSnapshot(snap(1));
  bridge.publishSnapshot(snap(2));
  bridge.publishSnapshot(snap(3));
  assert.deepEqual(sentOfType(f.nativeSent, 'snapshot'), []);
  timer.flush();
  await tick();
  assert.deepEqual(sentOfType(f.nativeSent, 'snapshot'), [snap(3)]);
});

test('preview is sent as base64 without data: prefix', async () => {
  const f = createFakeBrowser();
  const bridge = createNativeBridge(f.browser, { schedule: () => {} });
  bridge.publishPreview('p1', 10, 'data:image/jpeg;base64,AAEC');
  await tick();
  assert.deepEqual(sentOfType(f.nativeSent, 'preview'), [{ type: 'preview', profile: 'p1', tabId: 10, jpegBase64: 'AAEC' }]);
});

test('shortcuts are sent resolved on start and on storage change', async () => {
  const f = createFakeBrowser({ localData: { [SHORTCUT]: { modifier: 'ctrl', code: 'KeyE' } } });
  createNativeBridge(f.browser, { schedule: () => {} });
  await tick();
  await tick();
  const ctrlE = { code: 'KeyE', meta: false, alt: false, ctrl: true, shift: false };
  assert.deepEqual(sentOfType(f.nativeSent, 'shortcuts'), [{ type: 'shortcuts', forward: ctrlE, reverse: { ...ctrlE, shift: true } }]);
  const metaE = { ...ctrlE, ctrl: false, meta: true };
  const custom = { ...ctrlE, code: 'KeyW' };
  f.fire('storage.onChanged', { [SHORTCUT]: { newValue: { forward: metaE, reverse: custom } } }, 'local');
  f.fire('storage.onChanged', { other: { newValue: 1 } }, 'local');
  await tick();
  assert.deepEqual(sentOfType(f.nativeSent, 'shortcuts').at(-1), { type: 'shortcuts', forward: metaE, reverse: custom });
  assert.equal(sentOfType(f.nativeSent, 'shortcuts').length, 2);
});

test('app:status answers ping', async () => {
  const f = createFakeBrowser({ nativeReply: (m) => ({ ok: true, appRunning: m.type === 'ping' }) });
  createNativeBridge(f.browser, { schedule: () => {} });
  assert.deepEqual(await f.send({ type: 'app:status' }, {}), { appRunning: true });
  assert.equal(await f.send({ type: 'other' }, {}), undefined);
});

test('app:status reports not running when the handler fails', async () => {
  const f = createFakeBrowser({
    nativeReply: () => {
      throw new Error('no handler');
    },
  });
  createNativeBridge(f.browser, { schedule: () => {} });
  assert.deepEqual(await f.send({ type: 'app:status' }, {}), { appRunning: false });
});

test('activate from the app reaches handlers; handler replies on the port are ignored', () => {
  const f = createFakeBrowser();
  const bridge = createNativeBridge(f.browser, { schedule: () => {} });
  const got: Array<[number, string | undefined]> = [];
  bridge.onActivate((id, profile) => got.push([id, profile]));
  f.fire('port.onMessage', { name: 'activate', userInfo: { tabId: 20, t: 1 } });
  f.fire('port.onMessage', { name: 'activate', userInfo: { tabId: 21, profile: 'p1' } });
  f.fire('port.onMessage', { echo: { name: 'activate', userInfo: { tabId: 30 } } });
  f.fire('port.onMessage', { name: 'activate', userInfo: { tabId: 'x' } });
  assert.deepEqual(got, [[20, undefined], [21, 'p1']]);
});

test('port reopens after a disconnect on the next publish', () => {
  const f = createFakeBrowser();
  const bridge = createNativeBridge(f.browser, { schedule: () => {} });
  assert.equal(f.connects(), 1);
  bridge.publishPreview('p1', 1, 'data:image/jpeg;base64,AA');
  assert.equal(f.connects(), 1);
  f.fire('port.onDisconnect');
  bridge.publishPreview('p1', 1, 'data:image/jpeg;base64,AA');
  assert.equal(f.connects(), 2);
});

test('ackActivated tells the app', async () => {
  const f = createFakeBrowser();
  const bridge = createNativeBridge(f.browser, { schedule: () => {} });
  bridge.ackActivated(20);
  await tick();
  assert.deepEqual(sentOfType(f.nativeSent, 'activated'), [{ type: 'activated', tabId: 20 }]);
});

test('website access is sent on start and again only when it changes', async () => {
  const f = createFakeBrowser({ allSites: false });
  createNativeBridge(f.browser, { schedule: () => {} });
  await tick();
  await tick();
  f.fire('tabs.onActivated', { tabId: 1, windowId: 1 });
  await tick();
  await tick();
  assert.deepEqual(sentOfType(f.nativeSent, 'access'), [{ type: 'access', allSites: false }]);
  f.access.allSites = true;
  f.fire('permissions.onAdded', { origins: ['<all_urls>'] });
  await tick();
  await tick();
  assert.deepEqual(sentOfType(f.nativeSent, 'access').at(-1), { type: 'access', allSites: true });
  assert.equal(sentOfType(f.nativeSent, 'access').length, 2);
});
