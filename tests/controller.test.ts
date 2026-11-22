import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createController, type SnapshotSink } from '../src/background/controller.ts';
import type { SnapshotMessage } from '../src/shared/native.ts';
import { createFakeBrowser, type FakeBrowser, type FakeTab } from './fake-browser.ts';

const activate = (f: FakeBrowser, windowId: number, tabId: number) => f.fire('tabs.onActivated', { tabId, windowId });

const tab = (id: number, index: number, active = false): FakeTab => ({
  id,
  windowId: 1,
  active,
  index,
  title: `Tab ${id}`,
  favIconUrl: `https://icon/${id}`,
});

function twoTabWindow(extra: Parameters<typeof createFakeBrowser>[0] = {}) {
  return createFakeBrowser({ tabs: [tab(10, 0, true), tab(20, 1)], focusedWindowId: 1, ...extra });
}

/** Records what the controller hands to the native bridge. */
function sink() {
  const snapshots: SnapshotMessage[] = [];
  const previews: Array<[number, string]> = [];
  const previewProfiles: string[] = [];
  const activateHandlers: Array<(tabId: number, profile: string | undefined) => void> = [];
  const acks: number[] = [];
  const bridge: SnapshotSink = {
    publishSnapshot: (s) => void snapshots.push(s),
    publishPreview: (profile, tabId, dataUrl) => {
      previewProfiles.push(profile);
      previews.push([tabId, dataUrl]);
    },
    onActivate: (fn) => void activateHandlers.push(fn),
    ackActivated: (tabId) => void acks.push(tabId),
  };
  return {
    bridge,
    snapshots,
    previews,
    previewProfiles,
    acks,
    last: () => snapshots.at(-1)!,
    ids: (windowId = 1) => snapshots.at(-1)!.windows[String(windowId)]?.tabs.map((t) => t.id),
    activateFromApp: (tabId: number, profile?: string) => activateHandlers.forEach((fn) => fn(tabId, profile)),
  };
}

test('registers listeners synchronously', () => {
  const f = twoTabWindow();
  createController(f.browser);
  for (const path of [
    'tabs.onActivated',
    'tabs.onRemoved',
    'tabs.onDetached',
    'tabs.onUpdated',
    'windows.onRemoved',
    'windows.onFocusChanged',
  ]) {
    assert.ok(f.listeners.get(path)?.length, path);
  }
});

test('seeds every window at startup', async () => {
  const f = createFakeBrowser({
    tabs: [
      { id: 10, windowId: 1, active: true },
      { id: 30, windowId: 2, active: true },
      { id: 40, windowId: 2, active: false },
    ],
  });
  const c = createController(f.browser);
  await c.ready;
  assert.deepEqual(f.session.mruState['1'].order, [10]);
  assert.deepEqual(f.session.mruState['2'].order, [30]);
});

test('persists state', async () => {
  const f = twoTabWindow();
  const c = createController(f.browser);
  activate(f, 1, 20);
  await c.idle();
  assert.equal(f.session.mruState['1'].order[0], 20);
});

test('serializes events', async () => {
  const f = twoTabWindow();
  const c = createController(f.browser);
  activate(f, 1, 10);
  activate(f, 1, 20);
  activate(f, 1, 30);
  await c.idle();
  assert.deepEqual(f.session.mruState['1'].order, [30, 20, 10]);
});

test('detached tab is forgotten', async () => {
  const f = twoTabWindow({ sessionData: { mruState: { 1: { order: [20, 10] } } } });
  const c = createController(f.browser);
  f.fire('tabs.onDetached', 10, { oldWindowId: 1, oldPosition: 0 });
  await c.idle();
  assert.deepEqual(f.session.mruState['1'].order, [20]);
});

test('window close drops entry', async () => {
  const f = twoTabWindow({ sessionData: { mruState: { 1: { order: [20, 10] } } } });
  const c = createController(f.browser);
  f.fire('tabs.onRemoved', 20, { windowId: 1, isWindowClosing: true });
  await c.idle();
  assert.ok(!('1' in f.session.mruState));
});

