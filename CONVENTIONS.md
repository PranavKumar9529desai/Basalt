# Basalt Conventions — Frontend & Rust Backend

> Mandatory for ALL AI agents and human contributors.
> These replace and supersede outdated ADRs where they conflict.
> Rationale is captured inline — no separate docs needed.

---

## 1. File & Folder Naming

### 1.1 React components → PascalCase

Every component file is named after its exported component:

```
✅ EditorComponent.tsx        exports EditorComponent
❌ editor-component.tsx       kebab-case
❌ editorComponent.tsx        camelCase
```

### 1.2 Hooks → camelCase `use` prefix

```
✅ useEditor.ts
✅ useVaultTree.ts
❌ use-editor.ts
❌ EditorHook.ts
```

### 1.3 Types → PascalCase, no `.types.ts`

Types live in `types.ts` within the feature folder. Do not use `.types.ts` suffix.

```
features/tabs/types.ts        ✅
features/tabs/tabs.types.ts   ❌
features/tabs/tab-types.ts    ❌
```

### 1.4 Folders → kebab-case for multi-word, single word otherwise

```
features/
├── editor/               ✅ single word
├── file-tree/            ❌ use vault/ (the feature is vault, not file-tree)
└── app-shell/            ✅ kebab-case for multi-word
```

Exception: UI component groups in `packages/ui/src/components/` use the same name as their primary export (usually singular kebab-case).

### 1.5 Index files → `index.ts` or `.tsx`

Every feature folder MUST have an `index.ts` (or `.tsx`) that re-exports its public API. Never import from deep paths outside the owning feature.

```
features/tabs/index.ts  ✅ re-exports useTabs, WorkspaceTabs, types
features/tabs/hooks/useTabs.ts  ← internal, not imported cross-feature
```

### 1.6 Vocabulary — the workbench lexicon

One concept = one word. These terms are reserved; do not introduce synonyms
("strip", "bar", "group", "session") for concepts that already have a name.

| Term            | Means                                       | Canonical examples                                  |
| --------------- | ------------------------------------------- | --------------------------------------------------- |
| **view**        | A side-dock panel (ADR-018 / VS Code sense) | `viewRegistry`, `FileExplorerView`, `BacklinksView` |
| **leaf**        | The content type a tab renders              | `leafRegistry`, `MarkdownLeaf`, `tab.leafType`      |
| **tab**         | An open item in the tab strip               | `TabModel`, `useTabsStore`, `WorkspaceTabsBar`      |
| **pane**        | A tab container (currently exactly one)     | `TabPane`, `ROOT_PANE_ID`                           |
| **ribbon**      | Far-left quick-access bar                   | `Ribbon`, `RibbonItem`                              |
| **dock**        | Collapsible side panel host                 | `SideDock`                                          |
| **header band** | The 40px top row of the workspace grid      | `HeaderBandRule`                                    |
| **active note** | The note open in the focused tab            | `useActiveNoteStore`                                |

Rules for every new component, hook, store, and file:

1. **Name states what it owns**, not where it sits or how it's consumed.
   `useActiveNoteStore` ✅ — `useFocusedPaneStore` ❌ (there was no pane in it).
2. **Registry-first**: new dock panels = `viewRegistry` entries, new tab
   content = `leafRegistry` entries (both in `app-shell/registrations.ts`).
   Never a component switch in the shell.
3. **No unwired exports**: exported means imported. Anything else is dead
   code — delete it (§6).
4. **When a concept dies, rename its leftovers immediately** — a retired
   idea must not survive inside a name (`TabGroupFrame` → `TabListFrame`).
5. **ADR references are footnotes, not explanations** (§8.3).

---

## 2. Three-Layer Architecture (Simplified)

```
packages/ui/              ← Primitives: props in, DOM out.
                           🚫 No Tauri, no business state

apps/tauri/src/features/  ← Business logic: hooks, stores, IPC calls.
                           🚫 No cross-feature imports (exception: types)

apps/tauri/src/shared/    ← Cross-feature orchestration.
                           Imports from 2+ features. NOT in either feature.

apps/tauri/src/app-shell/ ← Thin glue: wires features into layout.
                           ✅ Only renders chrome + mounts providers
```

### 2.1 The Litmus Test

> "Can this render in an empty `index.html` with zero backend?"

