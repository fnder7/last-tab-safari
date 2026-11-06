import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../extension/mru.js';
import '../extension/controller.js';
import { createFakeBrowser } from './fake-browser.js';

const { createController } = globalThis.LastTabController;
const CMD = 'toggle-last-tab';
const activate = (f, windowId, tabId) => f.fire('tabs.onActivated', { tabId, windowId });

function twoTabWindow(extra = {}) {
  return createFakeBrowser({
    tabs: [
      { id: 10, windowId: 1, active: true },
      { id: 20, windowId: 1, active: false },
    ],
    focusedWindowId: 1,
    ...extra,
  });
}

test('registers listeners synchronously', () => {
  const f = twoTabWindow();
  createController(f.browser);
  for (const path of ['tabs.onActivated', 'tabs.onRemoved', 'tabs.onDetached', 'windows.onRemoved', 'commands.onCommand']) {
    assert.ok(f.listeners.get(path)?.length, path);
  }
});

test('seeds focused window at startup', async () => {
  const f = twoTabWindow();
  const c = createController(f.browser);
  await c.ready;
  activate(f, 1, 20);
  await c.idle();
  f.fire('commands.onCommand', CMD);
  await c.idle();
  assert.deepEqual(f.updateCalls, [[10, { active: true }]]);
});

test('second press goes back', async () => {
  const f = twoTabWindow();
  const c = createController(f.browser);
  activate(f, 1, 20);
  f.fire('commands.onCommand', CMD);
  await c.idle();
  activate(f, 1, 10); // effect of tabs.update
  f.fire('commands.onCommand', CMD);
  await c.idle();
  assert.deepEqual(f.updateCalls.at(-1), [20, { active: true }]);
});

test('command without entry is a no-op', async () => {
  const f = createFakeBrowser({ tabs: [], focusedWindowId: 2 });
  const c = createController(f.browser);
  f.fire('commands.onCommand', CMD);
  await c.idle();
  assert.deepEqual(f.updateCalls, []);
});

test('ignores other commands', async () => {
  const f = twoTabWindow();
  const c = createController(f.browser);
  activate(f, 1, 20);
  f.fire('commands.onCommand', 'something-else');
  await c.idle();
  assert.deepEqual(f.updateCalls, []);
});

test('restores state from storage', async () => {
  const f = twoTabWindow({ sessionData: { mruState: { 1: { current: 20, previous: 10 } } } });
  const c = createController(f.browser);
  f.fire('commands.onCommand', CMD);
  await c.idle();
  assert.deepEqual(f.updateCalls, [[10, { active: true }]]);
});

test('persists state', async () => {
  const f = twoTabWindow();
  const c = createController(f.browser);
  activate(f, 1, 20);
  await c.idle();
  assert.equal(f.session.mruState['1'].current, 20);
});

test('clears previous when update rejects', async () => {
  const f = twoTabWindow({ sessionData: { mruState: { 1: { current: 20, previous: 99 } } } });
  const c = createController(f.browser);
  f.fire('commands.onCommand', CMD);
  await c.idle();
  assert.deepEqual(f.updateCalls, [[99, { active: true }]]);
  assert.equal(f.session.mruState['1'].previous, null);
});

test('detached tab is forgotten', async () => {
  const f = twoTabWindow({ sessionData: { mruState: { 1: { current: 20, previous: 10 } } } });
  const c = createController(f.browser);
  f.fire('tabs.onDetached', 10, { oldWindowId: 1, oldPosition: 0 });
  f.fire('commands.onCommand', CMD);
  await c.idle();
  assert.deepEqual(f.updateCalls, []);
});

test('window close drops entry', async () => {
  const f = twoTabWindow({ sessionData: { mruState: { 1: { current: 20, previous: 10 } } } });
  const c = createController(f.browser);
  f.fire('tabs.onRemoved', 20, { windowId: 1, isWindowClosing: true });
  await c.idle();
  assert.ok(!('1' in f.session.mruState));
});

test('windows.onRemoved drops entry', async () => {
  const f = twoTabWindow({ sessionData: { mruState: { 1: { current: 20, previous: 10 } } } });
  const c = createController(f.browser);
  f.fire('windows.onRemoved', 1);
  await c.idle();
  assert.ok(!('1' in f.session.mruState));
});

test('serializes events', async () => {
  const f = twoTabWindow();
  const c = createController(f.browser);
  activate(f, 1, 10);
  activate(f, 1, 20);
  activate(f, 1, 30);
  await c.idle();
  assert.deepEqual(f.session.mruState['1'], { current: 30, previous: 20 });
});