test('windows.onRemoved drops entry', async () => {
  const f = twoTabWindow({ sessionData: { mruState: { 1: { order: [20, 10] } } } });
  const c = createController(f.browser);
  f.fire('windows.onRemoved', 1);
  await c.idle();
  assert.ok(!('1' in f.session.mruState));
});

test('snapshot lists tabs in MRU order per window', async () => {
  const f = createFakeBrowser({ tabs: [tab(10, 0, true), tab(20, 1), tab(30, 2)] });
  const out = sink();
  const c = createController(f.browser, { bridge: out.bridge });
  activate(f, 1, 20);
  activate(f, 1, 30);
  await c.idle();
  assert.deepEqual(out.ids(), [30, 20, 10]);
  assert.deepEqual(out.last().windows['1'].tabs[0], { id: 30, title: 'Tab 30', favIconUrl: 'https://icon/30', hasPreview: false });
  assert.equal(out.last().type, 'snapshot');
});

test('snapshot appends unseen open tabs and drops closed ones', async () => {
  const f = twoTabWindow({ sessionData: { mruState: { 1: { order: [99, 10] } } } });
  const out = sink();
  const c = createController(f.browser, { bridge: out.bridge });
  await c.idle();
  assert.deepEqual(out.ids(), [10, 20]);
});

test('snapshot skips incognito tabs', async () => {
  const f = createFakeBrowser({
    tabs: [tab(10, 0, true), { id: 50, windowId: 5, active: true, index: 0, incognito: true }],
  });
  const out = sink();
  const c = createController(f.browser, { bridge: out.bridge });
  await c.idle();
  assert.deepEqual(Object.keys(out.last().windows), ['1']);
});

test('snapshot tracks focused window', async () => {
  const f = createFakeBrowser({ tabs: [tab(10, 0, true), { id: 30, windowId: 2, active: true, index: 0 }], focusedWindowId: 2 });
  const out = sink();
  const c = createController(f.browser, { bridge: out.bridge });
  await c.idle();
  assert.equal(out.last().focusedWindowId, 2);
  f.fire('windows.onFocusChanged', 1);
  await c.idle();
  assert.equal(out.last().focusedWindowId, 1);
  f.fire('windows.onFocusChanged', -1); // WINDOW_ID_NONE: Safari lost focus, keep the last window
  await c.idle();
  assert.equal(out.last().focusedWindowId, 1);
});

test('title changes republish the snapshot', async () => {
  const f = twoTabWindow();
  const out = sink();
  const c = createController(f.browser, { bridge: out.bridge, schedule: () => {} });
  await c.idle();
  f.tabs[1].title = 'Renamed';
  f.fire('tabs.onUpdated', 20, { title: 'Renamed' }, { ...f.tabs[1] });
  await c.idle();
  assert.equal(out.last().windows['1'].tabs.find((t) => t.id === 20)?.title, 'Renamed');
});

test('activate from app switches tab and acknowledges', async () => {
  const f = twoTabWindow();
  const out = sink();
  const c = createController(f.browser, { bridge: out.bridge });
  out.activateFromApp(20);
  await c.idle();
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(f.updateCalls, [[20, { active: true }]]);
  assert.deepEqual(out.acks, [20]);
});

test('activate ignores closed tab', async () => {
  const f = twoTabWindow();
  const out = sink();
  const c = createController(f.browser, { bridge: out.bridge });
  out.activateFromApp(99);
  await c.idle();
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(f.updateCalls, [[99, { active: true }]]);
});

test('legacy stored state is normalized', async () => {
  const f = twoTabWindow({ sessionData: { mruState: { 1: { current: 20, previous: 10 } } } });
  const out = sink();
  const c = createController(f.browser, { bridge: out.bridge });
  await c.idle();
  assert.deepEqual(out.ids(), [20, 10]);
});

