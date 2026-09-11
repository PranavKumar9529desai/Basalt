# shadcn Migration Plan — Hand-Rolled UI → `packages/ui` Primitives

> Execution checklist for migrating hand-rolled UI in `apps/tauri/src/` onto the
> shadcn primitives in `packages/ui/src/components/ui/` (ADR-003).
> One commit per phase. Gate after every phase: `bun run lint && cd apps/tauri && bunx tsc --noEmit`.
> Status banner: last updated 2026-09-11 — **all phases complete**. Steps 0a–0e
> (enforcement layer) + Phases 1–5 landed in one uncommitted working set.
> Remaining: screenshot spot-checks (acceptance §6) before committing per phase.

## Why

ADR-003 mandates shadcn/Radix primitives over raw markup. Four audits (initial,
2026-09-09) found ~24 component files in `apps/tauri/src/` that hand-roll modal
chrome, context menus, buttons, selects, toggles, sliders, tooltips, and
checkboxes — **duplicating styling knowledge that already lives in
`packages/ui`** or reaching directly into `@base-ui/react` instead of the
wrappers. Every duplicate diverges (`GraphControls` inline-styles a switch,
`SettingDropdown` re-implements the exact `Select` wrapper markup), so the
migration is also a DRY fix (CONVENTIONS §12.6 spirit, frontend edition).

**Non-goals:** no UX redesign, no layout changes, no behavior changes. Pure
presentational swaps. Also out of scope: legitimate raw elements — modal
backdrops (`aria-hidden`, `tabIndex={-1}`), the `SplitPane` resize sash, the
`<input type="date">` date cells, and the CM6 editor chrome (`InlineTitle`,
`ScrollContainer`, `StatusLine` are editor-surface, not form controls).

## Inventory (audit 2026-09-09)

### A. Hand-rolled modal chrome → shadcn `Dialog` (exists, used by `CreateTaskModal`/`SearchModal`)

| File | Hand-rolled bits |
| --- | --- |
| `features/settings/components/SettingsModal.tsx` | `.fixed inset-0` backdrop, `dialogRef` click-outside, manual Escape via keybinding service, `role="dialog"`/`aria-modal` |
| `features/export/components/ExportDialog.tsx` | Same modal chrome + custom `SmartCheckbox` + native `<select>` + native `<input type="range">` |
| `features/canvas/components/AssetPickerModal.tsx` | Modal chrome + hand-rolled listbox (arrow-key nav, focus mgmt, `selectedIndex`) |
| `features/canvas/components/NotePickerModal.tsx` | Modal chrome + hand-rolled listbox |

### B. Hand-rolled context menu → shadcn `ContextMenu` (exists, used by editor `ContextMenu.tsx`)

| File | Hand-rolled bits |
| --- | --- |
| `features/canvas/components/CanvasContextMenu.tsx` | Manual positioning, `pointerdown`-outside listener, raw `<button>` `MenuItem`, manual `<div>` separators |

`ContextMenuContent` supports the `anchor`-with-`getBoundingClientRect` trick the
editor already uses — the canvas menu can anchor to its `{x, y}` coordinates
verbatim.

### C. Direct `@base-ui/react/*` usage → existing/new `packages/ui` wrappers

| File | Direct primitive | Fix |
| --- | --- | --- |
| `features/settings/components/controls/SettingDropdown.tsx` | `@base-ui/react/select` | Use `@workspace/ui/components/ui/select` (the wrapper exists) |
| `features/settings/components/controls/SettingToggle.tsx` | `@base-ui/react/switch` | Use new `ui/switch.tsx` (Phase 1) |
| `features/settings/components/controls/SettingSlider.tsx` | `@base-ui/react/slider` | Use new `ui/slider.tsx` (Phase 1) |
| `features/graph/components/GraphControls.tsx` | `@base-ui/react/switch` + `select`, inline `style={{}}` everywhere, raw `<input type="range">`, text `"x"` close | Use `ui/select` + `ui/switch` + `ui/slider`; convert inline styles to Tailwind + `--sat-*` tokens |

### D. Raw `<button>` where shadcn `Button` should be used

