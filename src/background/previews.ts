// Pure, bounded set of the tab ids whose preview the app has on disk. Only ids are kept: the
// images themselves live in the app's cache, and the list is small enough to persist in session
// storage, so it survives Safari unloading the background.

export type PreviewIds = {
  has(tabId: number): boolean;
  add(tabId: number): void;
  delete(tabId: number): void;
  /** Oldest first; feed back to `createPreviewIds` to restore. */
  toJSON(): number[];
  readonly size: number;
};

export function createPreviewIds(initial: unknown = [], { maxEntries = 50 }: { maxEntries?: number } = {}): PreviewIds {
  // Set keeps insertion order: the first id is the least recently added.
  const ids = new Set<number>();
  const add = (tabId: number) => {
    ids.delete(tabId);
    ids.add(tabId);
    while (ids.size > maxEntries) ids.delete(ids.values().next().value!);
  };
  if (Array.isArray(initial)) for (const id of initial) if (Number.isInteger(id)) add(id);
  return {
    has: (tabId) => ids.has(tabId),
    add,
    delete: (tabId) => void ids.delete(tabId),
    toJSON: () => [...ids],
    get size() {
      return ids.size;
    },
  };
}
