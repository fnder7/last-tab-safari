#!/bin/bash
# Builds Last Tab from source and installs it into /Applications (or $INSTALL_DIR), leaving no
# second copy behind.
#
# Xcode registers every app it builds with Launch Services. Safari then loads the extension from
# each registered copy: two instances with their own tab ids and storage write to the same App
# Group, and the one without previews keeps overwriting the other (previews vanish on every
# return to Safari). So the build product is unregistered and deleted once installed.
set -euo pipefail
cd "$(dirname "$0")/.."

CONFIGURATION="${CONFIGURATION:-Debug}"
INSTALL_DIR="${INSTALL_DIR:-/Applications}"
APP="Last Tab.app"
BUILT="build/Build/Products/$CONFIGURATION/$APP"
DEST="$INSTALL_DIR/$APP"
LSREGISTER=/System/Library/Frameworks/CoreServices.framework/Versions/Current/Frameworks/LaunchServices.framework/Versions/Current/Support/lsregister

echo "→ Building $CONFIGURATION…"
xcodebuild -project "Last Tab/Last Tab.xcodeproj" -scheme "Last Tab" -configuration "$CONFIGURATION" \
  -derivedDataPath build -allowProvisioningUpdates -quiet build

if pgrep -xq "Last Tab"; then
  echo "→ Quitting the running Last Tab…"
  osascript -e 'quit app "Last Tab"' || true
  sleep 1
fi

echo "→ Installing to $DEST…"
SUDO=""
[ -w "$INSTALL_DIR" ] || SUDO="sudo"
$SUDO rm -rf "$DEST"
$SUDO ditto "$BUILT" "$DEST"

echo "→ Removing the build copy so Safari loads the extension only once…"
EXTENSION="build/Build/Products/$CONFIGURATION/Last Tab Extension.appex"
"$LSREGISTER" -u "$BUILT" || true
"$LSREGISTER" -u "$EXTENSION" 2>/dev/null || true
rm -rf "$BUILT" "$EXTENSION"
"$LSREGISTER" -f "$DEST"

others=$("$LSREGISTER" -dump 2>/dev/null | sed -n 's/^path: *\(.*\/Last Tab\.app\) (0x[0-9a-f]*)$/\1/p' | sort -u | grep -vxF "$DEST" || true)
if [ -n "$others" ]; then
  echo "⚠ Other copies of Last Tab are still registered; Safari may load the extension twice:" >&2
  echo "$others" | sed 's/^/    /' >&2
  echo "  Delete them, or unregister with: $LSREGISTER -u <path>" >&2
fi

open "$DEST"
echo "✓ Installed $DEST"
