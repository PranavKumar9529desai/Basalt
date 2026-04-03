#!/usr/bin/env bash
# Regenerates the ADR index block in CLAUDE.md from files in docs/adr/.
# Called automatically by a Claude Code PostToolUse hook when any docs/adr/*.md file is written.

set -euo pipefail

PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
CLAUDE_MD="$PROJECT_ROOT/CLAUDE.md"
ADR_DIR="$PROJECT_ROOT/docs/adr"
TMP_BLOCK=$(mktemp)
TMP_CLAUDE=$(mktemp)
trap 'rm -f "$TMP_BLOCK" "$TMP_CLAUDE"' EXIT

[[ -f "$CLAUDE_MD" ]] || { echo "CLAUDE.md not found"; exit 0; }
[[ -d "$ADR_DIR" ]]   || { echo "docs/adr/ not found"; exit 0; }

# Build the replacement block between markers
{
  echo "<!-- ADR_INDEX_START -->"
  echo "| File | Decision |"
  echo "|---|---|"
  for f in "$ADR_DIR"/[0-9][0-9][0-9]-*.md; do
    [[ -f "$f" ]] || continue
    base=$(basename "$f")
    title=$(head -1 "$f" | sed 's/^# //')
    echo "| [${base%.md}](docs/adr/$base) | $title |"
  done
  echo "<!-- ADR_INDEX_END -->"
} > "$TMP_BLOCK"

# Replace the section between markers in CLAUDE.md
awk -v block="$TMP_BLOCK" '
  /<!-- ADR_INDEX_START -->/ {
    in_block = 1
    while ((getline line < block) > 0) print line
    next
  }
  /<!-- ADR_INDEX_END -->/ { in_block = 0; next }
  !in_block { print }
' "$CLAUDE_MD" > "$TMP_CLAUDE" && mv "$TMP_CLAUDE" "$CLAUDE_MD"

echo "ADR index synced in CLAUDE.md"
