#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# merge-tree — merge a worktree branch into main and clean up.
#
# Usage:
#   ./scripts/merge-tree.sh <task-name> [--delete-worktree]
#
# Examples:
#   ./scripts/merge-tree.sh editor-slash-commands
#   ./scripts/merge-tree.sh vault-refactor --delete-worktree
#
# What it does:
#   1. Checks that the worktree branch is ahead of main (has commits)
#   2. Checks for merge conflicts with a dry-run
#   3. Merges the branch into main (fast-forward if possible)
#   4. Optionally removes the worktree and branch
# ---------------------------------------------------------------------------

set -euo pipefail

TASK_NAME="${1:?Usage: merge-tree.sh <task-name> [--delete-worktree]}"
BRANCH_NAME="$TASK_NAME"
WORKTREE_PATH="../.worktrees/basalt-$TASK_NAME"
DELETE="${2:-}"

echo "⟳ Fetching origin..."
git fetch origin "$BRANCH_NAME" 2>/dev/null || true

# Check branch exists
if ! git show-ref --verify "refs/heads/$BRANCH_NAME" >/dev/null 2>&1; then
  echo "❌ Branch '$BRANCH_NAME' not found locally"
  exit 1
fi

# Check it has commits beyond main
AHEAD=$(git rev-list --count "main..$BRANCH_NAME" 2>/dev/null || echo 0)
if [ "$AHEAD" -eq 0 ]; then
  echo "⚠️  Branch '$BRANCH_NAME' has no commits beyond main — nothing to merge"
  exit 0
fi

# Dry-run merge check
echo "⟳ Checking merge compatibility..."
if ! git merge-tree "$(git merge-base main "$BRANCH_NAME")" main "$BRANCH_NAME" >/dev/null 2>&1; then
  echo "❌ Merge conflicts detected! Resolve manually:"
  echo "   git checkout $BRANCH_NAME && git merge main && ..."
  exit 1
fi

# Merge (fast-forward if possible)
echo "⟳ Merging '$BRANCH_NAME' into main..."
git checkout main
git merge --ff-only "$BRANCH_NAME" 2>/dev/null || {
  echo "⟳ Fast-forward not possible, creating merge commit..."
  git merge --no-ff "$BRANCH_NAME" -m "feat: merge $BRANCH_NAME"
}

echo "✅ Merged '$BRANCH_NAME' into main"

# Cleanup
if [ "$DELETE" = "--delete-worktree" ]; then
  if [ -d "$WORKTREE_PATH" ]; then
    echo "⟳ Removing worktree..."
    git worktree remove "$WORKTREE_PATH" 2>/dev/null || {
      echo "⚠️  Could not remove worktree (maybe dirty?) — remove manually:"
      echo "   git worktree remove $WORKTREE_PATH"
    }
  fi
  echo "⟳ Deleting branch..."
  git branch -d "$BRANCH_NAME"
  echo "✅ Cleaned up"
fi

echo ""
echo "   Push main:  git push origin main"
