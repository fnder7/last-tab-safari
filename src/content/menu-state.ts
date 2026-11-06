// Pure state machine for the Cmd-Tab style menu. No DOM, no browser APIs.
import type { MenuTab } from '../shared/messages.ts';

export type MenuState =
  | { phase: 'closed' }
  /**
   * Shortcut pressed, waiting for the tab list. `steps` counts net presses of the current hold
   * (reverse = −1); `completed` holds the steps of earlier holds already released (quick taps).
   */
  | { phase: 'loading'; steps: number; released: boolean; completed: number[] }
  /** `currentId` is the tab the page is really on; selecting it means "stay". */
  | { phase: 'open'; tabs: MenuTab[]; index: number; currentId: number };

export type Action =
  | { type: 'press'; dir: 'forward' | 'reverse' }
  | { type: 'listLoaded'; tabs: MenuTab[] }
  | { type: 'arrow'; dir: 'left' | 'right' }
  | { type: 'release' }
  | { type: 'escape' }
  | { type: 'blur' };

export type Effect =
  | { type: 'requestList' }
  | { type: 'render'; tabs: MenuTab[]; index: number }
  | { type: 'close' }
  | { type: 'activate'; tabId: number };

type Result = { state: MenuState; effects: Effect[] };

const CLOSED: MenuState = { phase: 'closed' };
const mod = (n: number, m: number) => ((n % m) + m) % m;
const delta = (dir: 'forward' | 'reverse' | 'left' | 'right') => (dir === 'forward' || dir === 'right' ? 1 : -1);

const activateUnless = (tab: MenuTab, currentId: number): Effect[] =>
  tab.id === currentId ? [] : [{ type: 'activate', tabId: tab.id }];

/** Replays quick taps that finished before the list arrived: each one moves its target to the front. */
function replay(tabs: MenuTab[], completed: number[]): MenuTab[] {
  let order = tabs;
  for (const steps of completed) {
    const target = order[mod(steps, order.length)];
    order = [target, ...order.filter((t) => t !== target)];
  }
  return order;
}

export function initial(): MenuState {
  return CLOSED;
}

export function reduce(state: MenuState, action: Action): Result {
  const same: Result = { state, effects: [] };

  switch (state.phase) {
    case 'closed':
      if (action.type !== 'press') return same;
      return {
        state: { phase: 'loading', steps: delta(action.dir), released: false, completed: [] },
        effects: [{ type: 'requestList' }],
      };

    case 'loading':
      switch (action.type) {
        case 'press':
          if (state.released) {
            // A new hold after a quick tap: remember the tap and start counting again.
            const completed = [...state.completed, state.steps];
            return { state: { phase: 'loading', steps: delta(action.dir), released: false, completed }, effects: [] };
          }
          return { state: { ...state, steps: state.steps + delta(action.dir) }, effects: [] };
        case 'release':
          return { state: { ...state, released: true }, effects: [] };
        case 'escape':
        case 'blur':
          return { state: CLOSED, effects: [] };
        case 'listLoaded': {
          if (action.tabs.length < 2) return { state: CLOSED, effects: [] };
          const currentId = action.tabs[0].id;
          const tabs = replay(action.tabs, state.completed);
          const index = mod(state.steps, tabs.length);
          if (state.released) return { state: CLOSED, effects: activateUnless(tabs[index], currentId) };
          return { state: { phase: 'open', tabs, index, currentId }, effects: [{ type: 'render', tabs, index }] };
        }
        default:
          return same;
      }

    case 'open':
      switch (action.type) {
        case 'press':
        case 'arrow': {
          const index = mod(state.index + delta(action.dir), state.tabs.length);
          return { state: { ...state, index }, effects: [{ type: 'render', tabs: state.tabs, index }] };
        }
        case 'release':
          return { state: CLOSED, effects: [{ type: 'close' }, ...activateUnless(state.tabs[state.index], state.currentId)] };
        case 'escape':
        case 'blur':
          return { state: CLOSED, effects: [{ type: 'close' }] };
        default:
          return same;
      }
  }
}
