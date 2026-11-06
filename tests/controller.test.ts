import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createController } from '../src/background/controller.ts';
import type { ListResponse } from '../src/shared/messages.ts';
import { createFakeBrowser, type FakeBrowser, type FakeTab } from './fake-browser.ts';

const activate = (f: FakeBrowser, windowId: number, tabId: number) => f.fire('tabs.onActivated', { tabId, windowId });
const sender = (id: number, windowId = 1) => ({ tab: { id, windowId } });
const list = async (f: FakeBrowser, from = sender(10)) =>
  (await f.send({ type: 'menu:list' }, from)) as ListResponse;

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

test('registers listeners synchronously', () => {
  const f = twoTabWindow();
  createController(f.browser);
  for (const path of [
    'tabs.onActivated',
    'tabs.onRemoved',
    'tabs.onDetached',
    'tabs.onUpdated',
    'windows.onRemoved',
    'runtime.onMessage',
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

test('menu:list returns MRU order', async () => {
  const f = createFakeBrowser({ tabs: [tab(10, 0, true), tab(20, 1), tab(30, 2)] });
  const c = createController(f.browser);
  activate(f, 1, 20);
  activate(f, 1, 30);
  await c.idle();
  const { tabs } = await list(f, sender(30));
  assert.deepEqual(tabs.map((t) => t.id), [30, 20, 10]);
  assert.deepEqual(tabs[0], { id: 30, title: 'Tab 30', favIconUrl: 'https://icon/30', preview: null });
});

test('menu:list appends unseen open tabs and drops closed ones', async () => {
  const f = twoTabWindow({ sessionData: { mruState: { 1: { order: [99, 10] } } } });
  createController(f.browser);
  const { tabs } = await list(f);
  assert.deepEqual(tabs.map((t) => t.id), [10, 20]);
});

test('menu:activate switches tab', async () => {
  const f = twoTabWindow();
  createController(f.browser);
  await f.send({ type: 'menu:activate', tabId: 20 }, sender(10));
  assert.deepEqual(f.updateCalls, [[20, { active: true }]]);
});

test('activate ignores a closed tab', async () => {
  const f = twoTabWindow();
  createController(f.browser);
  await assert.doesNotReject(f.send({ type: 'menu:activate', tabId: 99 }, sender(10)));
});

test('legacy stored state is normalized', async () => {
  const f = twoTabWindow({ sessionData: { mruState: { 1: { current: 20, previous: 10 } } } });
  createController(f.browser);
  const { tabs } = await list(f);
  assert.deepEqual(tabs.map((t) => t.id), [20, 10]);
});

test('unknown messages get no reply', async () => {
  const f = twoTabWindow();
  createController(f.browser);
  assert.equal(await f.send({ type: 'nope' }, sender(10)), undefined);
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
  const c = createController(f.browser, { capture, schedule: timers.schedule });
  setActive(f, 20);
  activate(f, 1, 20);
  await timers.runAll(c);
  const { tabs } = await list(f, sender(20));
  assert.equal(tabs.find((t) => t.id === 20)?.preview, 'data:w1');
});

test('skips capture if tab no longer active', async () => {
  const f = twoTabWindow();
  const timers = withTimers();
  const captured: number[] = [];
  const capture = async (w: number) => {
    captured.push(w);
    throw new Error('no capture');
  };
  const c = createController(f.browser, { capture, schedule: timers.schedule });
  activate(f, 1, 20); // fake keeps 10 active
  await timers.runAll(c);
  assert.deepEqual(captured, []);
  const { tabs } = await list(f, sender(20));
  assert.equal(tabs.find((t) => t.id === 20)?.preview, null);
});

test('captures after a page finishes loading in the active tab', async () => {
  const f = twoTabWindow();
  const timers = withTimers();
  const c = createController(f.browser, { capture: async () => 'data:loaded', schedule: timers.schedule });
  f.fire('tabs.onUpdated', 10, { status: 'complete' }, { id: 10, windowId: 1, active: true });
  f.fire('tabs.onUpdated', 20, { status: 'complete' }, { id: 20, windowId: 1, active: false });
  await timers.runAll(c);
  const { tabs } = await list(f, sender(20));
  assert.equal(tabs.find((t) => t.id === 10)?.preview, 'data:loaded');
});

test('capture failure leaves no preview', async () => {
  const f = twoTabWindow();
  const timers = withTimers();
  const c = createController(f.browser, {
    capture: async () => {
      throw new Error('restricted page');
    },
    schedule: timers.schedule,
  });
  activate(f, 1, 10);
  await timers.runAll(c);
  const { tabs } = await list(f);
  assert.ok(tabs.every((t) => t.preview === null));
});

test('closing a tab drops its preview', async () => {
  const f = twoTabWindow();
  const timers = withTimers();
  let fail = false;
  const capture = async () => {
    if (fail) throw new Error('off');
    return 'data:x';
  };
  const c = createController(f.browser, { capture, schedule: timers.schedule });
  f.fire('tabs.onUpdated', 20, { status: 'complete' }, { id: 20, windowId: 1, active: true });
  await timers.runAll(c);
  fail = true;
  f.fire('tabs.onRemoved', 20, { windowId: 1, isWindowClosing: false });
  f.tabs.push({ ...tab(20, 1) }); // same id reappears in the query result
  await c.idle();
  const { tabs } = await list(f);
  assert.equal(tabs.find((t) => t.id === 20)?.preview, null);
});

test('menu:list captures the sender tab', async () => {
  const f = twoTabWindow();
  createController(f.browser, { capture: async (w) => `data:w${w}`, schedule: () => {} });
  const { tabs } = await list(f, sender(10));
  assert.equal(tabs.find((t) => t.id === 10)?.preview, 'data:w1');
});
