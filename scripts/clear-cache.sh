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

# Resolve the real bundle identifier from tauri.conf.json so this never drifts
# out of sync with the on-disk folder Tauri uses. It previously hardcoded
# "com.basalt.app" after the identifier became "com.basalt.desktop", which
# silently deleted the wrong directory and left last_vault set (vault picker
# never appeared). Derived at runtime to prevent recurrence.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONF_FILE="$SCRIPT_DIR/../apps/tauri/src-tauri/tauri.conf.json"
APP_ID="$(grep -m1 '"identifier"' "$CONF_FILE" 2>/dev/null | sed -E 's/.*"identifier"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/' || true)"
if [[ -z "$APP_ID" ]]; then
  echo "warning: could not read identifier from $CONF_FILE; falling back to com.basalt.desktop" >&2
  APP_ID="com.basalt.desktop"
fi

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

# ── Legacy cleanup ────────────────────────────────────────────────────────────
# Remove data/cache left under the old "com.basalt.app" id so stale files from
# prior (buggy) runs don't linger after the identifier became "com.basalt.desktop".
LEGACY_ID="com.basalt.app"
for D in "$DATA_DIR/../$LEGACY_ID" "$CACHE_DIR/../$LEGACY_ID"; do
  if [[ -d "$D" ]]; then
    echo "  Removing legacy app dir: $D"
    rm -rf "$D"
    REMOVED=$((REMOVED+1))
  fi
done

# ── Tier 1: app config ───────────────────────────────────────────────────────
CONFIG_FILE="$DATA_DIR/config.json"
if [[ -f "$CONFIG_FILE" ]]; then
  echo "  Removing app config: config.json (last_vault, settings)"
  rm -f "$CONFIG_FILE"
  REMOVED=$((REMOVED+1))
fi

# ── Tier 2: vault metadata cache ─────────────────────────────────────────────
if [[ -d "$CACHE_DIR" ]]; then
  while IFS= read -r -d '' f; do
    echo "  Removing vault cache: $(basename "$f")"
    rm -f "$f"
    REMOVED=$((REMOVED+1))
  done < <(find "$CACHE_DIR" -maxdepth 1 -name '*.json' -print0)

  # ── Tier 2: tantivy search index ───────────────────────────────────────────
  while IFS= read -r -d '' d; do
    echo "  Removing search index: $(basename "$d")"
    rm -rf "$d"
    REMOVED=$((REMOVED+1))
  done < <(find "$CACHE_DIR" -maxdepth 1 -type d -name 'search_*' -print0)
fi

if [[ $REMOVED -eq 0 ]]; then
  echo "Nothing to clear — already clean."
else
  echo "Done. Removed $REMOVED item(s). App will show vault picker on next launch."
fi
