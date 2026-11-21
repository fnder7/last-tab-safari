<p align="center">
  <img src="Last Tab/Last Tab/Assets.xcassets/AppIcon.appiconset/mac-icon-128@2x.png" width="128" height="128" alt="Last Tab icon">
</p>

<h1 align="center">Last Tab for Safari</h1>

<p align="center">
  A <b>⌘ Tab</b>-style tab switcher for Safari on macOS.<br>
  Tabs in most-recently-used order, with page previews, everywhere in Safari.
</p>

<p align="center">
  <img alt="macOS 14+" src="https://img.shields.io/badge/macOS-14%2B-000?logo=apple">
  <img alt="Safari" src="https://img.shields.io/badge/Safari-Web%20Extension-1E90FF?logo=safari&logoColor=white">
  <img alt="Version" src="https://img.shields.io/badge/version-2.0.0-blue">
  <img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-green">
</p>

---

## How it works

Hold **⌥ Option** and press **Q**: a horizontal strip of the current window's tabs appears in
most-recently-used order, with page previews.

| Action | Keys |
| --- | --- |
| Open the strip / step right | **⌥ Q** (keep holding ⌥, press **Q** again) |
| Step left | **⌥ ⇧ Q** or **←** |
| Step right | **→** |
| Switch to the selected tab | release **⌥ Option** |
| Cancel | **Esc** |
| Jump back to the previous tab | a quick **⌥ Q** tap |

It works everywhere in Safari: on websites, the Start Page, Safari's own pages and in the address bar.

## Features

- **MRU order per window.** Each window keeps its own history; private windows are left out.
- **Page previews.** Visited tabs show a snapshot; others show their favicon or first letter.
- **Any shortcut.** Record any combination with ⌘ Command, ⌥ Option or ⌃ Control in one click.
  **Back** follows Forward + ⇧ Shift until you give it a shortcut of its own.
- **Conflict warnings.** The popup tells you when a shortcut overrides a Safari one, and when the
  Last Tab app isn't running.
- **Private by design.** Previews stay on this Mac in the app's cache and are erased when their tabs
  close or Safari quits. Nothing is sent anywhere.

## Install

Paste this into Terminal:

```bash
curl -fsSL https://raw.githubusercontent.com/bi472/last-tab-safari/main/scripts/install.sh | bash
```

It downloads the latest release into `/Applications`, clears the download quarantine and opens
Last Tab. The same command updates an existing install.

A setup window then walks you through the rest and ticks each step off as you do it:

1. **Turn on the extension** in Safari → Settings → Extensions.
2. **Allow it on every website** (Edit Websites… → For other websites: **Allow**) for page previews.
3. **Open at login**, so the shortcut keeps working after a restart.

Then hold **⌥ Option** in Safari and press **Q**. The setup window is always one click away:
menu bar icon → **Setup Instructions…**

<details>
<summary>Install by hand</summary>

1. Download `LastTab-<version>.zip` from [Releases](../../releases/latest) and double-click it.
2. Drag **Last Tab.app** into **Applications**.
3. The app isn't notarized, so macOS blocks the first launch. Run once:

   ```bash
   xattr -dr com.apple.quarantine "/Applications/Last Tab.app"
   ```

   (Or open it, then System Settings → Privacy & Security → **Open Anyway**.)
4. Open **Last Tab** and follow the setup window.

</details>

If Safari doesn't list the extension, turn on Safari → Settings → Advanced → *Show features for web
developers*, then Develop → **Allow Unsigned Extensions**.

## How the pieces fit

Last Tab is two parts that work together:

1. **The menu bar app** catches the shortcut while Safari is active and draws the strip.
2. **The Safari extension** tracks tab order and previews.

To change the shortcut, click the Last Tab button on Safari's toolbar (or Safari → Settings →
Extensions → Last Tab → Settings), click **Forward** and press the new combination.

### Good to know

- While Safari is active the shortcut belongs to Last Tab. If it was a Safari shortcut too, Safari's
  version stops working, and an ⌥ shortcut no longer types its character (⌥ Q: «œ»).
