# Phase 1: Delete Dead Code

**Branch:** `phase-1-dead-code`
**Worktree:** `../basalt-phase1`

## Task List

- [ ] Search for all imports pointing to the 4 stale files:
  ```bash
  rg "from.*['\"].*components/context-menu['\"]" apps/ packages/
  rg "from.*['\"].*components/scroll-area['\"]" apps/ packages/
  rg "from.*['\"].*components/separator['\"]" apps/ packages/
  rg "SimpleComponent" apps/ packages/
  ```
- [ ] Update any imports pointing to loose files → redirect to `ui/` version
- [ ] Delete:
  - `packages/ui/src/components/simple-component.tsx`
  - `packages/ui/src/components/context-menu.tsx`
  - `packages/ui/src/components/scroll-area.tsx`
  - `packages/ui/src/components/separator.tsx`
- [ ] `cd apps/tauri && bunx tsc --noEmit` → zero errors
- [ ] `cd packages/ui && bunx tsc --noEmit` → zero errors
- [ ] Commit:
  ```bash
  git add -A && git commit -m "chore(ui): delete stale duplicate components"
  ```
