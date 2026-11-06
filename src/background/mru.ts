// Pure per-window "current / previous tab" state. No browser APIs.

export type WindowEntry = { current: number | null; previous: number | null };
export type MruState = Readonly<Record<string, WindowEntry>>;

const entryFor = (state: MruState, windowId: number): WindowEntry =>
  state[String(windowId)] ?? { current: null, previous: null };

const withEntry = (state: MruState, windowId: number, entry: WindowEntry): MruState => ({
  ...state,
  [String(windowId)]: entry,
});

export function emptyState(): MruState {
  return {};
}

export function onActivated(state: MruState, windowId: number, tabId: number): MruState {
  const { current, previous } = entryFor(state, windowId);
  if (tabId === current) return state;
  if (current !== null) return withEntry(state, windowId, { current: tabId, previous: current });
  // Current tab was closed: keep the earlier tab as the target.
  return withEntry(state, windowId, {
    current: tabId,
    previous: previous === tabId ? null : previous,
  });
}

export function onTabRemoved(state: MruState, windowId: number, tabId: number): MruState {
  const key = String(windowId);
  if (!(key in state)) return state;
  const { current, previous } = state[key];
  if (tabId !== current && tabId !== previous) return state;
  return withEntry(state, windowId, {
    current: tabId === current ? null : current,
    previous: tabId === previous ? null : previous,
  });
}

export function onWindowRemoved(state: MruState, windowId: number): MruState {
  const { [String(windowId)]: _removed, ...rest } = state;
  return rest;
}

export function targetFor(state: MruState, windowId: number): number | null {
  return entryFor(state, windowId).previous;
}