// --- previews -------------------------------------------------------------

function withTimers() {
  const pending: Array<() => void> = [];
  return {
    schedule: (fn: () => void) => void pending.push(fn),
    async runAll(c: { idle(): Promise<void> }) {
      while (pending.length) pending.shift()!();
      await c.idle();
      await new Promise((r) => setTimeout(r, 0));
    },
  };
}

const setActive = (f: FakeBrowser, id: number) => {
  for (const t of f.tabs) if (t.windowId === 1) t.active = t.id === id;
};

test('captures after activation when tab still active', async () => {
  const f = twoTabWindow();
  const timers = withTimers();
  let calls = 0;
  const capture = async (w: number) => {
    calls += 1;
    if (calls > 1) throw new Error('later capture fails');
    return `data:w${w}`;
  };
  const out = sink();
  const c = createController(f.browser, { capture, schedule: timers.schedule, bridge: out.bridge });
  setActive(f, 20);
  activate(f, 1, 20);
  await timers.runAll(c);
  assert.deepEqual(out.previews, [[20, 'data:w1']]);
  assert.equal(out.last().windows['1'].tabs.find((t) => t.id === 20)?.hasPreview, true);
});

test('skips capture if tab no longer active', async () => {
  const f = twoTabWindow();
  const timers = withTimers();
  const captured: number[] = [];
  const capture = async (w: number) => {
    captured.push(w);
    throw new Error('no capture');
  };
  const out = sink();
  const c = createController(f.browser, { capture, schedule: timers.schedule, bridge: out.bridge });
  activate(f, 1, 20); // fake keeps 10 active
  await timers.runAll(c);
  assert.deepEqual(captured, []);
  assert.deepEqual(out.previews, []);
});

test('captures after a page finishes loading in the active tab', async () => {
  const f = twoTabWindow();
  const timers = withTimers();
  const out = sink();
  const c = createController(f.browser, { capture: async () => 'data:loaded', schedule: timers.schedule, bridge: out.bridge });
  f.fire('tabs.onUpdated', 10, { status: 'complete' }, { id: 10, windowId: 1, active: true });
  f.fire('tabs.onUpdated', 20, { status: 'complete' }, { id: 20, windowId: 1, active: false });
  await timers.runAll(c);
  assert.deepEqual(out.previews, [[10, 'data:loaded']]);
});

test('capture failure leaves no preview', async () => {
  const f = twoTabWindow();
  const timers = withTimers();
  const out = sink();
  const c = createController(f.browser, {
    capture: async () => {
      throw new Error('restricted page');
    },
    schedule: timers.schedule,
    bridge: out.bridge,
  });
  activate(f, 1, 10);
  await timers.runAll(c);
  assert.deepEqual(out.previews, []);
  assert.ok(out.last().windows['1'].tabs.every((t) => !t.hasPreview));
});

test('closing a tab drops its preview', async () => {
  const f = twoTabWindow();
  const timers = withTimers();
  let fail = false;
  const capture = async () => {
    if (fail) throw new Error('off');
    return 'data:x';
  };
  const out = sink();
  const c = createController(f.browser, { capture, schedule: timers.schedule, bridge: out.bridge });
  f.fire('tabs.onUpdated', 20, { status: 'complete' }, { id: 20, windowId: 1, active: true });
  await timers.runAll(c);
  fail = true;
  f.fire('tabs.onRemoved', 20, { windowId: 1, isWindowClosing: false });
  f.tabs.push({ ...tab(20, 1) }); // same id reappears in the query result
  await c.idle();
  assert.equal(out.last().windows['1'].tabs.find((t) => t.id === 20)?.hasPreview, false);
});

