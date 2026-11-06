# Last Tab for Safari

A macOS Safari extension that switches to the previously active tab in the
current window. Press the shortcut once to jump to the last used tab, and
press it again to go back, like a quick Cmd-Tab for apps.

- Default shortcut: **Option+Q**. Safari doesn't allow Tab in an extension's
  default shortcut and keeps Ctrl+Tab for itself.
- To change the shortcut: Safari → Settings → Extensions → Last Tab →
  Shortcuts (Safari 26+).
- Each window has its own pair of tabs.
- No access to websites. The only permission is `storage`.

## Project layout

- `src/`: TypeScript sources (`background/`, `shared/`). They are bundled by esbuild
  (`scripts/build.mjs`) into `dist/`.
- `static/`: `manifest.json` and icons, copied into `dist/` as they are.
- `dist/`: the build output that Xcode packages. It is git-ignored.
- `Last Tab/`: the Xcode container app. The "Build Web Extension" phase of the extension target runs
  `scripts/xcode-build-extension.sh` (`npm ci` if needed, then `npm run build`), so building in
  Xcode always packages fresh code.

## Build

```bash
npm install
xcodebuild -project "Last Tab/Last Tab.xcodeproj" -scheme "Last Tab" -configuration Debug -derivedDataPath build build
open "build/Build/Products/Debug/Last Tab.app"
```

The Debug build is signed ad hoc. In Safari → Settings → Developer, turn on
**Allow unsigned extensions**. This resets every time Safari quits. Then
enable Last Tab in Settings → Extensions. To avoid the reset, choose your
Personal Team under Xcode → target → Signing & Capabilities.

## Test

```bash
npm test
```

This runs a strict type check (`tsc --noEmit`) and then the `node:test` suites in `tests/` through `tsx`.

## Manual checklist

- [ ] Normal page: A → B, shortcut → A, shortcut → B.
- [ ] Works from the Start Page, with focus in the address bar, and on an empty tab.
- [ ] Private window (after allowing the extension there): the toggle works.
- [ ] Two windows: each toggles its own pair; the shortcut never jumps windows.
- [ ] Close the previous tab: the shortcut does nothing.
- [ ] Quit and relaunch Safari: no errors in Develop → Web Extension Background Content; the shortcut does nothing until you switch tabs once.
- [ ] Change the shortcut in Safari's settings: the new one works.
- [ ] Safari never asks for website access.
