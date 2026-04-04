#!/usr/bin/env bash
# Clears all Basalt caches and app config.
#
# Tier 1 — app config (last_vault, settings):  <app-data>/config.json
# Tier 2 — regeneratable caches:
#   - Vault metadata cache  (<app-cache>/<hash>.json)
#   - Tantivy search index  (<app-cache>/search_<hash>/)
#
# After running: app will show the vault picker on next launch.
# Does NOT touch vault/.basalt/ (Tier 3 — per-vault workspace state).

set -euo pipefail

APP_ID="com.basalt.app"

# Resolve platform-specific Tauri app directories.
case "$(uname -s)" in
  Darwin)
    CACHE_DIR="$HOME/Library/Caches/$APP_ID"
    DATA_DIR="$HOME/Library/Application Support/$APP_ID"
    ;;
  Linux)
    CACHE_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/$APP_ID"
    DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/$APP_ID"
    ;;
  MINGW*|MSYS*|CYGWIN*)
    CACHE_DIR="${LOCALAPPDATA}/$APP_ID/cache"
    DATA_DIR="${LOCALAPPDATA}/$APP_ID/data"
    ;;
  *)
    echo "Unsupported platform: $(uname -s)" >&2
    exit 1
    ;;
esac

REMOVED=0

# ── Tier 1: app config ───────────────────────────────────────────────────────
CONFIG_FILE="$DATA_DIR/config.json"
if [[ -f "$CONFIG_FILE" ]]; then
  echo "  Removing app config: config.json (last_vault, settings)"
  rm -f "$CONFIG_FILE"
  ((REMOVED++))
fi

# ── Tier 2: vault metadata cache ─────────────────────────────────────────────
if [[ -d "$CACHE_DIR" ]]; then
  while IFS= read -r -d '' f; do
    echo "  Removing vault cache: $(basename "$f")"
    rm -f "$f"
    ((REMOVED++))
  done < <(find "$CACHE_DIR" -maxdepth 1 -name '*.json' -print0)

  # ── Tier 2: tantivy search index ───────────────────────────────────────────
  while IFS= read -r -d '' d; do
    echo "  Removing search index: $(basename "$d")"
    rm -rf "$d"
    ((REMOVED++))
  done < <(find "$CACHE_DIR" -maxdepth 1 -type d -name 'search_*' -print0)
fi

if [[ $REMOVED -eq 0 ]]; then
  echo "Nothing to clear — already clean."
else
  echo "Done. Removed $REMOVED item(s). App will show vault picker on next launch."
fi
