# Last Tab — Cmd-Tab Style Tab Menu: Design

**Date:** 2026-11-06
**Status:** Approved in brainstorming, awaiting spec review
**Supersedes:** the command-based toggle in `2026-11-06-last-tab-safari-extension-design.md`, sections "Behavior → User-defined shortcut" and "Default shortcut". The rest of that spec (per-window scope, container app, build) still holds.

## Goal

Replace the toggle-only shortcut with a Cmd-Tab style switcher drawn inside the
web page: hold a modifier, tap a key to step through the window's tabs in
most-recently-used order, release the modifier to switch. It works like
TabBack for Safari.

## Spike findings (branch `spike/tab-menu`, throwaway)

- A content script on `<all_urls>` receives modifier+key keydown and the modifier keyup. An in-page overlay works.
- Safari never delivers Ctrl+Tab to the page, the same as for extension commands. Ctrl+Tab is not achievable.
- Content scripts do not run on the Start Page, in the address bar, or on Safari's internal pages. There the shortcut does nothing (accepted).
- Safari does not provide `tab.lastAccessed`. MRU order must come from our own tracking.
- Site access is granted once with Safari's "every website" + "Always Allow" prompt, the same as TabBack.

## Behavior

### Shortcut

- One user-chosen shortcut: **modifier + key**.
  - **Modifier:** one of Option, Control or Command.
  - **Key:** a letter A–Z, a digit 0–9, or one of `` ` `` `,` `.` `/` `;` `'` `[` `]` `-` `=`.
  - **Default:** Option+Q.
- **Reverse:** the same shortcut with Shift. It is assigned automatically and isn't configurable separately.
- Keys are matched by `KeyboardEvent.code` (for example `KeyQ`), so the shortcut still works when Option changes the typed character (Option+Q types "œ").
- Safari's own extension Shortcuts settings no longer apply. The manifest has no `commands`.

### Menu interaction

The list is the focused window's tabs in MRU order, with the current tab
first. Let the selection index be `i`.

| Input | Menu closed | Menu open |
|---|---|---|
| shortcut | Open. `i = 1` (the previous tab) | `i = i + 1`, wrapping to 0 |
| Shift + shortcut | Open. `i = last` (the oldest tab) | `i = i − 1`, wrapping to last |
| ← / → | — | `i − 1` / `i + 1`, wrapping |
| modifier released | — | Close and switch to tab `i` (no-op if `i = 0`) |
| Esc | — | Close, no switch |
| window blur / tab hidden | — | Close, no switch |

- With 1 tab: the shortcut does nothing and the menu doesn't open.
- **Quick tap.** If the modifier is released before the tab list arrives from the background, the press is remembered. When the list arrives, the switch to the selected index happens immediately, without drawing the menu. A quick Option+Q therefore toggles to the previous tab, as before.
- The shortcut keydown (and its repeats) gets `preventDefault()` + `stopImmediatePropagation()`, so it never types into the page. Arrows and Esc are consumed only while the menu is open.

### Menu appearance

- A horizontal strip of cards centered in the viewport, on a dark translucent panel above all page content.
- **Card:** a preview about 200×125 px, below it the favicon and a single-line truncated title. The selected card has an accent outline.
- **No preview:** the card shows a large favicon (or the first letter of the title) and the title.
- If the cards are wider than 90% of the viewport, the strip scrolls horizontally so the selected card stays visible.
- The menu is rendered in a closed shadow root attached to `document.documentElement`, so page styles don't leak in.

### Scope and limits

- Only the focused window's tabs, as in the existing design.
- The menu works only in the top frame of regular web pages. It does not work on the Start Page, in the address bar, on Safari's internal pages, or while focus is inside an iframe.
- **Permissions:** `tabs`, `storage`, `host_permissions: ["<all_urls>"]`. The container app tells the user to choose "Always Allow on Every Website".

## Architecture

### Background (classic scripts, in order)

1. **`mru.js` (pure).** Per-window MRU list.
   - State: `{ [windowId: string]: { order: number[] } }`, most recent first.
   - `emptyState()`
   - `onActivated(state, windowId, tabId)`: moves `tabId` to the front.
   - `onTabRemoved(state, windowId, tabId)`: removes it.
   - `onWindowRemoved(state, windowId)`
   - `orderFor(state, windowId): number[]`
   - Legacy entries `{current, previous}` read from storage are converted to `order: [current, previous]` with nulls dropped.
2. **`previews.js` (pure cache + capture policy).**
   - `createPreviewCache({ maxEntries = 50 })` returns `{ get(tabId), set(tabId, dataUrl), delete(tabId) }`.
   - When full, the least recently set entry is evicted.
   - The cache lives in memory only and is lost when the background unloads (accepted).
