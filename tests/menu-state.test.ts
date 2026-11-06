import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initial, reduce, type Action, type Effect, type MenuState } from '../src/content/menu-state.ts';
import type { MenuTab } from '../src/shared/messages.ts';

const card = (id: number): MenuTab => ({ id, title: `T${id}`, favIconUrl: null, preview: null });
const T = [card(1), card(2), card(3)];

function run(actions: Action[], from: MenuState = initial()) {
  let state = from;
  const effects: Effect[] = [];
  for (const action of actions) {
    const result = reduce(state, action);
    state = result.state;
    effects.push(...result.effects);
  }
  return { state, effects };
}

const fwd: Action = { type: 'press', dir: 'forward' };
const rev: Action = { type: 'press', dir: 'reverse' };
const loaded = (tabs = T): Action => ({ type: 'listLoaded', tabs });
const lastRenderIndex = (effects: Effect[]) => {
  const renders = effects.filter((e) => e.type === 'render');
  const last = renders.at(-1);
  return last && last.type === 'render' ? last.index : undefined;
};

test('press opens loading and requests list', () => {
  const { state, effects } = run([fwd]);
  assert.equal(state.phase, 'loading');
  assert.deepEqual(effects, [{ type: 'requestList' }]);
});

test('listLoaded opens with index 1', () => {
  const { state, effects } = run([fwd, loaded()]);
  assert.equal(state.phase, 'open');
  assert.deepEqual(effects.at(-1), { type: 'render', tabs: T, index: 1 });
});

test('reverse press opens on last', () => {
  assert.equal(lastRenderIndex(run([rev, loaded()]).effects), 2);
});

test('press while open steps forward and wraps', () => {
  assert.equal(lastRenderIndex(run([fwd, loaded(), fwd]).effects), 2);
  assert.equal(lastRenderIndex(run([fwd, loaded(), fwd, fwd]).effects), 0);
});

test('reverse steps back and wraps', () => {
  assert.equal(lastRenderIndex(run([fwd, loaded(), rev]).effects), 0);
  assert.equal(lastRenderIndex(run([fwd, loaded(), rev, rev]).effects), 2);
});

test('arrows step', () => {
  assert.equal(lastRenderIndex(run([fwd, loaded(), { type: 'arrow', dir: 'right' }]).effects), 2);
  assert.equal(lastRenderIndex(run([fwd, loaded(), { type: 'arrow', dir: 'left' }]).effects), 0);
});

test('release activates selection', () => {
  const { state, effects } = run([fwd, loaded(), fwd, { type: 'release' }]);
  assert.equal(state.phase, 'closed');
  assert.deepEqual(effects.slice(-2), [{ type: 'close' }, { type: 'activate', tabId: 3 }]);
});

test('release on current tab does not activate', () => {
  const { effects } = run([fwd, loaded(), fwd, fwd, { type: 'release' }]);
  assert.deepEqual(effects.at(-1), { type: 'close' });
  assert.ok(!effects.some((e) => e.type === 'activate'));
});

test('escape closes without activate', () => {
  const { state, effects } = run([fwd, loaded(), { type: 'escape' }]);
  assert.equal(state.phase, 'closed');
  assert.deepEqual(effects.at(-1), { type: 'close' });
  assert.ok(!effects.some((e) => e.type === 'activate'));
});

test('blur closes without activate', () => {
  const { state, effects } = run([fwd, loaded(), { type: 'blur' }]);
  assert.equal(state.phase, 'closed');
  assert.ok(!effects.some((e) => e.type === 'activate'));
});

test('blur while loading drops the pending press', () => {
  const { state, effects } = run([fwd, { type: 'blur' }, loaded()]);
  assert.equal(state.phase, 'closed');
  assert.deepEqual(effects, [{ type: 'requestList' }]);
});

test('quick tap switches without rendering', () => {
  const { state, effects } = run([fwd, { type: 'release' }, loaded()]);
  assert.equal(state.phase, 'closed');
  assert.deepEqual(effects, [{ type: 'requestList' }, { type: 'activate', tabId: 2 }]);
});

test('presses during loading add steps', () => {
  assert.equal(lastRenderIndex(run([fwd, fwd, loaded()]).effects), 2);
});

test('single tab never opens', () => {
  const { state, effects } = run([fwd, loaded([card(1)])]);
  assert.equal(state.phase, 'closed');
  assert.deepEqual(effects, [{ type: 'requestList' }]);
});

test('ignored actions return same state', () => {
  const closed = initial();
  const result = reduce(closed, { type: 'release' });
  assert.equal(result.state, closed);
  assert.deepEqual(result.effects, []);
  const open = run([fwd, loaded()]).state;
  const stale = reduce(open, loaded());
  assert.equal(stale.state, open);
  assert.deepEqual(stale.effects, []);
});

test('two quick taps before the list arrives go there and back', () => {
  const { state, effects } = run([fwd, { type: 'release' }, fwd, { type: 'release' }, loaded()]);
  assert.equal(state.phase, 'closed');
  assert.deepEqual(effects, [{ type: 'requestList' }]); // B then back to A: no switch
});

test('quick tap then a hold opens from the new current tab', () => {
  const { state, effects } = run([fwd, { type: 'release' }, fwd, loaded()]);
  assert.equal(state.phase, 'open');
  const render = effects.at(-1);
  assert.ok(render && render.type === 'render');
  assert.deepEqual(render.tabs.map((t) => t.id), [2, 1, 3]);
  assert.equal(render.index, 1);
});

test('tap then hold ending on the original tab does not switch', () => {
  // The real tab never changed while loading, so landing on tab 1 again means "stay".
  const { effects } = run([fwd, { type: 'release' }, fwd, loaded(), { type: 'release' }]);
  assert.deepEqual(effects.at(-1), { type: 'close' });
  assert.ok(!effects.some((e) => e.type === 'activate'));
});

test('tap then hold stepping further switches to that tab', () => {
  const { effects } = run([fwd, { type: 'release' }, fwd, loaded(), fwd, { type: 'release' }]);
  assert.deepEqual(effects.slice(-2), [{ type: 'close' }, { type: 'activate', tabId: 3 }]);
});
