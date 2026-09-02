# @workspace/views — View & Leaf Registries (ADR-018)

Registries that let the shell render its workbench from **registrations, not
hardcoded imports**. Two kinds of contribution live here:

- **Views** — side-dock panels (`viewRegistry`, ADR-018 Phase 1)
- **Leaves** — tab-content types (`leafRegistry`, ADR-018 Phase 2)

Plus `LeafServicesProvider` — the "app object" seam through which leaves read
cross-feature state without importing feature stores.

## When to use which

| Concept  | Registry       | Lines up with       | Where it renders       |
| -------- | -------------- | ------------------- | ---------------------- |
| **View** | `viewRegistry` | Sidebar / side dock | `SideDock` (app-shell) |
| **Leaf** | `leafRegistry` | A tab's content     | `Shell.renderPane`     |

**Lexicon** (anchored to ADR-018 / VS Code): a _view_ is a side-dock panel
(file explorer, backlinks); a _leaf_ is the kind of content a tab renders
(markdown, graph, later html). They are distinct concepts.

## Architecture

```
packages/views/
├── registry.ts        # ViewRegistry + viewRegistry singleton
├── leaf.tsx           # LeafRegistry + LeafServicesProvider + LeafProps
├── types.ts           # ViewDescriptor, ViewSide, ViewIconType, ...
└── index.ts           # public API barrel (import ONLY from here)
```

The registries follow the same pattern as `@workspace/commands`: providers
register by string key; consumers look up by string key. The registries never
import from features — registration happens in the shell's explicit boot-time
list (`apps/tauri/src/app-shell/registrations.ts`), so the set of live
views/leaves is deterministic.

## ViewRegistry (side docks)

```ts
import { viewRegistry } from "@workspace/views";

viewRegistry.register({
  type: "file-explorer", // stable unique id
  name: "File explorer", // human-readable
  icon: IconFile,
  side: "left", // "left" | "right"
  component: FileExplorer, // self-contained, reads app context
  headerActions: FileExplorerHeaderActions, // optional, rendered in dock header
});
```

API: `register(view)`, `unregister(type)`, `get(type)`,
`getBySide(side)` (all views for a side in registration order), `getAll()`.
`SideDock` renders `viewRegistry.getBySide(side)`.

`ViewDescriptor` fields: `type`, `name`, `icon` (Tabler-icon compatible
`ComponentType<{size?, stroke?}>`), `side`, `component`
(`ComponentType<Record<string, never>>`), optional `headerActions`.

## LeafRegistry (tab content)

```ts
import { leafRegistry } from "@workspace/views";

leafRegistry.register({
  type: "markdown",
  name: "Markdown",
  extensions: [".md", ".markdown"],
  component: EditorView, // receives { tab }
});
```

API: `register(leaf)`, `unregister(type)`, `get(type)`,
`leafTypeForPath(path)` (resolve a path to a leaf type via its `extensions`),
`getAll()`. Tabs carry a `leafType` resolved at creation time from the file
extension.

`LeafDescriptor` fields: `type`, `name`, optional `icon`, `extensions`,
`component: ComponentType<LeafProps>` where `LeafProps = { tab: LeafTabInfo }`.

`LeafTabInfo` is the minimal structural tab info passed to a leaf
(`id`, `path`, `title`, optional `viewMode`, transient `line` and
`renameOnOpen`). The tabs feature's `TabModel` is assignable to it.

### LeafProps example

```ts
function EditorView({ tab }: LeafProps) {
  const services = useLeafServices();
  // tab.id / tab.path / tab.title ...
}
```

## LeafServices — the app object for leaves

Leaves stay decoupled from feature stores by reading only through
`useLeafServices()`, provided by `<LeafServicesProvider services={...}>`
(wrapped around leaf content by the shell). Its role is Obsidian's `app`
object.

| Member                      | Purpose                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------- |
| `openNote(path)`            | Open a note in a (preview) tab — wikilinks, backlinks, search                         |
| `markTabDirty(id, b)`       | Flip a tab's dirty flag in the tabs store                                             |
| `findNote(name)`            | Resolve a wikilink target / note name to `{name, path}`                               |
| `getOpenTabIds()`           | Snapshot of every open tab id (per-tab cache pruning)                                 |
| `getOpenTabPaths()`         | Snapshot of every open tab note path (path-based pruning)                             |
| `getTabInfo(id)`            | Live `{path, title}` for a tab id, or `null` if closed                                |
| `onTabStructureChanged(cb)` | Subscribe to structural tab mutations (open/close/pin/rename), returns unsubscribe    |
| `activeNote`                | Active note `{path, name}` or `null` (e.g. graph's local-graph root)                  |
| `openPinned(note, opts?)`   | Open a note as a pinned (non-preview) tab, returns tab id                             |
| `renameNote(tab, newName)`  | Rename the note behind a tab; repoints path/title, refreshes tree, rewrites wikilinks |

```ts
function useLeafServices(): LeafServices {
  const services = useContext(LeafServicesContext);
  if (!services)
    throw new Error("useLeafServices must be used within LeafServicesProvider");
  return services;
}
```

## Adding a new panel or leaf

1. Implement the component (view: `ComponentType<Record<string, never>>` that
   reads `useAppContext()`; leaf: `ComponentType<LeafProps>`).
2. Register it in `apps/tauri/src/app-shell/registrations.ts`:
   `viewRegistry.register(...)` or `leafRegistry.register(...)` (lazy-load
   heavy leaves via `React.lazy`).
3. Done — no shell surgery. New features and future plugins use the identical
   registration path.

## Types

- `ViewSide` (`"left" | "right"`), `ViewIconType`, `ViewHeaderActionsType`
- `ViewDescriptor`
- `LeafProps`, `LeafTabInfo`, `LeafDescriptor`, `LeafServices`, `RenameResult`
