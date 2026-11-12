# Last Tab for Safari

A Cmd-Tab style tab switcher for Safari on macOS. Hold **⌥ Option** and press **Q**:
a horizontal strip of the current window's tabs appears in most-recently-used
order, with page previews. Keep pressing **Q** to move right, add **⇧ Shift** to
move left (arrows work too), and release **⌥ Option** to switch. **Esc** cancels.
A quick Option+Q tap jumps straight back to the previous tab.

- The shortcut can be changed in Safari → Settings → Extensions → Last Tab → Settings
  (Option or Control plus a letter, digit or punctuation key; Command is excluded because Safari owns ⌘ shortcuts). Shift reverses automatically.
- Ctrl+Tab is not possible: Safari keeps it for itself and never passes it to extensions or pages.
- The switcher runs inside web pages, so it needs **Always Allow on Every Website**. It doesn't work on the
  Start Page, in the address bar, on Safari's own pages, or while focus is inside an iframe.
- Each window has its own history. Previews are kept in memory only and never leave your Mac.

## Project layout

- `src/`: TypeScript sources: `background/` (MRU order, previews, messages), `content/` (shortcut,
  menu state machine, menu view), `options/` (settings page), `shared/` (message types, storage keys). They are bundled by esbuild
  (`scripts/build.mjs`) into `dist/`.
- `static/`: `manifest.json`, `options.html` and icons, copied into `dist/` as they are.
- `dist/`: the build output that Xcode packages. It is git-ignored.
- `Last Tab/`: the Xcode container app. The "Build Web Extension" phase of the extension target runs
  `scripts/xcode-build-extension.sh` (`npm ci` if needed, then `npm run build`), so building in
  Xcode always packages fresh code.

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

## Icons

All icons (app icon set, extension icons, toolbar glyph) are drawn in code:
`swift scripts/icons.swift` from the repo root rewrites the PNGs. Commit the results.

## Test

```bash
npm test
```

This runs a strict type check (`tsc --noEmit`) and then the `node:test` suites in `tests/` through `tsx`.

## Manual checklist

- [ ] The menu opens on a regular site; a quick Option+Q tap toggles to the previous tab.
- [ ] Hold and step forward, Shift steps back, arrows move, Esc cancels, releasing switches.
- [ ] Visited tabs show previews; a tab without a preview shows its favicon and title.
- [ ] No "œ" is typed into a focused text field.
- [ ] The menu closes when you switch to another app.
- [ ] A custom shortcut set on the options page works, including its Shift reverse.
- [ ] Two windows keep independent histories.
- [ ] Nothing happens on the Start Page.
- [ ] A tab titled `<b>x</b>` shows the text literally.