3. **`controller.js`.**
   - Listeners from the existing design: `tabs.onActivated`, `tabs.onRemoved`, `tabs.onDetached`, `windows.onRemoved`, the serialized event chain, `storage.session` persistence, seeding every window at startup.
   - The `commands` listener is removed.
   - **Capture after activation:** 300 ms after `tabs.onActivated`, call `tabs.captureVisibleTab(windowId, { format: 'jpeg', quality: 60 })`, but only if that tab is still active in that window.
   - **Capture after load:** 300 ms after `tabs.onUpdated` reports `status: 'complete'` for an active tab, capture the same way.
   - Captures are downscaled to 400 px wide via `createImageBitmap` + `OffscreenCanvas` and stored in the preview cache.
   - Capture failures are ignored (`console.debug`).
   - **`menu:list` message:**
     - Before answering, try one capture of the sender's tab, with a 150 ms budget.
     - Reply `{ tabs: [{ id, title, favIconUrl, preview }] }` for `orderFor(state, sender.tab.windowId)`.
     - The order is reconciled with `tabs.query({ windowId })`: unknown ids are dropped, and open tabs not yet in `order` are appended in tab-bar order.
   - **`menu:activate { tabId }` message:** calls `tabs.update(tabId, { active: true })`. A rejection is ignored.
4. **`background.js`:** the entry point. It calls `createController(browser)`.

### Content script (classic scripts, `<all_urls>`, `run_at: document_start`, top frame only)

1. **`shortcut.js` (pure).**
   - `DEFAULT_SHORTCUT = { modifier: 'alt', code: 'KeyQ' }`
   - `matches(event, shortcut): 'forward' | 'reverse' | null`. It requires the shortcut's modifier and no other modifier except Shift.
   - `isModifierRelease(event, shortcut): boolean`
   - `label(shortcut): string`, for example "⌥ Option + Q".
2. **`menu-state.js` (pure).**
   - `initial()`
   - `reduce(state, action) → { state, effects }`
   - **Actions:** `press{dir}`, `listLoaded{tabs}`, `arrow{dir}`, `release`, `escape`, `blur`.
   - **Effects:** `requestList`, `render`, `close`, `activate{tabId}`.
   - Phases: `closed` → `loading` (pressed, list not loaded yet; holds `pendingDir`, `released`) → `open`.
   - A release in `loading` sets `released = true`. On `listLoaded`, the state then goes straight to `activate` + `close`.
3. **`menu-view.js`.** `createMenuView()` returns `{ render(tabs, index), close() }`. It is the only file that touches the DOM.
4. **`content.js`.**
   - Loads the shortcut from `storage.local` (key `shortcut`) and reacts to `storage.onChanged`.
   - Registers `keydown`/`keyup` on `window` in the capture phase, plus `blur` and `visibilitychange`.
   - Turns events into actions and executes the effects through `runtime.sendMessage` and the view.

### Options page

- `options.html` + `options.js`, declared in the manifest as `options_ui`.
- A modifier dropdown (Option/Control/Command) and a key field that records the next key pressed (by `code`, limited to the allowed set).
- It shows the resulting forward and reverse shortcuts and saves to `storage.local` immediately.
- A pure helper is reused from `shortcut.js`: `isAllowedCode(code): boolean`.

### Container app

The Main.html instructions change to:
- how to use the menu;
- that the shortcut is changed in Safari → Settings → Extensions → Last Tab → Settings;
- that the extension needs "Always Allow on Every Website".

### Xcode project

Every new extension file is added to the "Last Tab Extension" target's resources, as before.

## Testing

- **Unit tests (`node --test`, no dependencies):**
  - **`mru`:**
    - Activation moves the tab to the front.
    - Re-activating the front tab is a no-op.
    - Closing removes the tab.
    - Windows are independent.
    - A window can be removed.
    - The legacy format is converted.
    - No function mutates its input.
  - **`previews`:**
    - get/set/delete work.
    - When full, the least recently set entry is evicted.
  - **`shortcut`:**
    - forward, reverse, a wrong modifier, an extra modifier, a non-matching code.
    - Modifier release is detected.
    - `isAllowedCode`.
    - `label`.
  - **`menu-state`:**
    - Press opens and selects 1.
    - Shift-press opens and selects the last tab.
    - Steps wrap in both directions.
    - Arrows step.
    - Release switches.
    - Release on index 0 doesn't switch.
    - Escape and blur close without switching.
    - A quick tap (release before `listLoaded`) switches to index 1.
    - A single tab never opens.
    - A press while `loading` adds a step once the list arrives.
  - **`controller` (fake browser):**
    - `menu:list` returns the MRU order with previews, reconciled with open tabs.
    - `menu:activate` calls `tabs.update`.
    - A capture is scheduled after activation, and skipped if the tab is no longer active.
    - All existing persistence, seeding and removal tests are kept and updated to the `order` format.
- **Manual checklist in Safari:**
  - The menu opens on a regular site.
  - Quick tap toggles.
  - Holding and stepping, and Shift-reverse, both work.
  - Arrows and Esc work.
  - Releasing switches.
  - Previews appear for visited tabs.
  - A tab without a preview shows the favicon and title.
  - There is no "œ" typed in text fields.
  - The menu closes when switching apps.
  - A custom shortcut from the options page works.
  - Two windows stay independent.
  - Nothing happens on the Start Page.

## Out of scope

- Ctrl+Tab (impossible, see the spike).
- A fallback on the Start Page or in the address bar.
- iframes.
- Cross-window switching.
- Persisting previews across background unloads.
- Closing tabs from the menu.
- Number-key jumps.
- Mouse selection of cards. The cards are display-only; clicking can come later.
- The rapid-press series without a menu (approved earlier, now superseded by the menu).