- **Yes** → `packages/ui/`
- **No, it needs Tauri/IPC/state** → `apps/tauri/src/features/`
- **No, it wires 2+ features** → `apps/tauri/src/shared/`
- **It's layout/chrome** → `apps/tauri/src/app-shell/`

### 2.2 Cross-Feature Import Rule

A feature MUST NOT import from another feature's deep path.

```
// ❌ WRONG — vault feature importing from editor feature
// features/vault/hooks/useX.ts
import { useEditor } from "../../editor/hooks/useEditor";

// ✅ CORRECT — vault re-exports what shell needs
// features/vault/index.ts
export { useVaultTree } from "./hooks/useVaultTree";

// ✅ CORRECT — shared wires features together
// shared/useWorkspace.ts
import { useVaultController } from "../features/vault";
import { useTabsStore } from "../features/tabs";
```

Exception: a feature may import **types only** from another feature's `types.ts`, but never re-export them.

### 2.3 Shared Layer Rule

`shared/` owns ALL cross-feature orchestration. If a module imports from 2+ features, it lives in `shared/` — not in either feature, not in `app-shell/`.

```
// ❌ WRONG — orchestration in a feature
// features/tabs/commands.ts
import { useActiveNoteStore } from "../editor";  // cross-feature!

// ✅ CORRECT — orchestration in shared
// shared/paneCommands.ts
import { useActiveNoteStore } from "../features/editor";
import { useTabsStore } from "../features/tabs";
```

Exception: a feature may import **types only** from another feature's `types.ts`, but never re-export them.

### 2.4 File Count Budget per Feature

| Aspect                   | Max | Why                                   |
| ------------------------ | --- | ------------------------------------- |
| Hooks per feature        | 4   | More means too many tiny abstractions |
| Store slices per feature | 2   | Core + persistence. Not 5 files       |
| Barrel exports per index | 15  | Beyond that, the feature is too broad |
| Lines per component      | 200 | Beyond that, extract sub-components   |
| Lines per hook           | 150 | Beyond that, split concerns           |

---

## 3. State Management

### 3.1 The State Decision Tree

```
Local UI state (accordion open, popover show) → useState
Shared UI state (sidebar open, settings panel) → Zustand
Server/data state (tree nodes, search results) → invoke() in hooks
Heavy derived state → useMemo in the hook
```

### 3.2 Zustand Rules

- One store per feature. Not one store per slice.
- Store exports actions + selectors. Components never call `set()` directly.
- Use `useTabsStore(s => s.tabs)` selector pattern, not object destructuring (prevents unnecessary re-renders).
- 🚫 Never create a store that mirrors another store (see: the deleted `editorSessionsStore` anti-pattern).

### 3.3 Sync Store → UI Anti-Pattern

```tsx
// ❌ WRONG — zustand echo chamber
useEffect(() => {
  updateSession(group.id, {
    selected: editor.selected,   // mirrors useEditor() state
    content: editor.content,
    backlinks: editor.backlinks,
    ...
  });
}, [editor.backlinks, editor.content, ...]);

// ✅ CORRECT — pass data through props or read directly from the hook
// If another component needs editor state, lift the hook to a shared parent
```

---

## 4. Component Architecture

### 4.1 UI Components (packages/ui/)

- Props in, DOM out. No Tauri, no IPC, no business logic.
- Internal state allowed: hover, open/close, animation.
- Ref allowed for DOM measurement.
- Event handlers call prop callbacks — never call `invoke()`.

### 4.2 Feature Components (features/)

- Use hooks for all business logic.
- Components are thin — call hooks, pass data to UI primitives.
- 🚫 No `invoke()` calls inside components. Use hooks.

### 4.3 Shell Components (app-shell/)

- Only import from feature `index.ts` files, never deep paths.
- Compose features, pass callbacks between them.
- Keep under 200 lines. If longer, extract sub-components.
- Does NOT contain orchestration logic — that belongs in `shared/`.

---

## 5. Styling

### 5.1 Colors → `--sat-*` Only

```tsx
// ❌ WRONG
<div className="bg-blue-600 text-white">
<div style={{ backgroundColor: '#0f172a' }}>

// ✅ CORRECT
<div className="bg-[var(--sat-surface-1)] text-[var(--sat-text-primary)]">
```

### 5.2 Tailwind → Layout/Spacing Only

```tsx
// ✅ OK — layout & spacing
<div className="flex gap-2 p-4 w-full">

// ❌ WRONG — color via Tailwind
<div className="bg-gray-800 text-white border-gray-700">
```

