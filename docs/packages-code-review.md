# `packages/` Code Review

> **Date:** 2026-09-04  
> **Scope:** All 7 packages (`commands`, `editor`, `graph`, `keybindings`, `theme`, `ui`, `views`)  
> **Focus:** DRY violations, maintainability, performance

---

## Table of Contents

1. [Cross-Cutting DRY Violations](#1-cross-cutting-dry-violations)
2. [Bugs](#2-bugs)
3. [Performance Concerns](#3-performance-concerns)
4. [packages/ui Issues](#4-packagesui-issues)
5. [packages/commands Issues](#5-packagescommands-issues)
6. [packages/editor Issues](#6-packageseditor-issues)
7. [packages/theme Issues](#7-packagestheme-issues)
8. [packages/keybindings Issues](#8-packageskeybindings-issues)
9. [packages/graph Issues](#9-packagesgraph-issues)
10. [packages/views Issues](#10-packagesviews-issues)
11. [What's Already Clean](#11-whats-already-clean)
12. [Recommended Action Order](#12-recommended-action-order)

---

## 1. Cross-Cutting DRY Violations

### 1a. Frontmatter utility duplication across `packages/editor`

| Utility | File 1 | File 2 |
|---------|--------|--------|
| `isFrontmatterObject()` | `frontmatter-icons.ts:110` | `frontmatter-widget.ts:13` |
| `variantKey()` / `getVariantKey()` | `frontmatter-icons.ts:116` | `frontmatter-widget.ts:17` |
| `escapeHtml()` | `block-widgets/table-widget.ts:81` | `block-widgets/dql-widget.ts:69` |

**Fix:** Extract to `editor/src/frontmatter-utils.ts` and `editor/src/block-widgets/utils.ts`.

### 1b. Wikilink embed scan pattern duplicated

`embed-preview.ts:103-132` and `embed-media.ts:145-194` iterate WikiLink nodes identically — only the widget factory differs. File-extension classification lists overlap but differ slightly between the two files.

**Fix:** Extract `scanEmbedWikiLinks(doc, widgetFactory)` helper and a shared `classifyMediaExtension(ext)` function.

### 1c. Block widget registration repeated 4x in `editor.ts`

`createEditorExtensionGroups()`, `previewExtensions()`, `readingExtensions()`, and `readingModeExtras()` each manually construct `blockWidgetSpecsFacet.of(...)` + `HTML_BLOCK_THEME` etc.

**Fix:** `commonBlockWidgetExtensions()` helper.

### 1d. CSS token theme output dual-write

`packages/theme/build.ts` writes identical CSS to both:
- `packages/theme/src/generated/tokens.css`
- `packages/ui/src/styles/globals.css`

Only `globals.css` is imported. The two copies have **already drifted** — `globals.css` is missing 3 syntax tokens and the shadcn bridge block.

Additionally, `TokenName` type + `tokenNames` array in `types.ts` duplicate all 155 token names — both are unused. The root `"."` export in `index.ts` has zero consumers.

**Fix:** Delete `tokens.css`, `TokenName`, `tokenNames`. Keep sole output in `globals.css`.

### 1e. Two parallel command registration systems

| System | Source of Truth | Commands | Used By |
|--------|----------------|----------|---------|
| A: `commands.json` + `registerCommand(id, cb)` | JSON metadata | ~18 app commands | `useShellCommands`, `tabCommands`, `search/commands`, `settings/commands`, `useEditor` |
| B: Direct `commandService.register()` | Inline JSX | ~12 editor commands | `useEditorCommands.tsx` |

System B commands carry a dead `hotkeys` field silently dropped (not in `Command` type).

**Fix:** Add editor commands to `commands.json` or explicitly document the two-tier design.

### 1f. Hotkey duplication across packages

`keybindings.json` declares `"CmdOrCtrl+B"` while `useEditorCommands.tsx` declares `hotkeys: ["Ctrl+B"]` on the same command objects — different formats, no cross-reference.

---

## 2. Bugs

| Severity | Issue | Location |
|----------|-------|----------|
| **Medium** | `ContextMenu.tsx` memoizes commands with `[]` deps — format/editor commands stale if editor mounts after context menu | `apps/tauri/.../ContextMenu.tsx:38` |
| **Medium** | `resolveRefs()` returns entire original string when a `{ref}` doesn't resolve, corrupting the whole line | `packages/theme/build.ts` |
| **Medium** | `CommandProvider` / `useCommandService` hook is dead — never consumed, wraps tree for nothing | `packages/commands/src/react.tsx` |
| **Low** | `FrontmatterWidget.eq()` uses `JSON.stringify()` for comparison — O(n) + temp string per CM6 update | `packages/editor/src/frontmatter-widget.ts:127` |
| **Low** | Phantom `./create-extensions` export in `packages/editor/package.json` (file does not exist) | `packages/editor/package.json:9` |
| **Low** | `@uiw/react-codemirror` listed as dependency but never imported in `packages/editor` | `packages/editor/package.json:27` |
| **Low** | README references nonexistent `matchesHotkey` function | `packages/keybindings/README.md:28,41` |
| **Low** | `schema.json` unused, overly-permissive, doesn't cover real token files | `packages/theme/tokens/schema.json` |
| **Low** | Stale `packages/ui/tokens/build.ts` path in generated file headers | `packages/theme/build.ts:144` |

---

## 3. Performance Concerns

### High Priority

| Issue | Location | Impact |
|-------|----------|--------|
| `ensureSyntaxTree(state, doc.length, 300)` blocks main thread up to 300ms on first render of huge docs | `packages/editor/src/preview/live-preview.ts:206` | Jank spike on 25k+ note open |
| Frontmatter `parse()` calls `state.doc.toString()` — full 100KB+ string alloc for top-of-file YAML | `packages/editor/src/block-widgets/frontmatter.ts:267` | Should use `state.doc.sliceString(0, closingFenceEnd)` |

### Medium Priority

| Issue | Location |
|-------|----------|
| `TAG_RE` regex created per line per visible update (should be module-scoped) | `packages/editor/src/preview/inline-marks.ts:122` |
| `commandService.getCommands()` allocates + filters array on every keydown in keybinding service | `packages/keybindings/src/keybinding-service.ts:84` |
| `keybinding-service.ts` re-sorts bindings + re-parses hotkey strings on every keystroke | `packages/keybindings/src/keybinding-service.ts:64-93` |
| Hover flag fill O(n) per mousemove using `Array.includes` instead of Set | `packages/graph` consumer `Graph.tsx:866` |
| `updateEdgeEndpoints` O(edges) main-thread loop every frame | `packages/graph/src/renderer.ts:465` |

### Low Priority

| Issue | Location |
|-------|----------|
| `codeSyntaxHighlightingExtension()` called 3x creating new extension each time — should be module-scoped | `packages/editor/src/syntax/code-highlight-style.ts:172` |
| `performance.mark/measure` in production code without `__DEV__` guard | `packages/editor/src/preview/inline-marks.ts`, `live-preview.ts` |
| `gl.clearColor()` set every frame, should be constructor-only | `packages/graph/src/renderer.ts:516` |
| `COMMANDS.find()` linear scan (trivial at current 18 entries) | `packages/commands/src/service.ts:26` |
| `SpatialGrid.build` allocates `cursor` buffer every frame (2KB, negligible) | `packages/graph` consumer |

---

## 4. `packages/ui` Issues

### High Severity

| Issue | Details |
|-------|---------|
| **`TabsBar.tsx` (536 lines)** | Mixes overflow calculation, DnD drop indicator management, dropdown menu rendering, keyboard navigation, and ResizeObserver setup. Needs decomposition into `useTabOverflow`, `useTabDragDrop` hooks. |
| **Dead CSS in `index.css`** | Lines 6-57 define HSL `--background`/`--foreground` etc. that no component uses. `@layer base` uses v3 `@apply` syntax with a v4 package. |

### Medium Severity

| Issue | Files Affected |
|-------|----------------|
| `bg-[var(--sat-surface-2)] border-[var(--sat-layout-border)]` repeated in 9+ files | Ribbon, SidebarPanel, SidebarHeader, InputDialog, ConfirmDialog, TabsBar, TabItem, TabListFrame, FileTreeNode |
| Primary button `bg-[var(--sat-accent-primary)] text-[var(--sat-text-inverse)] hover:opacity-90` repeated in 4+ files | InputDialog, ConfirmDialog, RibbonItem, TabItem, FileTreeNode, ResizeHandle |
| Ghost cancel button `text-[var(--sat-text-secondary)] hover:text-[var(--sat-text-primary)]` repeated in 3+ files | InputDialog, ConfirmDialog, TabsBar |
| Context menu icon span `<span className="inline-flex min-w-4 items-center justify-center">` repeated 11 times | `FileTreeContextMenu.tsx` |
| `InputDialog` + `ConfirmDialog` duplicate identical Dialog chrome classes | Both files |
| `TabsBar.tsx` and `useTabChrome.ts` bypass `useResizeObserver` hook, creating raw `ResizeObserver` instances | Both files |

**Fix:** Add `--sat-*` based variants to `button.tsx` cva system. Extract shared Dialog wrapper. Create `ContextMenuItemIcon` wrapper. Expand `useResizeObserver` API or accept the raw pattern.

### Low Severity

| Issue | Details |
|-------|---------|
| Mixed primitives | `scroll-area.tsx` uses `@radix-ui` while everything else migrated to `@base-ui` |
| Barrel export inconsistency | `sidebar/`, `ribbon/`, `tabs/` use `export *`; others use named re-exports |
| Missing memo | `Ribbon`, `FileTree`, `PaletteShell*`, `InputDialog`, `ConfirmDialog` not memoized |
| `FileTreeNode.tsx` (313 lines) | Contains 4 extractable sub-components (`ChevronRight`, `FolderIcon`, `FileIcon`, `InlineEditInput`) |
| `Icon` boilerplate | `PenLineIcon` and `BookOpenIcon` share identical SVG structure — create base `Icon` wrapper |
| Dual primitive library | Project depends on both `@radix-ui/react-scroll-area` and `@base-ui/react` |

### Component Logic Mixing

| Component | Issue | Severity |
|-----------|-------|----------|
| `TabsBar.tsx` | Overflow calc + DnD + dropdown + keyboard nav + ResizeObserver — all in one component | High |
| `SidebarPanel.tsx` | Global `document.addEventListener` for resize + `document.body.style.cursor` manipulation | Medium |
| `FileTreeContextMenu.tsx` | Encodes domain knowledge (which items enabled/disabled based on `targetKind`) — should receive generic `items` array | Medium |

---

## 5. `packages/commands` Issues

| Issue | Severity |
|-------|----------|
| `CommandProvider` / `useCommandService` hook is dead infrastructure — never consumed | Medium |
| Two parallel registration systems (`commands.json` vs inline `register()`) | Medium |
| `hotkeys` field on editor commands silently ignored (not in `Command` type) | Low |
| `getCommands()` allocates new array on every call, including per-keydown in keybindings | Low |
| `COMMANDS.find()` linear scan per registration | Low |
| `ContextMenu.tsx` memoizes commands with `[]` deps — stale after dynamic registration | Medium (bug) |
| Icon `size: 16` hardcoded in `createElement` — not configurable per-command | Low |
| Three modules register commands as side effects with no cleanup path | Info (deliberate) |

---

## 6. `packages/editor` Issues

### DRY (summarized from Section 1)

- `isFrontmatterObject()`, `getVariantKey()`, `escapeHtml()` — duplicated
- Wikilink embed scan pattern — duplicated
- Block widget registration — repeated 4x
- CSS typography duplicated between `.sat-html` and `.cm-content` scopes (~200 lines)
- File-extension classification lists overlap with slight differences

### Other

| Issue | Severity |
|-------|----------|
| Phantom `./create-extensions` export in `package.json` | Low |
| Stale `@uiw/react-codemirror` dependency (unused in package) | Low |
| `FrontmatterWidget.eq()` uses `JSON.stringify()` comparison | Medium |
| `syntaxHighlighting()` called redundantly 3x — should be module-scoped | Low |
| `FrontmatterWidget.toDOM()` uses `querySelectorAll` + `Array.from` on every ArrowUp/Down | Low |
| `defaultHighlightStyleOverride` exported in public barrel but only used internally | Low |

---

## 7. `packages/theme` Issues

| Issue | Severity |
|-------|----------|
| Identical CSS written to two files that already diverged | High |
| `TokenName` + `tokenNames` duplicate all 155 names — both unused | Medium |
| Root `"."` export + `ThemeMode` type have zero consumers | Medium |
| `resolveRefs()` corrupted-string bug on unmatched ref + no circular-ref guard | Medium (bug) |
| Four near-identical `resolveRefs` loops in `buildBaseMap()` | Low |
| `dark.json` has empty overrides — theme is selectable but no CSS block exists | Low |
| Theme overrides emit ~20 redundant editor vars per theme | Low (CSS bloat) |
| `schema.json` unused, overly-permissive | Low |
| Stale file path in generated header comments | Low |
| Missing `isValidThemeId` helper that consumers re-implement | Low |

---

## 8. `packages/keybindings` Issues

| Issue | Severity |
|-------|----------|
| `resolve()` re-sorts bindings array on every keystroke | Low |
| `resolve()` calls `getCommands()` (allocating) + `.find()` per binding — O(N*M) | Low |
| README references nonexistent `matchesHotkey` | Low |
| `Keybinding` type allows both `command` and `action` set simultaneously | Low |
| `unregister()` removes by `key` string, not by identity | Low (design) |
| Hotkey assignments split between `keybindings.json` and command `hotkeys` fields | Low (DRY) |

---

## 9. `packages/graph` Issues

| Issue | Severity |
|-------|----------|
| `updateEdgeEndpoints` O(edges) main-thread loop every frame | Medium |
| Hover flag fill O(n) per mousemove with O(degree) `Array.includes` | Medium |
| Djb2 hash repeated 3x in consumer `Graph.tsx` | Low |
| `gl.clearColor()` set every frame (should be constructor-only) | Low |
| `SpatialGrid.build` allocates `cursor` buffer every frame | Low |
| No tests in package itself (only consumer has SpatialGrid tests) | Low |

---

## 10. `packages/views` Issues

| Issue | Severity |
|-------|----------|
| `leaf.tsx` bundles 7+ concerns (interfaces, context, provider, hook, registry) | Low (note for future) |
| `resolveAsset` optional in `LeafServices` — forces null-checking at call sites | Low |
| `ViewRegistry` / `LeafRegistry` structural duplication | Low (acceptable) |

---

## 11. What's Already Clean

| Package | Strengths |
|---------|-----------|
| **`packages/keybindings`** | Zero internal duplication, well-factored, clean barrel |
| **`packages/views`** | Well-structured registries, context/hook chain properly memoized |
| **`packages/graph`** | Excellent framework-agnostic boundary, correct WebGL practices, clean barrel |
| **`packages/ui` barrel** | Smart decision to not re-export components for tree-shaking |
| **`cn()` usage** | Consistent across all files — no `clsx()` direct imports |

---

## 12. Recommended Action Order

| # | Action | Impact | Effort |
|---|--------|--------|--------|
| 1 | Delete theme dual-write — keep sole output in `globals.css`, remove `tokens.css` and dead exports | Eliminates active drift | Small |
| 2 | Extract editor shared utilities — `escapeHtml`, `isFrontmatterObject`, `getVariantKey`, wikilink scan helper | Removes 6 duplications | Medium |
| 3 | Fix `ContextMenu.tsx` stale memoization (functional bug) | Correctness | Small |
| 4 | Fix `resolveRefs` bug in theme build | Correctness | Small |
| 5 | Decompose `TabsBar.tsx` — extract overflow, DnD, and dropdown into sub-modules or hooks | Maintainability | Large |
| 6 | Add `--sat-*` Button variants to `button.tsx` | Stops 4+ inline override pattern | Medium |
| 7 | Extract Dialog chrome wrapper from InputDialog/ConfirmDialog | Removes class duplication | Small |
| 8 | Hoist `TAG_RE` regex and `codeSyntaxHighlightingExtension` to module scope | Low-hanging perf | Small |
| 9 | Gate `performance.mark/measure` behind `__DEV__` | Production cleanliness | Small |
| 10 | Create `ContextMenuItemIcon` wrapper | Removes 11x repetition | Small |
| 11 | Unify file-extension classification for embed plugins | Removes divergence risk | Small |
| 12 | Add `hasCommand(id)` to `CommandService` for O(1) lookup | Hot-path perf | Small |
| 13 | Pre-parse + cache sorted bindings in `KeybindingService` | Hot-path perf | Small |
| 14 | Use Set for hover neighbors in Graph | Hot-path perf | Small |
| 15 | Replace `JSON.stringify` in `FrontmatterWidget.eq()` | Per-update perf | Small |