- **⌃ Tab** can't be used: Safari keeps it for itself.
- Safari → Settings → Extensions → Last Tab shows a red error: *Invalid `persistent` manifest entry*.
  You can ignore it: the manifest asks Safari to keep the extension's background script running so
  the shortcut responds on the first press, and Safari only complains about the format of that request.
- The **Shortcuts** field on the same page is Safari's own: it opens the Last Tab toolbar popup.
  It is not the switcher shortcut, which you change in the popup itself.

## Build from source

Requirements: Xcode and Node.js with npm. The app runs on macOS 14 Sonoma or later.

```bash
npm install
xcodebuild -project "Last Tab/Last Tab.xcodeproj" -scheme "Last Tab" -configuration Debug \
  -derivedDataPath build -allowProvisioningUpdates build
open "build/Build/Products/Debug/Last Tab.app"
```

The project is signed with a Personal Team (`DEVELOPMENT_TEAM` in the Xcode project). Pass
`-allowProvisioningUpdates` the first time so Xcode can create the certificate and profile. A stable
signature lets Safari remember the extension and its website access between builds, so
"Allow unsigned extensions" is not needed.

To build with your own Apple ID, pick your team under Xcode → target → **Signing & Capabilities** for
both targets.

## Project layout

```
src/                     TypeScript sources of the extension (bundled by esbuild into dist/)
  background/            MRU order, previews, native bridge to the app
  options/               settings popup and shortcut recorder
  shared/                shortcut model, native message types, storage keys
static/                  manifest.json, options.html and icons, copied into dist/ as is
tests/                   node:test suites
scripts/                 build, versioning and icon generation
Last Tab/                Xcode project
  App/                   menu bar app: Carbon hot keys, strip panel, switching
  Core/                  Swift package shared by the app and the extension handler
                         (shortcut model, menu state machine, App Group storage)
  Last Tab Extension/    native handler: stores extension messages in the App Group, notifies the app
```

`dist/` is the build output that Xcode packages; it is git-ignored. The extension target's
"Build Web Extension" phase runs `scripts/xcode-build-extension.sh` (`npm ci` if needed, then
`npm run build`), so every Xcode build packages fresh code.

## Development

### Tests

```bash
npm test
```

```bash
npm run test:native
```

`npm test` runs a strict type check (`tsc --noEmit`) and the `node:test` suites in `tests/` through
`tsx`. `npm run test:native` runs the Swift tests of `Last Tab/Core`.

### Versions and releases

`package.json` holds the version; [`CHANGELOG.md`](CHANGELOG.md) lists what changed. To release:

1. `npm run set-version -- 1.2.0` writes the version to the manifest and the Xcode project and bumps
   the build number (a test fails if these drift apart).
2. Add a section to `CHANGELOG.md`, commit, then `git tag v1.2.0`.
3. Build Release, zip it as `release/LastTab-1.2.0.zip` and attach it to a GitHub release:
   `scripts/install.sh` installs the first `LastTab-*.zip` of the latest release.

### Icons

All icons (app icon set, extension icons, toolbar glyph) are drawn in code:
`swift scripts/icons.swift` from the repo root rewrites the PNGs. Commit the results.

### Manual checklist

- [ ] With the app running, the strip opens on a regular site, on the Start Page and with focus in the
      address bar; a quick tap toggles to the previous tab without the strip flashing.
- [ ] Hold and step forward, Shift (or the Back shortcut) steps back, arrows move, Esc cancels,
      releasing switches.
- [ ] Visited tabs show previews; a tab without a preview shows its favicon or first letter.
- [ ] The strip closes when you switch to another app; the shortcut types normally in other apps.
- [ ] A shortcut recorded in the popup (for example ⌃⌥E) works at once; Back follows it with ⇧ until
      set on its own, and "Same as forward + ⇧" brings that back.
- [ ] Two windows keep independent histories; private windows don't appear.
- [ ] Quitting the app shows "Last Tab app isn't running" in the popup.
- [ ] A tab titled `<b>x</b>` shows the text literally.

## License

[MIT](LICENSE) © 2026 Aidar Idrisov