### 5.3 shadcn → Always Prefer

```
Button, Input, Dialog, ScrollArea, Separator, Tooltip,
ContextMenu, Command, etc.
```

```tsx
// ✅ CORRECT
import { Button } from "@workspace/ui/components/ui/button";
<Button variant="default">Save</Button>

// ❌ WRONG
<button className="px-4 py-2 ...">Save</button>
```

---

## 6. Code to Delete Immediately

When you encounter any of these, remove them — don't leave them for later:

| Pattern                             | Why                                                                                            |
| ----------------------------------- | ---------------------------------------------------------------------------------------------- |
| Stale example files                 | `simple-component.tsx` — not used anywhere                                                     |
| Duplicate component implementations | Two `scroll-area.tsx` files, one in `ui/` and one loose                                        |
| Dead stores                         | Store with no subscribers or only one subscriber that can use context                          |
| Mirror stores                       | Zustand store that copies another hook's state                                                 |
| Unused plugin/extension systems     | `registerSection`/`unregisterSection` with no plugins                                          |
| Console.log fallbacks               | `callback: () => { if (fn) fn(); else console.log(...) }`                                      |
| Re-export chains of >1 hop          | `layout/index.tsx` that just re-exports from features                                          |
| Banner/box comment blocks           | `// ----` ASCII headers + essays → replace with a 1–3 line doc comment on the code itself (§8) |

---

## 7. TypeScript & Performance

### 7.1 Never use `any`

Use `unknown` and narrow with type guards. No escape hatches.

### 7.2 Prefer `interface` over `type` for object types

```tsx
// ✅
export interface TabModel {
  id: TabId;
  path: string;
  // ...
}

// ✅ — only when you need union/intersection
export type SaveStatus = "saved" | "saving" | "unsaved" | "conflict";
```

### 7.3 Virtualize lists over ~100 items

Use `@tanstack/react-virtual` for file trees, search results, backlinks.

### 7.4 Batch IPC calls

Never call `invoke()` N times in a loop when one batched call works.

### 7.5 Lazy-load non-critical panels

```tsx
const SettingsPanel = lazy(() => import("./SettingsPanel"));
<Suspense fallback={null}>
  <SettingsPanel />
</Suspense>;
```

---

## 8. Comments

### 8.1 🚫 No banner/box comments

Never write ASCII-art section headers or boxed essays. They rot out of sync
with the code, they're noise in diffs and greps, and a file-top essay is
skipped by every reader:

```
// ❌ WRONG
// ---------------------------------------------------------------------------
// MarkdownLeaf — the registered "markdown" leaf type (ADR-018 Phase 2).
//
// Performance model:
//   - ONE EditorView for the whole session; documents are swapped via
//     view.setState() ...
// ---------------------------------------------------------------------------
```

```tsx
// ✅ CORRECT — short doc comment on the thing itself
/**
 * Registered "markdown" leaf. One EditorView per session; documents are
 * swapped via setState() so undo history and cursor survive tab switches.
 * Typing never re-renders React — the doc lives in CM6, not component state.
 */
export function MarkdownLeaf({ tab }: { tab: WorkspaceTab }) {
```

### 8.2 What comments are for

A comment answers a question the code raises but can't answer itself:

| Write a comment that...                                     | Example                                                                            |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Explains **why** this approach over the obvious alternative | `setState() not dispatch — history/cursor survive tab switches`                    |
| States an **invariant** other code depends on               | `vault://file-changed means external change only — self-writes suppressed in Rust` |
| Names a **non-obvious constraint**                          | `debounced — stats are O(n), too slow per keystroke`                               |

Never narrate what the next line of code obviously does. If the comment
restates the code, delete it.

### 8.3 ADR references are footnotes, not explanations

`// Per ADR-018 Phase 2, we do X` explains nothing — it outsources the
explanation to another document the reader must go find. State the reasoning
in the comment itself; cite the ADR afterwards as provenance:

```tsx
// ✅ CORRECT — reasoning inline, ADR as a pointer
// One view + setState doc-swap keeps undo/cursor alive across tab switches
// (rationale: ADR-018).

// ❌ WRONG — name-drop instead of explanation
// As decided in ADR-018 Phase 2, this is the registered markdown leaf.
```

A comment must stand alone after the ADR it cites is renamed, superseded,
or forgotten.

---

## 9. File Organization (Current Structure)

