import type { Browser } from 'webextension-polyfill';

declare global {
  /** Safari's WebExtension namespace. Types only: the polyfill is never bundled. */
  const browser: Browser;
}

export {};
