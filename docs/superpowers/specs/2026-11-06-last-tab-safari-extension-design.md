# Last Tab — Safari Extension: Design

**Date:** 2026-11-06
**Status:** Approved in brainstorming, awaiting spec review

## Goal

A macOS Safari extension that switches to the previously active tab with a
keyboard shortcut, the way quick Cmd-Tab works for apps: press once to go from
the current tab C to the last-used tab B, press again to go back to C.

- **First target:** personal use, built locally in Xcode.
- **Later target:** App Store. The project structure, bundle IDs and
  permissions are chosen to be publishable without restructuring.

## Behavior

- **Toggle between two tabs.** The shortcut always activates the tab that was
  active right before the current one. Repeated presses alternate between the
  same two tabs. There is no deeper history traversal.
- **Per window.** Each Safari window has its own `{current, previous}` pair.
  The shortcut only acts within the focused window and never moves focus to
  another window.
- **No previous tab** (fresh window, or the previous tab was closed): the
  shortcut does nothing until the user switches tabs manually.
- **User-defined shortcut.** Configured by the user in Safari → Settings →
  Extensions → Last Tab → Shortcuts (Safari 26+). The extension ships a default
  shortcut (see "Default shortcut") and has no shortcut UI of its own.

## Architecture

Xcode project created from the "Safari Extension App" template (macOS only):

1. **Container app (Swift/SwiftUI).** A single window with short setup
   instructions (enable the extension, optionally allow it in private
   windows, how to change the shortcut) and a button that calls
   `SFSafariApplication.showPreferencesForExtension(withIdentifier:)`.
   Required for App Store distribution; no other logic.
2. **Safari Web Extension (Manifest V3):**
   - `manifest.json`: permissions `tabs` and `storage` only; no host
     permissions and no content scripts. One command, `toggle-last-tab`, with a
     `suggested_key`.
   - `mru.js`: pure state logic with no `browser.*` calls (see below).
   - `background.js`: non-persistent background script. Wires browser events
     to `mru.js`, persists state, and performs the tab switch.

### `mru.js` — pure state module

State: `{ [windowId]: { current: tabId | null, previous: tabId | null } }`.

Pure functions, each returns a new state and does not mutate its input:

| Function | Rule |
|---|---|
| `onActivated(state, windowId, tabId)` | If `tabId === current`: unchanged. Else if `current !== null`: `previous = current`, `current = tabId`. Else (current was closed): `current = tabId`, `previous` is kept, unless it equals `tabId`, in which case it is cleared. Creates the window entry if missing. |
| `onTabRemoved(state, windowId, tabId)` | If `tabId === previous`: `previous = null`. If `tabId === current`: `current = null`. |
| `onWindowRemoved(state, windowId)` | Deletes the window entry. |
| `targetFor(state, windowId)` | Returns `previous` or `null`. |

### `background.js` — wiring

- **Startup:** load state from `browser.storage.session`. If the focused
  window has no entry, seed `current` from `tabs.query({active: true,
  currentWindow: true})`.
- `tabs.onActivated` → `mru.onActivated` → save.
- `tabs.onRemoved` → `mru.onTabRemoved` (or `onWindowRemoved` when
  `removeInfo.isWindowClosing`) → save.
- `windows.onRemoved` → `mru.onWindowRemoved` → save.
- `commands.onCommand('toggle-last-tab')` → get the focused window →
  `targetFor` → if non-null, `tabs.update(target, {active: true})`. The
  resulting `onActivated` swaps `current`/`previous`, which is what makes the
  next press go back.
- If `tabs.update` rejects (the tab no longer exists), clear `previous` for
  that window and save.
- Listeners are registered synchronously at the top level, so they survive
  the background script being unloaded.

State lives in `storage.session` because Safari may unload the background
script at any time; it is not meant to survive a Safari restart.

## Default shortcut

Safari reserves Ctrl+Tab ("Show Next Tab"), and browser-reserved shortcuts
usually can't be assigned to an extension command. Before building anything
else, the first implementation task is a spike that checks this:

1. Build a minimal extension whose command uses `suggested_key` `MacCtrl+Tab`.
2. Check whether the command fires (a) as the default and (b) when assigned
   by hand in Safari's extension Shortcuts settings.

- **If either works:** the default is `MacCtrl+Tab` (or the instructions tell
  the user to assign it by hand).
- **If neither works:** the default is `Alt+Tab` (Option-Tab). If that fails
  too, fall back to a free combination confirmed during the spike. The
  container app's instructions state the shortcut actually shipped.

## Testing

- **Unit tests** for `mru.js` with `node --test`, no dependencies:
  - Toggle: activate A, then B; the target is A. Then activate A; the target
    is B.
  - The first tab in a window has no target.
  - Re-activating the current tab does not change `previous`.
  - Closing `previous` clears it, and closing `current` clears it.
  - After `current` is closed, activating another tab keeps `previous`. If the
    newly activated tab is `previous` itself, `previous` is cleared.
  - Windows are independent of each other.
  - Removing a window deletes its entry.
  - Functions do not mutate their input.
- **Manual checklist in Safari:** a normal page, the Start Page, focus in the
  address bar, an empty tab, a private window (after allowing the extension
  there), two windows with independent pairs, a Safari restart (no errors;
  starts with no target), closing the previous tab (the shortcut does
  nothing).

## Build and run (personal use)

- Sign with a free Apple ID (Personal Team) in Xcode, or enable
  Safari → Develop → "Allow Unsigned Extensions" (resets on each Safari
  restart).
- Bundle IDs use a reverse-DNS prefix chosen by the user so they can be kept
  for App Store submission.

## Out of scope

- Traversing deeper history (C → B → A).
- An Arc/Cmd-Tab style picker overlay.
- A toolbar button, popup, or settings UI of the extension's own.
- iOS/iPadOS Safari.
- Remembering pairs across Safari restarts.
- App Store submission assets (icons, privacy policy, screenshots). These come
  later; this design only keeps the structure compatible.
