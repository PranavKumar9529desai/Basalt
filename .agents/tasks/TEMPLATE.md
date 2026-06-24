# Task: <Title>

**Branch:** `<branch-name>`  
**Worktree:** `../.worktrees/basalt-<branch-name>`  
**Agent:** _ (assigned by orchestrator)  
**Depends on:** _ (list completed task branches that must be merged first)  
**Risk:** Low / Medium / High  

## Problem

_What's wrong? Why does this need to change?_

## Solution

_What's the approach? What does the target state look like?_

## Files to touch

```
apps/tauri/src/features/editor/SomeFile.tsx   ← modify
apps/tauri/src/features/editor/NewFile.tsx    ← create
apps/tauri/src/features/editor/index.ts       ← update exports
```

## Task List

- [ ] **Step 1:** Read files listed above
- [ ] **Step 2:** Make changes
- [ ] **Step 3:** Verify:
  ```bash
  cd apps/tauri && bunx tsc --noEmit
  bun run lint
  ```
- [ ] **Step 4:** Commit:
  ```bash
  git add -A && git commit -m "type(scope): description"
  git push origin <branch-name>
  ```
- [ ] **Step 5:** Signal completion

## Verification

- [ ] `bunx tsc --noEmit` passes
- [ ] `bun run lint` passes  
- [ ] No new console.log or dead code
- [ ] Stale references updated (rg for old names)

## Merge Dependencies

_List branches that must be merged to main before this one._
