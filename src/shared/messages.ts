// Messages from the content script to the background.

export type Request = { type: 'menu:list' } | { type: 'menu:activate'; tabId: number };

export type MenuTab = {
  id: number;
  title: string;
  favIconUrl: string | null;
  /** JPEG data URL, or null when no preview has been captured yet. */
  preview: string | null;
};

export type ListResponse = { tabs: MenuTab[] };
