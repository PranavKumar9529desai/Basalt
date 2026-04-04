#!/usr/bin/env bash
# Clears all regeneratable Basalt caches:
#   - Vault metadata cache  (<app-cache>/<hash>.json)
#   - Tantivy search index  (<app-cache>/search_<hash>/)
#
# Safe to run at any time — caches rebuild automatically on next app launch.
# Does NOT touch config.json (Tier 1) or vault/.basalt/ (Tier 3).

set -euo pipefail

APP_ID="com.basalt.app"

# Resolve platform-specific Tauri app cache directory.
case "$(uname -s)" in
  Darwin)
    CACHE_DIR="$HOME/Library/Caches/$APP_ID"
    ;;
  Linux)
    CACHE_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/$APP_ID"
    ;;
  MINGW*|MSYS*|CYGWIN*)
    CACHE_DIR="${LOCALAPPDATA}/$APP_ID/cache"
    ;;
  *)
    echo "Unsupported platform: $(uname -s)" >&2
    exit 1
    ;;
esac

if [[ ! -d "$CACHE_DIR" ]]; then
  echo "Cache directory not found (nothing to clear): $CACHE_DIR"
  exit 0
fi

echo "Cache directory: $CACHE_DIR"

REMOVED=0

# Remove vault metadata cache files (<hash>.json)
while IFS= read -r -d '' f; do
  echo "  Removing vault cache: $(basename "$f")"
  rm -f "$f"
  ((REMOVED++))
done < <(find "$CACHE_DIR" -maxdepth 1 -name '*.json' -print0)

# Remove tantivy search index directories (search_<hash>/)
while IFS= read -r -d '' d; do
  echo "  Removing search index: $(basename "$d")"
  rm -rf "$d"
  ((REMOVED++))
done < <(find "$CACHE_DIR" -maxdepth 1 -type d -name 'search_*' -print0)

if [[ $REMOVED -eq 0 ]]; then
  echo "Nothing to clear — cache is already empty."
else
  echo "Done. Removed $REMOVED item(s). Caches will rebuild on next launch."
fi
