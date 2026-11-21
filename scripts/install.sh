#!/bin/bash
# Installs the latest Last Tab release into /Applications (or $INSTALL_DIR) and opens it.
#   curl -fsSL https://raw.githubusercontent.com/bi472/last-tab-safari/main/scripts/install.sh | bash
set -euo pipefail

REPO="bi472/last-tab-safari"
APP="Last Tab.app"
INSTALL_DIR="${INSTALL_DIR:-/Applications}"
DEST="$INSTALL_DIR/$APP"

echo "→ Looking up the latest release…"
URL=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
  | grep -o '"browser_download_url": *"[^"]*LastTab-[^"]*\.zip"' \
  | head -n 1 | sed 's/.*"\(https[^"]*\)"/\1/')
if [ -z "$URL" ]; then
  echo "✗ Couldn't find a LastTab-*.zip in the latest release of $REPO." >&2
  exit 1
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

echo "→ Downloading $(basename "$URL")…"
curl -fL --progress-bar "$URL" -o "$TMP/LastTab.zip"
ditto -x -k "$TMP/LastTab.zip" "$TMP"

if pgrep -xq "Last Tab"; then
  echo "→ Quitting the running Last Tab…"
  osascript -e 'quit app "Last Tab"' || true
  sleep 1
fi

echo "→ Installing to $DEST…"
SUDO=""
[ -w "$INSTALL_DIR" ] || SUDO="sudo"
$SUDO rm -rf "$DEST"
$SUDO ditto "$TMP/$APP" "$DEST"
$SUDO xattr -dr com.apple.quarantine "$DEST" 2>/dev/null || true

open "$DEST"
cat <<'EOF2'

✓ Last Tab is installed. Its setup window walks you through the rest:
  turn on the extension in Safari and allow it on other websites.
EOF2
