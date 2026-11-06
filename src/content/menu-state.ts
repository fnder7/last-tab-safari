// Pure state machine for the Cmd-Tab style menu. No DOM, no browser APIs.
import type { MenuTab } from '../shared/messages.ts';

export type MenuState =
  | { phase: 'closed' }
  /** Shortcut pressed, waiting for the tab list. `steps` counts net presses (reverse = −1). */
  | { phase: 'loading'; steps: number; released: boolean }
  | { phase: 'open'; tabs: MenuTab[]; index: number };

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

/** The current tab is index 0, so selecting it means "stay": no activate effect. */
const activateUnlessCurrent = (tabs: MenuTab[], index: number): Effect[] =>
  index === 0 ? [] : [{ type: 'activate', tabId: tabs[index].id }];

export function initial(): MenuState {
  return CLOSED;
}

export function reduce(state: MenuState, action: Action): Result {
  const same: Result = { state, effects: [] };

  switch (state.phase) {
    case 'closed':
      if (action.type !== 'press') return same;
      return { state: { phase: 'loading', steps: delta(action.dir), released: false }, effects: [{ type: 'requestList' }] };

    case 'loading':
      switch (action.type) {
        case 'press':
          return { state: { ...state, steps: state.steps + delta(action.dir) }, effects: [] };
        case 'release':
          return { state: { ...state, released: true }, effects: [] };
        case 'escape':
        case 'blur':
          return { state: CLOSED, effects: [] };
        case 'listLoaded': {
          const { tabs } = action;
          if (tabs.length < 2) return { state: CLOSED, effects: [] };
          const index = mod(state.steps, tabs.length);
          if (state.released) return { state: CLOSED, effects: activateUnlessCurrent(tabs, index) };
          return { state: { phase: 'open', tabs, index }, effects: [{ type: 'render', tabs, index }] };
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
          return { state: CLOSED, effects: [{ type: 'close' }, ...activateUnlessCurrent(state.tabs, state.index)] };
        case 'escape':
        case 'blur':
          return { state: CLOSED, effects: [{ type: 'close' }] };
        default:
          return same;
      }
  }
}
