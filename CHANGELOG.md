# Changelog

Versions follow [semver](https://semver.org): patch for fixes, minor for new features,
major for changes that break existing behaviour (for example, the default shortcut).

## 2.1.0 — 2026-11-22

- Setup window is now a checklist that ticks itself off: extension on, allowed on other websites,
  open at login. It shows your current shortcut and opens from the menu bar or `lasttab://setup`.
- One-command install and update: `scripts/install.sh` (see README).
- Fixed: Xcode builds could package the previous build's extension scripts.

## 2.0.0 — 2026-11-22

- The strip is now drawn by the Last Tab menu bar app, so the same shortcut works everywhere in Safari:
  the Start Page, Safari's own pages and the address bar included. The in-page menu is gone.
- Any shortcut with ⌘ Command, ⌥ Option or ⌃ Control, recorded in one click in the toolbar popup.
- A separate Back shortcut: Forward + ⇧ Shift by default, or one of its own.
- The popup warns when a shortcut would override a Safari one, and when the app isn't running.
- Previews are cached on disk for the app (on this Mac only) and erased when tabs close or Safari quits.
- Shorter setup window; the icon is no longer cut off.

## 1.1.0 — 2026-11-12

- App icon and extension icons.
- Toolbar button: opens the shortcut settings in a popup.
- Settings: clicking elsewhere cancels key recording; save errors are shown.

## 1.0.0 — 2026-11-10

- Cmd-Tab style tab menu: hold ⌥ Option and press Q to step through tabs in
  most-recently-used order, ⇧ Shift to step back, release to switch.
- Page previews, arrow keys, Esc.
- Shortcut settings page (Option or Control + key).
