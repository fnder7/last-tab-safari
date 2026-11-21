# Last Tab for Safari

A Cmd-Tab style tab switcher for Safari on macOS. Hold **⌥ Option** and press **Q**:
a horizontal strip of the current window's tabs appears in most-recently-used
order, with page previews. Keep pressing **Q** to move right, add **⇧ Shift** to
move left (arrows work too), and release **⌥ Option** to switch. **Esc** cancels.
A quick Option+Q tap jumps straight back to the previous tab.

It works everywhere in Safari: on websites, the Start Page, Safari's own pages and in the address bar.

- Last Tab is a menu bar app plus a Safari extension. Keep the app running (menu bar → Open at Login);
  it catches the shortcut while Safari is active and draws the strip. The extension tracks tab order
  and previews.
- Change the shortcut in the Last Tab popup on Safari's toolbar (or Safari → Settings → Extensions →
  Last Tab → Settings): click **Forward** and press any shortcut with ⌘ Command, ⌥ Option or ⌃ Control.
  **Back** follows Forward + ⇧ Shift until you record a shortcut of its own.
- While Safari is active the shortcut belongs to Last Tab: if it was a Safari shortcut too (the popup
  warns), Safari's version stops working, and an ⌥ shortcut no longer types its character (⌥Q: «œ»).
- Ctrl+Tab is not possible: Safari keeps it for itself.
- Each window has its own history. Private windows are left out. Previews stay on this Mac in the app's
  cache and are erased when their tabs close or Safari quits.

## Project layout

- `src/`: TypeScript sources of the extension: `background/` (MRU order, previews, the native bridge
  to the app), `options/` (settings popup), `shared/` (shortcut model, native message types, storage
  keys). They are bundled by esbuild (`scripts/build.mjs`) into `dist/`.
- `static/`: `manifest.json`, `options.html` and icons, copied into `dist/` as they are.
- `dist/`: the build output that Xcode packages. It is git-ignored.
- `Last Tab/`: the Xcode project.
  - `Last Tab/App/`: the menu bar app: shortcuts (Carbon hot keys), the strip panel, switching.
  - `Last Tab/Core/`: logic shared by the app and the extension handler (shortcut model, menu state
    machine, App Group storage), a Swift package so `swift test` can run it.
  - `Last Tab/Last Tab Extension/`: the native handler that stores what the extension sends in the
    App Group and notifies the app.
  - The "Build Web Extension" phase of the extension target runs `scripts/xcode-build-extension.sh`
    (`npm ci` if needed, then `npm run build`), so building in Xcode always packages fresh code.

## Build

```bash
npm install
xcodebuild -project "Last Tab/Last Tab.xcodeproj" -scheme "Last Tab" -configuration Debug -derivedDataPath build -allowProvisioningUpdates build
open "build/Build/Products/Debug/Last Tab.app"
```

The project is signed with a Personal Team (`DEVELOPMENT_TEAM` in the Xcode project). Pass
`-allowProvisioningUpdates` to `xcodebuild` the first time so Xcode can create the certificate and profile.
A stable signature lets Safari remember the extension and its website access between builds, so
"Allow unsigned extensions" is not needed. To build with a different Apple ID, pick your own team under
Xcode → target → Signing & Capabilities for both targets.

## Versions

`package.json` holds the version; `CHANGELOG.md` lists what changed. To release:

1. `npm run set-version -- 1.2.0` — writes it to the manifest and the Xcode project
   and bumps the build number (a test fails if these drift apart).
2. Add a section to `CHANGELOG.md`, commit, then `git tag v1.2.0`.
3. Build Release and zip it as `release/LastTab-1.2.0.zip`.

## Icons

All icons (app icon set, extension icons, toolbar glyph) are drawn in code:
`swift scripts/icons.swift` from the repo root rewrites the PNGs. Commit the results.

## Test

```bash
npm test
npm run test:native
```

`npm test` runs a strict type check (`tsc --noEmit`) and the `node:test` suites in `tests/` through `tsx`.
`npm run test:native` runs the Swift tests of `Last Tab/Core`.

## Manual checklist

- [ ] With the app running, the strip opens on a regular site, on the Start Page and with focus in the
      address bar; a quick tap toggles to the previous tab without the strip flashing.
- [ ] Hold and step forward, Shift (or the Back shortcut) steps back, arrows move, Esc cancels,
      releasing switches.
- [ ] Visited tabs show previews; a tab without a preview shows its favicon or first letter.
- [ ] The strip closes when you switch to another app; the shortcut types normally in other apps.
- [ ] A shortcut recorded in the popup (for example ⌃⌥E) works at once; Back follows it with ⇧ until set
      on its own, and "Same as forward + ⇧" brings that back.
- [ ] Two windows keep independent histories; private windows don't appear.
- [ ] Quitting the app shows "Last Tab app isn't running" in the popup.
- [ ] A tab titled `<b>x</b>` shows the text literally.
