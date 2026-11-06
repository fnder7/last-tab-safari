// Pure per-window most-recently-used tab order. No browser APIs.

export type WindowEntry = { readonly order: readonly number[] };
/** Keyed by window id as a string; `order` is most recent first. */
export type MruState = Readonly<Record<string, WindowEntry>>;

export function emptyState(): MruState {
  return {};
}

/** Accepts anything read from storage; converts the legacy `{current, previous}` shape. */
export function normalize(raw: unknown): MruState {
  if (!raw || typeof raw !== 'object') return {};
  const state: Record<string, WindowEntry> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!value || typeof value !== 'object') continue;
    if (Array.isArray((value as { order?: unknown }).order)) {
      const order = (value as { order: unknown[] }).order.filter((id): id is number => typeof id === 'number');
      state[key] = { order };
      continue;
    }
    const { current, previous } = value as { current?: unknown; previous?: unknown };
    const order = [current, previous].filter((id): id is number => typeof id === 'number');
    if (order.length > 0) state[key] = { order };
  }
  return state;
}

export function orderFor(state: MruState, windowId: number): readonly number[] {
  return state[String(windowId)]?.order ?? [];
}

export function onActivated(state: MruState, windowId: number, tabId: number): MruState {
  const order = orderFor(state, windowId);
  if (order[0] === tabId) return state;
  return { ...state, [String(windowId)]: { order: [tabId, ...order.filter((id) => id !== tabId)] } };
}

export function onTabRemoved(state: MruState, windowId: number, tabId: number): MruState {
  const order = orderFor(state, windowId);
  if (!order.includes(tabId)) return state;
  return { ...state, [String(windowId)]: { order: order.filter((id) => id !== tabId) } };
}

export function onWindowRemoved(state: MruState, windowId: number): MruState {
  const { [String(windowId)]: _removed, ...rest } = state;
  return rest;
}