test('private tabs are never captured', async () => {
  const f = createFakeBrowser({
    tabs: [{ id: 50, windowId: 5, active: true, index: 0, incognito: true }],
    focusedWindowId: 5,
  });
  const timers = withTimers();
  const captured: number[] = [];
  const out = sink();
  const c = createController(f.browser, {
    capture: async (w) => {
      captured.push(w);
      return 'data:secret';
    },
    schedule: timers.schedule,
    bridge: out.bridge,
  });
  activate(f, 5, 50);
  f.fire('tabs.onUpdated', 50, { status: 'complete' }, { id: 50, windowId: 5, active: true, incognito: true });
  await timers.runAll(c);
  assert.deepEqual(captured, []);
  assert.deepEqual(out.previews, []);
});

test('previews survive the background being reloaded', async () => {
  const f = twoTabWindow();
  const timers = withTimers();
  const first = createController(f.browser, { capture: async () => 'data:x', schedule: timers.schedule, bridge: sink().bridge });
  setActive(f, 20);
  f.fire('tabs.onUpdated', 20, { status: 'complete' }, { id: 20, windowId: 1, active: true });
  await timers.runAll(first);

  // Safari unloads the idle background and starts it again: memory is gone, session storage is not.
  assert.deepEqual(f.session.previewIds, [20]);
  const g = twoTabWindow({ sessionData: structuredClone(f.session) });
  const out = sink();
  const second = createController(g.browser, { schedule: timers.schedule, bridge: out.bridge });
  await second.ready;
  assert.equal(out.last().windows['1'].tabs.find((t) => t.id === 20)?.hasPreview, true);
  assert.equal(out.last().windows['1'].tabs.find((t) => t.id === 10)?.hasPreview, false);
});

// --- profiles -------------------------------------------------------------

test('makes a profile id once and keeps it', async () => {
  const f = twoTabWindow();
  const out = sink();
  await createController(f.browser, { bridge: out.bridge, newProfileId: () => 'p-new' }).ready;
  assert.equal(f.local.profileId, 'p-new');
  assert.equal(out.last().profile, 'p-new');

  const again = sink();
  await createController(f.browser, { bridge: again.bridge, newProfileId: () => 'p-other' }).ready;
  assert.equal(again.last().profile, 'p-new');
});

test('focusing a window stamps the snapshot and survives a reload', async () => {
  const f = twoTabWindow({ localData: { profileId: 'p1' } });
  const out = sink();
  const c = createController(f.browser, { bridge: out.bridge, now: () => 5000 });
  await c.ready;
  assert.equal(out.last().focusedAt, 0);
  f.fire('windows.onFocusChanged', 1);
  await c.idle();
  assert.equal(out.last().focusedAt, 5000);
  f.fire('windows.onFocusChanged', -1); // focus left this profile: keep the stamp
  await c.idle();
  assert.equal(out.last().focusedAt, 5000);

  const g = twoTabWindow({ localData: { profileId: 'p1' }, sessionData: structuredClone(f.session) });
  const reloaded = sink();
  await createController(g.browser, { bridge: reloaded.bridge }).ready;
  assert.equal(reloaded.last().focusedAt, 5000);
});

test('previews go out with the profile', async () => {
  const f = twoTabWindow({ localData: { profileId: 'p1' } });
  const timers = withTimers();
  const out = sink();
  const c = createController(f.browser, { capture: async () => 'data:x', schedule: timers.schedule, bridge: out.bridge });
  f.fire('tabs.onUpdated', 10, { status: 'complete' }, { id: 10, windowId: 1, active: true });
  await timers.runAll(c);
  assert.deepEqual(out.previewProfiles, ['p1']);
});

test('activate meant for another profile is left to it', async () => {
  const f = twoTabWindow({ localData: { profileId: 'p1' } });
  const out = sink();
  const c = createController(f.browser, { bridge: out.bridge });
  await c.ready;
  out.activateFromApp(20, 'p2');
  await c.idle();
  assert.deepEqual(f.updateCalls, []);
  assert.deepEqual(out.acks, []);
  out.activateFromApp(20, 'p1');
  await c.idle();
  assert.deepEqual(f.updateCalls, [[20, { active: true }]]);
  assert.deepEqual(out.acks, [20]);
});