| File | Count | Notes |
| --- | --- | --- |
| `features/assets/components/AssetsView.tsx` + `AssetRow.tsx` | 5 + 1 | toolbar + row actions |
| `features/canvas/nodes/LinkNode.tsx` | 3 | card chrome |
| `features/canvas/nodes/FileNode.tsx`, `GhostCardNode.tsx` | 1 + 1 | "open in tab" / ghost commit |
| `features/canvas/components/CanvasToolbar.tsx` | 1 (`ToolButton` wrapper) | 5 icon buttons via wrapper |
| `features/vault/components/BacklinksSidebar.tsx` | 2 | |
| `features/vault/components/TagsSidebar.tsx`, `VaultSplash.tsx` | 1 + 1 | |
| `app-shell/SideDock.tsx` | 2 | section-toggle icon buttons |
| `app-shell/Shell.tsx` | 1 | right-sidebar toggle |
| `app-shell/views/TableControls.tsx` | 1 (`Btn` wrapper) | 9 icon buttons via wrapper |
| `features/settings/components/SettingsNav.tsx` | 1 | nav item |
| `features/settings/components/layout/SettingsSearch.tsx` | 1 | clear-search |
| `features/settings/components/controls/SettingColor.tsx` | 1 | swatch |

### E. `title=` tooltips → shadcn `Tooltip` (provider mounted, never used)

`TooltipProvider` is already mounted in `routes/__root.tsx`. Icon-only controls
using `title=` today: `SideDock`, `Shell`, `TableControls` (7), `CanvasToolbar`
(5), `DrawingHeaderActions`, `FileNode`, `LinkNode`, `GhostCardNode`,
`CardHandles`, `BacklinksSidebar`, `TagsSidebar`, `AssetsView`,
`settings/.../HotkeysSection`, `CorePluginsSection`, `InlineTitle`, `SplitPane`.
Wrap icon-only `Button`s in `Tooltip`; keep `title=` off these controls.

### F. Missing primitives in `packages/ui` (root cause for the base-ui drift)

`packages/ui/src/components/ui/` currently has: `badge, button, calendar,
command, context-menu, dialog, dialog-frame, input, label, scroll-area, select,
separator, textarea, tooltip`. **Missing: `switch`, `slider`, `checkbox`,
`dropdown-menu`, `popover`.** Until they exist, any new toggle/slider/dropdown
drifts. Phase 1 closes this gap.

---

## Phase 1 — Add missing shadcn primitives to `packages/ui` (gates the rest)

| Item | What |
| --- | --- |
| `ui/switch.tsx` | wrap `@base-ui/react/switch`; `--sat-*` tokens; adopt `SettingToggle`'s visuals (accent track, white thumb) |
| `ui/slider.tsx` | wrap `@base-ui/react/slider`; `--sat-*` tokens; adopt `SettingSlider`'s visuals (track + fill + thumb) |
| `ui/checkbox.tsx` | wrap `@base-ui/react/checkbox` (or base checkbox) for `ExportDialog` includes |
| `ui/dropdown-menu.tsx` | wrap `@base-ui/react/menu`, `trigger` — for `DrawingHeaderActions` panel |
| `ui/popover.tsx` | wrap `@base-ui/react/popover` if a positioned panel is needed |
| `ui/radio-group.tsx` *(only if a future control needs it — not currently blocking)* | — |

Each primitive: named exports (CONVENTIONS §4.4), `data-slot` attributes,
`--sat-*` tokens only (ADR-002), no Tauri imports (§2.1 litmus). Delete
nothing yet — consumers migrate in later phases.

**Gate:** `bun run lint && bunx tsc --noEmit`; new primitives have zero callers
or only the migrated ones.

## Phase 2 — Modals → `Dialog` (Tier A)

