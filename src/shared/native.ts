// Messages between the background and the app's native handler
// (decoded by NativeMessages.swift in "Last Tab/Core").
import type { Combo } from './combo.ts';

export type SnapshotTab = { id: number; title: string; favIconUrl: string | null; hasPreview: boolean };

export type SnapshotMessage = {
  type: 'snapshot';
  focusedWindowId: number | null;
  /** Keyed by window id; tabs most recently used first. */
  windows: Record<string, { tabs: SnapshotTab[] }>;
};

export type NativeMessage =
  | SnapshotMessage
  | { type: 'preview'; tabId: number; jpegBase64: string }
  | { type: 'shortcuts'; forward: Combo; reverse: Combo | null }
  | { type: 'activated'; tabId: number }
  | { type: 'ping' };

export type NativeReply = { ok: boolean; appRunning: boolean };

/** What `SFSafariApplication.dispatchMessage(withName: "activate", …)` delivers on the native port. */
export type AppMessage = { name: 'activate'; userInfo: { tabId: number } };

/** From the settings popup to the background. */
export type StatusRequest = { type: 'app:status' };
export type StatusResponse = { appRunning: boolean };
