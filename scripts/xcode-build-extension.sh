#!/bin/bash
# Xcode "Build Web Extension" phase: bundles src/ into dist/ before resources are copied.
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v node >/dev/null 2>&1; then
  export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
  if ! command -v node >/dev/null 2>&1 && [ -s "$HOME/.nvm/nvm.sh" ]; then
    set +u
    # shellcheck disable=SC1091
    . "$HOME/.nvm/nvm.sh"
    set -u
  fi
fi

[ -d node_modules ] || npm ci
npm run build
