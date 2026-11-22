// Messages between the background and the app's native handler
// (decoded by NativeMessages.swift in "Last Tab/Core").
import type { Combo } from './combo.ts';

export type SnapshotTab = { id: number; title: string; favIconUrl: string | null; hasPreview: boolean };

export type SnapshotMessage = {
  type: 'snapshot';
  /**
   * Which Safari profile sent it: every profile runs its own background, and each one only sees
   * its own windows. The app keeps one snapshot per profile.
   */
  profile: string;
  /** When a window of this profile last got focus (ms since epoch); the app shows the latest. */
  focusedAt: number;
  focusedWindowId: number | null;
  /** Keyed by window id; tabs most recently used first. */
  windows: Record<string, { tabs: SnapshotTab[] }>;
};

export type NativeMessage =
  | SnapshotMessage
  | { type: 'preview'; profile: string; tabId: number; jpegBase64: string }
  | { type: 'shortcuts'; forward: Combo; reverse: Combo | null }
  | { type: 'activated'; tabId: number }
  /** Whether Safari lets the extension run on every website (needed for previews). */
  | { type: 'access'; allSites: boolean }
  | { type: 'ping' };

export type NativeReply = { ok: boolean; appRunning: boolean };

/** What `SFSafariApplication.dispatchMessage(withName: "activate", …)` delivers on the native port. */
export type AppMessage = { name: 'activate'; userInfo: { tabId: number; profile?: string } };

/** From the settings popup to the background. */
export type StatusRequest = { type: 'app:status' };
export type StatusResponse = { appRunning: boolean };