```
apps/tauri/src/
├── app-shell/                     # Layout composition (thin glue, no orchestration)
│   ├── Shell.tsx                  # Workspace grid + header band; tab handlers inlined
│   ├── Boot.tsx                   # One-time boot + persistence
│   ├── AppProvider.tsx            # useWorkspace + app context for views (ADR-018)
│   ├── Overlays.tsx               # Lazy modals / context menus
│   ├── Ribbon.tsx                 # Far-left quick-access bar
│   ├── SideDock.tsx               # Generic registry-driven dock (knows no views)
│   ├── ViewHeader.tsx             # Per-leaf chrome band
│   ├── StatusBar.tsx
│   ├── ThemeProvider.tsx
│   ├── registrations.ts           # ★ viewRegistry + leafRegistry entries
│   └── views/                     # Registered dock views (FileExplorer, Backlinks)
├── shared/                        # Cross-feature orchestration (imports 2+ features)
│   ├── useWorkspace.ts            # useWorkspace — the single cross-feature orchestrator
│   └── tabCommands.ts             # Tab commands needing active-note state
├── features/                      # Business logic, one dir per domain, zero cross-imports
│   ├── editor/
│   │   ├── components/            # Host, EditorView, Reading, ContextMenu, InlineTitle, StatusLine
│   │   ├── controller/            # EditorController (+ test)
│   │   ├── hooks/                 # useEditor, useNoteIO, useEditorCommands, useLatestRef
│   │   ├── lib/                   # saveManager, reconcile, pruneCache, stats, frontmatter (+ tests)
│   │   ├── store/                 # activeNote.ts + renameSignal.ts (index barrel)
│   │   ├── commands.ts, types.ts, index.ts
│   ├── tabs/
│   │   ├── components/            # Tabs, TabsBar
│   │   ├── hooks/                 # useTabDnD, useTabPersistence
│   │   ├── store/                 # core.ts + persistence.ts (+ store/index.ts barrel)
│   │   ├── constants.ts, selectors.ts, types.ts, index.ts
│   ├── vault/
│   │   ├── hooks/                 # useVaultTree, useVaultMutations, useVaultController
│   │   ├── components/            # FileTree, BacklinksSidebar, VaultSplash
│   │   ├── types.ts, index.ts
│   ├── search/
│   │   ├── components/            # SearchModal, QuickSwitcher, PreviewPane, SearchResultRows
│   │   ├── store.ts, types.ts, commands.ts, index.ts, benchmark.ts
│   ├── settings/
│   │   ├── components/            # SettingsModal, SettingsNav, SettingsPanel, sections/
│   │   ├── settings-data.ts       # useSettingsStore (values) + useSetting/setSetting
│   │   ├── store.ts               # useSettingsModalStore (modal chrome)
│   │   ├── commands.ts, index.ts
│   └── graph/                     # Graph leaf (useLeafServices only — no direct feature imports)
│       ├── components/            # Graph, GraphControls, GraphContextMenu, GraphWorker, graph_sim.wasm
│       ├── spatialGrid.ts (+ test), nodeScale.ts, index.ts
├── routes/
│   ├── __root.tsx
│   └── index.tsx
└── main.tsx

packages/ui/src/components/
├── ui/                            # shadcn primitives only
├── ribbon/                        # Ribbon + RibbonItem (quick-access bar)
├── sidebar/
├── tabs/
├── file-tree/
├── command-palette/
├── confirm-dialog/
├── input-dialog/
├── palette-shell/
├── header-band/                   # HeaderBandRule (header-band hairline)
└── (no loose files at components/ level)
```

Direction (view registry, leaf types, pane splits) is defined in
[ADR-018](docs/adr/018-registry-driven-workbench.md) — update this section
as phases land.

---

## 10. Commit Message Convention

```
type(scope): description

type: refactor | feat | fix | chore | docs | style | perf
scope: app-shell | editor | tabs | vault | search | settings | ui | packages | rust

Examples:
refactor(app-shell): merge layout/ and workspace/ into app-shell/
feat(editor): add slash-command menu
fix(vault): handle file-tree click race condition
chore(ui): delete duplicate scroll-area.tsx
```

---

## 11. Rust Backend Conventions

The Tauri backend lives in `apps/tauri/src-tauri/` (`src/lib.rs`, `src/commands/`
for IPC handlers, `src/core/` for shared infrastructure, `src/error.rs` for the
command error type). Domain crates under `crates/` (`basalt-parser`,
`basalt-graph`, `basalt-vault`, `basalt-tables`, `basalt-search`) hold the
compute. These rules keep the boundary between the two explicit and consistent.