| File | Notes |
| --- | --- |
| `SettingsModal.tsx` | `Dialog open={isOpen} onOpenChange={close}`; keep the keybinding-service `closeTopModal` action registered but let `Dialog` own Escape/backdrop/focus (verify no double-close) |
| `ExportDialog.tsx` | `Dialog` + `ui/checkbox` for `SmartCheckbox` + `ui/select` for page size/orientation + `ui/slider` for font size |
| `AssetPickerModal.tsx` | `Dialog` + `ui/command` (it's a searchable list — the editor `CommandPalette`/`SearchModal` pattern) |
| `NotePickerModal.tsx` | `Dialog` + `ui/command` |

Delete the custom backdrop buttons, `dialogRef` click-outside handlers, and
per-modal `role="dialog"`/`aria-modal` markup. Reuse existing `DialogContent`
sizing classes (`sm:max-w-*`, `h-[84vh]` pattern from `SearchModal`).

**Gate:** escape, backdrop-click, initial-focus, and open/close behavior same
as before (manual QA + existing tests; add tests if gaps surface).

## Phase 3 — Context menu + base-ui drift (Tiers B & C)

| File | Fix |
| --- | --- |
| `CanvasContextMenu.tsx` | `ContextMenu` root with `ContextMenuContent anchor={menuAnchor}` (DOMRect from `{x,y}`), `ContextMenuItem`s, `ContextMenuSeparator`s. Drop manual listeners. |
| `SettingDropdown.tsx` | Replace `@base-ui/react/select` import with the `Select` compound from `ui/select`; delete re-implemented trigger/popup/item classes |
| `SettingToggle.tsx` | `ui/switch` |
| `SettingSlider.tsx` | `ui/slider` |
| `GraphControls.tsx` | `ui/select` + `ui/switch` + `ui/slider` (or `ui/button` for depth ±, if preferred); rewrite `style={{}}` to Tailwind classes with `--sat-*` tokens; `Button size="icon-xs"` with `IconX` for close |

Gate: `GraphControls` diff should shrink; no inline `style={{}}` with `--sat-*`
values remains (CONVENTIONS §5.1).

## Phase 4 — Raw buttons → `Button` + tooltip pass (Tiers D & E)

| File | Fix |
| --- | --- |
| `AssetsView.tsx`, `AssetRow.tsx` | `Button variant="ghost" size="icon-sm"`; `Tooltip` on icon actions |
| `LinkNode.tsx`, `FileNode.tsx`, `GhostCardNode.tsx` | `Button` for card chrome; canvases use pointer events — keep `onDoubleClick`/`stopPropagation` behavior identical |
| `CanvasToolbar.tsx` | `ToolButton` → `Button variant="ghost" size="icon"` + `Tooltip` (toolbar floats over canvas; verify z-index/backdrop-blur unaffected) |
| `BacklinksSidebar.tsx`, `TagsSidebar.tsx`, `VaultSplash.tsx` | `Button` (+ `Tooltip` where icon-only) |
| `SideDock.tsx`, `Shell.tsx` | section-toggle / right-toggle icons → `Button variant="ghost" size="icon-sm"` + `Tooltip`; keep `aria-pressed` |
| `TableControls.tsx` | `Btn` wrapper → `Button variant="ghost" size="icon"`; wrap with `Tooltip`; keep `disabled` states |
| `SettingsNav.tsx`, `SettingsSearch.tsx` (clear), `SettingColor.tsx` | `Button` |

Acceptable raw elements (NOT migrated): modal backdrops, `SplitPane` sash,
`<input type="date">`, editor-surface chrome. If a 200-line component budget is
breached while wrapping, extract sub-components (CONVENTIONS §2.4) rather than
padding a file.

**Gate:** zero raw `<button>` clickable-controls outside the accept-list;
grep: `grep -rE '<button' apps/tauri/src --include='*.tsx'` shows only exempt
sites.

## Phase 5 — Tooltip sweep + final gate

| Item | What |
| --- | --- |
| `DrawingHeaderActions.tsx` | Hand-rolled expand panel → `ui/dropdown-menu` (keeps the floats-above-the-surface behavior; verify positioning at `top-[72px] right-3`) |
| Remaining `title=` on icon controls | `Tooltip` everywhere interactive; title only where the DOM needs it (truncation hints, editor chrome) |
| Sweep | `grep -r 'title="' apps/tauri/src` review; `grep -r '@base-ui' apps/tauri/src` must return only imports via `@workspace/ui` |
| Final gate | `bun run lint && cd apps/tauri && bunx tsc --noEmit && bun run build` (repo root) + full test suite (`cargo test --workspace`, frontend tests in `apps/tauri`) |

## Acceptance criteria (whole migration)

1. `grep -r '@base-ui/react' apps/tauri/src` → empty (all via `@workspace/ui`).
2. `grep -rE '<button' apps/tauri/src --include='*.tsx'` → only the exempt
   sites (backdrops, sash, editor chrome).
3. No `title=` tooltips on interactive controls; `TooltipProvider` actually
   wraps `Tooltip` consumers.
4. No inline `style={{}}` for `--sat-*` values or colors.
5. Before/after screenshots per surface (settings, export, canvas pickers,
   canvas context menu, graph controls, docks, table controls) — layout
   identical.
6. All existing tests green (no behavior changes: focus, escape, keyboard
   nav in pickers, DnD in canvas/tabs, editor context menu).

## Rollback

Each phase is one commit touching presentational files only. If a regression
lands, revert the phase commit — no data/filesystem effects (UI-only surface).