// Pure, bounded in-memory cache of tab previews (data URLs).

export type PreviewCache = {
  get(tabId: number): string | undefined;
  set(tabId: number, dataUrl: string): void;
  delete(tabId: number): void;
  readonly size: number;
};

export function createPreviewCache({ maxEntries = 50 }: { maxEntries?: number } = {}): PreviewCache {
  // Map keeps insertion order: the first key is the least recently set.
  const entries = new Map<number, string>();
  return {
    get: (tabId) => entries.get(tabId),
    set(tabId, dataUrl) {
      entries.delete(tabId);
      entries.set(tabId, dataUrl);
      while (entries.size > maxEntries) entries.delete(entries.keys().next().value!);
    },
    delete: (tabId) => void entries.delete(tabId),
    get size() {
      return entries.size;
    },
  };
}