### 11.1 Where thiserror goes

- **Domain crates** own a `thiserror` enum per fallible concern — e.g.
  `basalt_parser::ParseError`, `basalt_vault::path_utils::PathError`. These are
  rich, matchable types with `#[error("...")]` `Display` impls (thiserror).
- **The command layer** collapses every failure into ONE enum,
  `AppError` (`src/error.rs`), with an `AppResult<T>` alias. Commands return
  `AppResult<T>` — never bare `Result<T, String>`.
- `AppError` implements `From` for its inputs (`String`, `&str`,
  `io::Error`, and the domain enums it wraps) so `?` auto-converts at the
  boundary. Add a `From<MyDomainError>` impl when you wrap a new crate error.

### 11.2 Error-variant granularity

Match the failure, not the message. Pick the most specific `AppError` variant:

- `NoVault` — no vault configured/opened
- `LockPoisoned(&'static str)` — an app-owned `RwLock`/`Mutex` poisoned; carry
  the mutex name (e.g. `AppError::LockPoisoned("vault")`), never `.unwrap()`
- `InvalidVaultPath(io::Error)` — vault root could not be canonicalized
- `Validation(String)` — a path/name/value failed validation (also wraps
  `basalt_vault::path_utils::PathError`)
- `Query(String)` / `Search(String)` — DQL / search failed (also wrap
  `basalt_parser::ParseError`)
- `Io(String)` — a filesystem operation failed
- `Other(String)` — any remaining operational failure (last resort)

Do not reach for `Other` when a specific variant exists, and never thread a raw
`"lock poisoned".to_string()` through `From<String>` — that erases the variant.

### 11.3 Wire contract

`AppError` serializes to its `Display` string (single `serialize_str` of
`self.to_string()`). The frontend consumes errors with
`catch (err) { String(err) }`, so this shape is the contract — do NOT change it
to an object/struct on the wire. Typed matching is internal-only.

### 11.4 Service-method naming over raw state access

Commands read the vault through intent-revealing `Vault` methods (`crates/
basalt-vault/src/vault.rs`), never by reaching into the raw internals
(`vault.graph.metadata_cache`, `vault.arena.*`). The public query surface:

- `note_paths()` — all cached document paths
- `paths_under(prefix)` — a folder plus its descendants (delete/move/rename)
- `note_count()`, `backlinks_for(path)`, `all_tags()`, `metadata(path)`

Rules that follow from this:

- 🚫 No `vault.graph.metadata_cache` iteration or `vault.arena.get_id`/`get_string`
  dance inside `commands/` — that coupling is exactly the smell this rule kills.
- ✅ `basalt-graph`-internal logic (the graph snapshot builder, tests that
  assert graph state) MAY touch `metadata_cache`/`arena` directly; `commands/`
  and ordinary `Vault` users must not.
- If a query recurs in two or more commands, hoist it into a `Vault` method
  with a name describing the INTENT (what it answers), not the mechanism.

### 11.5 src-tauri module layout

- `commands/*.rs` — one file per concern (notes, folders, assets, files, vault,
  boot, query, search, settings, …). Each `#[tauri::command]` is a thin wrapper;
  heavy logic lives in a `*_impl` sibling so it is unit-testable without a
  `State`.
- `core/` — shared application infrastructure (`app_state`, `cache`, `config`,
  `watcher`, `workspace`). Re-exported at the crate root (`pub use core::*`) so
  established `crate::cache` paths stay stable.
- `error.rs` — `AppError` + `AppResult` only.
- Testable helpers that don't need `State` take `&AppState` (or plain
  arguments), letting tests drive them with a real temp vault.

---

## 12. Rust Code Quality & Structure (crates/)

These rules apply to all domain crates under `crates/` (`basalt-*`). They exist
to keep files readable, errors honest, and hot paths fast. Full rationale in
[ADR-030](docs/adr/030-rust-crates-quality-refactor.md).

### 12.1 File & function budgets

God modules are the #1 maintainability failure we hit. Enforce hard budgets:

| Unit       | Soft limit | Smell threshold (must split) |
| ---------- | ---------- | ---------------------------- |
| File       | ≤ 450 loc  | 500+ loc                     |
| Function   | ≤ 40 loc   | 90+ loc, deep nesting, 2+ abstraction levels |
| `impl` block | one concern | mixed unrelated behavior |
| Match arm  | a few lines | mini-program inside each arm |

