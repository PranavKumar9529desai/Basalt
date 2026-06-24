#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# make-worktree — create a git branch + worktree for a parallel agent task.
#
# Usage:
#   ./scripts/make-worktree.sh <task-name> [base-branch]
#
# Examples:
#   ./scripts/make-worktree.sh editor-slash-commands
#   ./scripts/make-worktree.sh vault-refactor phase-3-paneinstance
#
# What it does:
#   1. Creates a branch called `<task-name>` from `main` (or `base-branch`)
#   2. Creates a git worktree at `../basalt-<task-name>`
#   3. Pushes the branch to origin
#   4. Prints the cd command for the agent
# ---------------------------------------------------------------------------

set -euo pipefail

TASK_NAME="${1:?Usage: make-worktree.sh <task-name> [base-branch]}"
BASE_BRANCH="${2:-main}"
BRANCH_NAME="$TASK_NAME"
WORKTREE_PATH="../.worktrees/basalt-$TASK_NAME"

if [ -d "$WORKTREE_PATH" ]; then
  echo "❌ Worktree already exists at $WORKTREE_PATH"
  exit 1
fi

# Make sure we have the latest base branch
echo "⟳ Fetching origin..."
git fetch origin "$BASE_BRANCH" 2>/dev/null || true

# Create branch (from base branch)
echo "⟳ Creating branch '$BRANCH_NAME' from '$BASE_BRANCH'..."
git branch "$BRANCH_NAME" "origin/$BASE_BRANCH" 2>/dev/null || git branch "$BRANCH_NAME" "$BASE_BRANCH"

# Create worktree
echo "⟳ Creating worktree at $WORKTREE_PATH..."
mkdir -p "$(dirname "$WORKTREE_PATH")"
git worktree add "$WORKTREE_PATH" "$BRANCH_NAME"

echo ""
echo "✅ Worktree ready for $TASK_NAME"
echo ""
echo "   Enter with:  cd $WORKTREE_PATH"
echo "   Push with:   cd $WORKTREE_PATH && git push origin $BRANCH_NAME"
echo ""
echo "   When done:   ./scripts/merge-tree.sh $TASK_NAME"
