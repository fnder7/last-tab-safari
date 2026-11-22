# Contributing to Last Tab

Thanks for helping out! Bug reports, ideas and pull requests are all welcome.

- **Found a bug?** [Open an issue](../../issues/new/choose) with your macOS and Safari versions and
  the steps to reproduce it.
- **Have an idea?** Open a feature request first, so we can agree on it before you write code.
- **Sending a PR?** Keep it focused on one change, run the tests and add a line to
  [`CHANGELOG.md`](CHANGELOG.md) if users will notice it.

## Build from source

Requirements: Xcode and Node.js with npm. The app runs on macOS 14 Sonoma or later.

```bash
npm install
scripts/dev-install.sh
```

The script builds Debug into `build/`, installs the app into `/Applications` (set `INSTALL_DIR` to
change that, `CONFIGURATION=Release` for a release build) and opens it. Then it unregisters and
deletes the build copy. Keep only one copy of Last Tab on the Mac: Xcode registers every app it
builds with Launch Services, and Safari then runs the extension once per registered copy. The
copies get their own tab ids and storage but share the app's App Group, so they overwrite each
other's tab list and previews. The script warns when it finds another registered copy. If you run
the app from Xcode or from `build/`, remove the `/Applications` copy first.

The project is signed with a Personal Team (`DEVELOPMENT_TEAM` in the Xcode project). To build with
your own Apple ID, pick your team under Xcode → target → **Signing & Capabilities** for both targets.
Pass `-allowProvisioningUpdates` the first time so Xcode can create the certificate and profile. A
stable signature lets Safari remember the extension and its website access between builds, so
"Allow unsigned extensions" is not needed.

## Project layout

```
src/                     TypeScript sources of the extension (bundled by esbuild into dist/)
  background/            MRU order, previews, native bridge to the app
  options/               settings popup and shortcut recorder
  shared/                shortcut model, native message types, storage keys
static/                  manifest.json, options.html and icons, copied into dist/ as is
tests/                   node:test suites
scripts/                 build, versioning, icon generation and the installer
Last Tab/                Xcode project
  App/                   menu bar app: Carbon hot keys, strip panel, switching
  Core/                  Swift package shared by the app and the extension handler
                         (shortcut model, menu state machine, App Group storage)
  Last Tab Extension/    native handler: stores extension messages in the App Group, notifies the app
```

`dist/` is the build output that Xcode packages; it is git-ignored. The extension target's
"Build Web Extension" phase runs `scripts/xcode-build-extension.sh` (`npm ci` if needed, then
`npm run build`), so every Xcode build packages fresh code.

## Tests

```bash
npm test
```

```bash
npm run test:native
```

`npm test` runs a strict type check (`tsc --noEmit`) and the `node:test` suites in `tests/` through
`tsx`. `npm run test:native` runs the Swift tests of `Last Tab/Core`. CI runs both on every push and
pull request.

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

## Versions and releases

`package.json` holds the version; [`CHANGELOG.md`](CHANGELOG.md) lists what changed. To release:

1. `npm run set-version -- 1.2.0` writes the version to the manifest and the Xcode project and bumps
   the build number (a test fails if these drift apart).
2. Add a section to `CHANGELOG.md`, commit, then `git tag v1.2.0`.
3. Build Release, zip it as `release/LastTab-1.2.0.zip` and attach it to a GitHub release:
   `scripts/install.sh` installs the first `LastTab-*.zip` of the latest release.

## Icons

All icons (app icon set, extension icons, toolbar glyph) are drawn in code:
`swift scripts/icons.swift` from the repo root rewrites the PNGs. Commit the results.