Split a file when: nesting deepens, control flow is hard to scan, a function
both decides policy and performs mechanics, or variable lifetimes get long.

- Prefer the **modern `foo.rs` + `foo/`** module layout over `mod.rs` (avoids
  many `mod.rs` files).
- `lib.rs` is **small and intentional** — `pub mod` + `pub use` re-exports only;
  internals stay private or `pub(crate)`.
- **`pub(crate)` over bare `pub`** for internal helpers — shrink the public
  surface, let the compiler enforce it.

### 12.2 Error handling

Already covered in §11 (thiserror per crate, `anyhow` at the app boundary).
Additions for library code:

- **Never** return `Result<T, String>`.
- **No silent degradation** in library code: ban `.unwrap_or_default()` /
  `.ok()` / `let _ = result` that swallows a real failure in library crates.
  Return a typed error or `tracing::warn!` at minimum.
- **Panics are a bug or a provable invariant.** `expect("reason")`, never bare
  `unwrap()`, and never on user-controllable state (e.g. a group that a future
  code path could create empty).
- Add `#[must_use]` on public fallible/`Result`/`Option` returns and key value
  types.

### 12.3 Newtypes & the type system

- Make important domain scalars **newtypes**, not aliases: `NodeId` is
  `pub struct NodeId(u32)`, never `pub type NodeId = u32`. A bare alias means
  any `u32` is accepted where the domain type is expected.
- Encode invariants in types: a validated `new()`/`try_new()` constructor so
  empty/invalid states are unrepresentable (e.g. `FieldRef` → guaranteed
  non-empty).
- Replace `String` closed-sets with serialized **enums** (e.g.
  `QueryColumn.type_` is `Text|Number|Date|Checkbox|Link|List`, not `String`).
- Keep public enums that grow `#[non_exhaustive]` so downstream `match`es are
  forced to handle new variants.
- **Borrow-by-default APIs**: take `&str`/`&[T]`, return `&str`/`Cow<'_, str>`
  where ownership isn't required; reserve `String` for long-lived storage.

### 12.4 Macros — judicious, not clever

- **Function/generic first**, then `macro_rules!`, then (rarely) proc macros.
- Prefer `macro_rules!` over custom proc macros — no `syn`/`quote`/build cost.
- Keep expansions small, Rust-shaped, and free of nonlocal control flow and
  repeated-expansion side effects.
- Use macros only for syntax a function can't produce (an enum↔string mapping
  that must stay in sync with the data type is a good candidate).

### 12.5 Performance

The expensive line rarely looks expensive — it's a `format!`, `to_string()`,
or `.clone()` **inside a loop**. Measure before optimizing (Criterion at both
5k **and 25k** fixtures; `cargo flamegraph` to confirm the target is hot).

- **Reuse / pre-size collections**: `with_capacity`, `.clear()` reuse, scratch
  buffers as struct fields instead of fresh `Vec`s per call/frame.
- **Zero-copy / borrow** in hot paths: return `&str`/`Cow`, use
  `eq_ignore_ascii_case` instead of `to_lowercase()`, avoid double
  `to_string()`.
- **Algorithmic before micro**: prefer O(N) / O(log n) over quadratic
  (HashMap-indexed grouping, `partition_point` over linear `.position()`).
- **Keep telemetry off the hot path**; don't build strings on the success path.

### 12.6 DRY — no duplicate knowledge

One source of truth per concept; when the same logic lives in two places it
diverges:

- **One typed-value model** — `TypedValue` is the single cell-value type; never
  define a parallel value enum.
- **One converter** per domain (YAML → typed lives once, in `basalt-types`).
- **One date classifier**, **one frontmatter-fence detector**, **one
  `stem_from_path`**, **one wikilink scanner** — shared helpers, never copy-paste.
- If two functions become character-identical except a field or arg, extract a
  helper parameterized by that difference.

### 12.7 Lint / tooling hygiene

- `cargo fmt --all` on every commit.
- Keep `clippy.toml` at the workspace root with committed thresholds
  (`cognitive-complexity-threshold`, `too-many-arguments-threshold`,
  `type-complexity-threshold`).
- CI runs clippy with `-D warnings`. Enable `clippy::perf` (unnecessary
  allocs/clones) and the `cognitive-complexity` lint deliberately; do **not**
  blanket-enable all of `pedantic`.
