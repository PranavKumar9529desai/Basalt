# Basalt — Parallel Agent Workflow

> This document describes how to run multiple AI agents in parallel using git worktrees.
> Each agent works on an independent branch in a separate directory — no merge conflicts,
> no stepping on each other's changes.

---

## The One-Paragraph Summary

1. **Orchestrator** creates one branch + worktree per task using `scripts/make-worktree.sh`
2. **Each agent** `cd`s into its worktree, reads its `.agents/tasks/<task>.md` file, makes changes, commits, pushes
3. **Orchestrator** merges branches into `main` in dependency order using `scripts/merge-tree.sh`

---

## Setup (Orchestrator)

```bash
# From the repo root
cd /home/pranav/Projects/Basalt

# Create worktrees for each independent task
./scripts/make-worktree.sh editor-slash-commands
./scripts/make-worktree.sh vault-refactor
./scripts/make-worktree.sh theme-persistence

# Dependent tasks branch from the worktree they depend on
./scripts/make-worktree.sh search-integration editor-slash-commands

# Verify
git worktree list
# → /home/pranav/Projects/Basalt                          main
# → /home/pranav/Projects/Basalt/../.worktrees/basalt-editor-slash-commands  editor-slash-commands
# → ...
```

Each worktree is a fully independent git checkout. Agents can install deps, run tests, and make commits without affecting each other.

---

## Agent Workflow

Each agent gets a worktree path and a task file. The workflow is:

```bash
# 1. Enter your worktree
cd /home/pranav/Projects/Basalt/../.worktrees/basalt-<task-name>

# 2. Read the task file
cat .agents/tasks/<task-name>.md

# 3. Execute the steps
# (read files, make changes, verify)

# 4. Commit and push
git add -A
git commit -m "type(scope): description"
git push origin <branch-name>

# 5. Signal completion to the orchestrator
```

### Important rules for agents

- **Never modify files outside your task scope** — your worktree branch isolates your changes
- **Never merge other branches** — the orchestrator handles all merging
- **Do touch shared config files** (AGENTS.md, CONVENTIONS.md) — they'll be merged carefully
- **Run `bunx tsc --noEmit` before committing** — broken types create merge pain
- **Keep commits clean** — one logical commit per step, not "wip" commits

---

## Dependency Rules

Not all tasks can run in parallel. Some depend on others:

```
Independent (parallel OK):
├── Theme persistence     ← touches only ThemeProvider.tsx
├── Editor shortcut fix  ← touches only useEditor.ts
├── UI component polish  ← touches only packages/ui/
└── Rust search perf     ← touches only crates/

Dependent (sequential):
├── Phase A: New API in vault
│   └── Phase B: Consume API in app-shell  ← depends on Phase A merged
├── Step 1: Refactor store
│   └── Step 2: Update consumers          ← depends on Step 1 merged
└── Foundation: New types package
    └── Both: Editor + search use new types  ← both depend on Foundation
```

### Handling dependencies

1. **Orchestrator** merges the foundation branch first
2. Each dependent branch is created from the foundation (or waits for merge)
3. After the foundation merges, dependent branches can be rebased:
   ```bash
   cd ../.worktrees/basalt-dependent-task
   git fetch origin main
   git rebase origin/main
   ```

---

## Merge Workflow (Orchestrator)

Merge in dependency order, bottom-up:

```bash
# 1. Merge independent tasks first (any order)
./scripts/merge-tree.sh theme-persistence --delete-worktree
./scripts/merge-tree.sh ui-component-polish --delete-worktree

# 2. Push main so dependent branches can rebase
git push origin main

# 3. Merge foundational tasks
./scripts/merge-tree.sh vault-store-refactor --delete-worktree

# 4. Merge tasks that depended on foundation
# (agent rebased onto main after foundation merged)
./scripts/merge-tree.sh vault-ui-integration --delete-worktree
```

### Conflict resolution

If `merge-tree.sh` reports a conflict:

```bash
# Check which files conflict
cd /home/pranav/Projects/Basalt
git checkout <task-branch>
git merge main
# Resolve conflicts manually
git add -A && git commit -m "merge: resolve conflicts with main"
git push origin <task-branch>
# Then retry: ./scripts/merge-tree.sh <task-name>
```

---

## Cleanup

After all tasks are merged:

```bash
# Remove all worktrees
git worktree list | grep ".worktrees" | awk '{print $1}' | xargs -I{} git worktree remove {}

# Remove all task branches (local)
git branch -d editor-slash-commands vault-refactor theme-persistence

# Force push main
git push origin main
```

---

## Pitfalls to Avoid

| Pitfall | Solution |
|---------|----------|
| Two agents modify the same file | Check dependency graph — overlapping files = sequential |
| Agent pushes broken types | Agent must run `bunx tsc --noEmit` before committing |
| Merge conflicts in lockfiles | Use `bun install` after merge, commit updated lockfile |
| Worktree left dirty | `git worktree remove -f <path>` (drops uncommitted changes) |
| Branch falls behind main | Rebase: `git rebase origin/main` (orcherstrator notifies agents) |
