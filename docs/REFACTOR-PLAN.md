# Basalt Refactor Plan — Editor, UI & Theme Packages

> **Created**: 2025-02-25  
> **Status**: Planning (not yet started)  
> **Scope**: `packages/editor`, `packages/ui`, NEW `packages/theme`

---

## Table of Contents

1. [Why This Refactor](#1-why-this-refactor)
2. [Current Problems (Detailed)](#2-current-problems-detailed)
3. [Target Architecture](#3-target-architecture)
4. [Phase 0 — Create `packages/theme`](#4-phase-0--create-packagestheme)
5. [Phase 1 — Rewrite CommandPalette with shadcn Command](#5-phase-1--rewrite-commandpalette-with-shadcn-command)
6. [Phase 2 — Clean the Editor Package](#6-phase-2--clean-the-editor-package)
7. [Phase 3 — Rewrite FileTree & Swap ContextMenu](#7-phase-3--rewrite-filetree--swap-contextmenu)
8. [What NOT to Touch](#8-what-not-to-touch)
9. [Validation Checklist](#9-validation-checklist)

---

## 1. Why This Refactor

The `packages/editor` and `packages/ui` packages accumulated tech debt from rapid prototyping.
The core CodeMirror plugin architecture (decorations, live-preview) is solid, but the wiring
layer — how the editor, commands, and UI interlock — is messy. This refactor fixes structural
problems **without rewriting** the working CodeMirror logic.

### Goals

- **Single source of truth** for every concern (commands, themes, types)
- **Clean dependency graph**: `theme` → `ui` → `features` → `app-shell` (no circular imports)
- **Editor package becomes headless**: exports CodeMirror extensions, NOT React components
- **UI package becomes dumb**: props in, DOM out, zero editor/Tauri imports
- **Themes become independent**: own package, own build, ready for community themes later

---

## 2. Current Problems (Detailed)

### 2.1 Duplicate Command Registration

There are **TWO files** that register the exact same editor commands:

| File | Lines | Commands |
|------|-------|----------|
| `packages/editor/src/hooks/use-editor-commands.tsx` | 261 | Bold, Italic, Strikethrough, H1-H3, WikiLink, External Link, Select All, Cut, Copy, Paste |
| `packages/ui/src/components/editor-commands.tsx` | 194 | Bold, Italic, Strikethrough, H1-H3, Cut, Copy, Select All |

The editor version has **better logic** (toggle unwrap, `selectAll` via CM6 command).
The ui version is a naive duplicate. Both call `useCommand()` from the same registry.

**Action**: Delete `packages/ui/src/components/editor-commands.tsx` entirely.

### 2.2 Circular Dependency: ui ↔ editor

```
packages/ui/src/components/CommandPalette.tsx
  → import type { Command } from "../../../editor/src/commands/registry"
  → import { useCommandRegistry } from "../../../editor/src/commands/context"

packages/ui/src/components/editor-commands.tsx
  → import { useCommand } from "../../../editor/src/commands/context"

packages/editor/src/index.tsx
  → import { CommandPalette } from "../../ui/src/components/CommandPalette"
  → import { ContextMenu, ... } from "@workspace/ui/components/ui/context-menu"
```

Neither package can exist without the other. This violates the three-layer architecture
defined in `.agents/workflows/ui-rules.md`.

### 2.3 Editor `index.tsx` is a God Component (247 lines)

`packages/editor/src/index.tsx` currently handles:
- ✅ Configuring CodeMirror extensions (correct, should stay)
- ❌ Rendering `<ContextMenu>` with full React UI tree
- ❌ Rendering `<CommandPalette />`
- ❌ Grouping commands by category for the context menu
- ❌ Managing `menuState` for context menu positioning
- ❌ Wrapping everything in `<CommandProvider>`

### 2.4 CommandPalette Doesn't Use cmdk

`cmdk` (v1.1.1) is in `packages/ui/package.json` but **never imported**.
The `CommandPalette.tsx` (249 lines) is a hand-rolled fuzzy search + keyboard
navigation component. shadcn's `Command` wraps cmdk and would reduce this to ~50 lines.

### 2.5 Two Headless UI Libraries

| Library | Used by |
|---------|---------|
| `@base-ui/react` | ContextMenu only |
| `@radix-ui/react-*` | ScrollArea, Dialog, Slot |

shadcn generates Radix components. `@base-ui/react` is the outlier and should be removed.

### 2.6 Themes/Tokens Are Inside ui Package

`packages/ui/` contains both visual components AND design system infrastructure:
- `theme/` — 7 theme JSON files + manifest.ts
- `tokens/` — 4 token JSONs + a 7.4KB build script
- `src/styles/` — globals.css (9.8KB), editor.css, tokens.d.ts

These are a separate concern and deserve their own package.

### 2.7 Editor Theme Styles Are Scattered

CodeMirror theme declarations are spread across 6+ files:
- `editor/src/theme.ts` — base theme + highlight override
- `editor/src/plugins/live-preview.ts` — aggregates decoration themes
- `editor/src/plugins/suggestions.ts` — SUGGESTIONS_THEME (48 lines inline)
- `editor/src/plugins/task-list.ts` — TASK_CHECKBOX_THEME
- Each file in `editor/src/plugins/decorations/` exports its own theme

### 2.8 FileTree Was "Vibecoded"

`apps/tauri/src/features/vault/components/FileTree.tsx` (4.8KB) and
`FileTreeNode.tsx` (4.6KB) were quickly written without:
- shadcn primitives (no ScrollArea usage)
- Virtualization (will choke on large vaults)
- Proper separation (should have a dumb primitive in `packages/ui/`)

### 2.9 Dead Dependencies

`packages/editor/package.json` lists unused dependencies:
- `react-markdown` — never imported
- `remark-gfm` — never imported
- `@codemirror/theme-one-dark` — never imported

### 2.10 Sloppy Comments

- `theme.ts` line 32: `// Use this to Override default Configuration of COdemirro`
- `index.tsx` lines 42-51: 10-line "ARCHITECTURE NOTE" block comment that describes
  what should be in a README, not inline code

---

## 3. Target Architecture

### 3.1 Package Dependency Graph

```
packages/theme     ← pure data + build (no runtime deps)
     ↓ CSS vars
packages/ui        ← dumb visual components (shadcn + custom)
     ↓ components
packages/editor    ← headless CodeMirror extensions (NO React rendering)
     ↓ extensions
apps/tauri/src/features/  ← business logic, Tauri IPC, wiring
     ↓ features
apps/tauri/src/app-shell/ ← layout composition
```

### 3.2 Target File Structure

#### `packages/theme/` (NEW)
```
packages/theme/
├── package.json                # @workspace/theme
├── tsconfig.json
├── tokens/
│   ├── base.json               # Primitive tokens (colors, spacing, radii)
│   ├── semantic.json           # Semantic mappings (surface, text, accent)
│   ├── component.json          # Component-level tokens (shadcn overrides)
│   └── schema.json             # Token validation schema
├── themes/
│   ├── catppuccin-latte.json
│   ├── catppuccin-mocha.json
│   ├── dracula.json
│   ├── solarized-dark.json
│   ├── solarized-light.json
│   └── manifest.ts             # Theme registry + ThemeDefinition type
├── build.ts                    # Token → CSS var generator
└── src/
    ├── index.ts                # Re-exports types + manifest
    ├── types.ts                # ThemeDefinition, TokenSchema, SatTokens
    └── generated/
        └── tokens.css          # Generated --sat-* custom properties
```

#### `packages/editor/src/` (CLEANED)
```
packages/editor/src/
├── index.ts                    # Re-exports. NO React component.
├── create-extensions.ts        # Factory: (config) → Extension[]
├── types.ts                    # EditorConfig, FetchLinksFn, FetchTagsFn, etc.
│
├── commands/
│   ├── registry.ts             # CommandRegistry class (KEEP AS-IS)
│   ├── context.tsx             # CommandProvider + useCommand hooks (KEEP AS-IS)
│   └── editor-commands.ts      # THE single source of truth for all editor commands
│                                 (merged from hooks/use-editor-commands.tsx)
│
├── extensions/                 # Renamed from "plugins/" for clarity
│   ├── live-preview/
│   │   ├── index.ts            # Orchestrator (current live-preview.ts logic)
│   │   ├── collector.ts        # makeCollector() extracted
│   │   └── decorations/        # KEEP AS-IS — this is already well-structured
│   │       ├── headings.ts
│   │       ├── code-blocks.ts
│   │       ├── blockquotes.ts
│   │       ├── inline-marks.ts
│   │       ├── mark-hiding.ts
│   │       └── types.ts
│   │
│   ├── wiki-links.ts           # Parser + click handler (renamed from links.ts)
│   ├── task-list.ts            # KEEP AS-IS
│   ├── suggestions.ts          # KEEP logic, extract theme constant
│   └── backticks.ts            # KEEP AS-IS
│
└── themes/                     # ALL CodeMirror EditorView.baseTheme() in one place
    ├── base.ts                 # Structural: padding, font, cursor, scroller
    ├── decorations.ts          # Aggregated HEADINGS_THEME + CODE_BLOCKS_THEME etc.
    ├── suggestions.ts          # Autocomplete popup theme
    └── task-list.ts            # Task checkbox theme
```

#### `packages/ui/src/` (CLEANED)
```
packages/ui/src/
├── index.css                   # Tailwind directives
├── lib/
│   └── utils.ts                # cn() helper (KEEP AS-IS)
├── styles/
│   ├── globals.css             # Global styles (KEEP, but remove token definitions
│   │                             that move to packages/theme)
│   └── editor.css              # Editor-specific CSS overrides
│
└── components/
    ├── ui/                     # shadcn primitives (auto-generated, don't edit)
    │   ├── button.tsx
    │   ├── command.tsx          # NEW — shadcn Command (wraps cmdk)
    │   ├── context-menu.tsx     # REWRITTEN — switch to @radix-ui/react-context-menu
    │   ├── dialog.tsx           # NEW — needed for command palette overlay
    │   ├── scroll-area.tsx      # KEEP AS-IS
    │   └── separator.tsx        # KEEP AS-IS
    │
    ├── command-palette/         # NEW — generic command palette
    │   ├── CommandPalette.tsx   # Props-driven: commands[], onSelect, open, onOpenChange
    │   └── index.ts             # Re-export
    │
    └── file-tree/               # NEW — dumb tree primitives
        ├── FileTree.tsx         # Props: nodes[], onSelect, onExpand
        ├── FileTreeNode.tsx     # Single node renderer
        └── index.ts             # Re-export
```

#### `apps/tauri/src/features/` (NEW: editor feature)
```
apps/tauri/src/features/
├── editor/                      # NEW feature module
│   ├── types.ts                 # Feature-level types
│   ├── hooks/
│   │   ├── useEditor.ts         # MOVED from vault/hooks/ — editor lifecycle
│   │   └── useEditorCommands.ts # Wires editor commands to registry
│   ├── components/
│   │   ├── EditorView.tsx       # <CodeMirror> + createExtensions() + theme
│   │   ├── EditorContextMenu.tsx # ContextMenu rendering + command wiring
│   │   └── EditorCommandPalette.tsx # CommandPalette + CommandProvider wiring
│   └── index.ts
│
├── vault/                       # Simplified — vault/file concerns only
│   ├── types.ts                 # KEEP
│   ├── hooks/
│   │   ├── useVaultActions.ts   # KEEP
│   │   └── useVaultTree.ts      # KEEP
│   ├── components/
│   │   ├── FileTree.tsx         # Uses ui/file-tree primitives + vault hooks
│   │   ├── FileTreeNode.tsx     # REMOVE (logic moves to ui/file-tree + this wiring)
│   │   ├── BacklinksSidebar.tsx # KEEP
│   │   ├── SaveIndicator.tsx    # KEEP
│   │   ├── Toolbar.tsx          # KEEP
│   │   └── VaultSplash.tsx      # KEEP
│   └── index.ts
```

---

## 4. Phase 0 — Create `packages/theme`

**Goal**: Move all theme/token infrastructure out of `packages/ui` into its own package.

### Steps

#### 4.1 Create the package skeleton

```bash
mkdir -p packages/theme/src/generated
mkdir -p packages/theme/tokens
mkdir -p packages/theme/themes
```

Create `packages/theme/package.json`:
```json
{
  "name": "@workspace/theme",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./manifest": "./themes/manifest.ts",
    "./tokens.css": "./src/generated/tokens.css"
  },
  "scripts": {
    "build:tokens": "bun run build.ts"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5.0.0"
  }
}
```

Create `packages/theme/tsconfig.json` (copy pattern from ui's tsconfig).

#### 4.2 Move files from `packages/ui/`

| Source (in `packages/ui/`) | Destination (in `packages/theme/`) |
|---|---|
| `tokens/base.json` | `tokens/base.json` |
| `tokens/semantic.json` | `tokens/semantic.json` |
| `tokens/component.json` | `tokens/component.json` |
| `tokens/schema.json` | `tokens/schema.json` |
| `tokens/build.ts` | `build.ts` |
| `theme/catppuccin-latte.json` | `themes/catppuccin-latte.json` |
| `theme/catppuccin-mocha.json` | `themes/catppuccin-mocha.json` |
| `theme/dracula.json` | `themes/dracula.json` |
| `theme/light.json` | `themes/light.json` |
| `theme/dark.json` | `themes/dark.json` |
| `theme/solarized-dark.json` | `themes/solarized-dark.json` |
| `theme/solarized-light.json` | `themes/solarized-light.json` |
| `theme/manifest.ts` | `themes/manifest.ts` |
| `src/styles/tokens.d.ts` | `src/types.ts` (merge into) |

#### 4.3 Create `packages/theme/src/index.ts`

```ts
export * from "./types";
export { themeManifest, type ThemeDefinition } from "../themes/manifest";
```

#### 4.4 Update imports across the codebase

Find all imports of `@workspace/ui/theme/manifest` and change to `@workspace/theme/manifest`.

Search for any imports referencing the moved token/theme files and update.

#### 4.5 Update `packages/ui/package.json`

- Remove the `"./theme/manifest"` export
- Remove `tokens/` and `theme/` directories (now empty)
- Remove the `"build:tokens"` script (moved to theme package)
- Add `@workspace/theme` as a dependency if styles reference generated CSS

#### 4.6 Update workspace config

Add `packages/theme` to the workspace `packages` array in the root
`package.json` or `bun` workspace config (check which is used).

#### 4.7 Verify

```bash
cd packages/theme && bun run build:tokens  # Token build still works
cd apps/tauri && bun run dev               # App still starts
```

---

## 5. Phase 1 — Rewrite CommandPalette with shadcn Command

**Goal**: Replace the hand-rolled CommandPalette with shadcn's `Command` component.
This eliminates the `ui → editor` circular dependency.

### Steps

#### 5.1 Add shadcn Command component to `packages/ui`

```bash
cd packages/ui
npx shadcn@latest add command dialog
```

This generates `src/components/ui/command.tsx` and `src/components/ui/dialog.tsx`.
Both are built on `cmdk` (already in package.json) and `@radix-ui/react-dialog`.

#### 5.2 Create `packages/ui/src/components/command-palette/CommandPalette.tsx`

New props-driven component:

```tsx
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "../ui/command";
import { Dialog, DialogContent } from "../ui/dialog";

export interface CommandItem {
  id: string;
  name: string;
  icon?: React.ReactNode;
  shortcut?: string;
  category?: string;
}

export interface CommandPaletteProps {
  commands: CommandItem[];
  onSelect: (id: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  placeholder?: string;
}

export function CommandPalette({ commands, onSelect, open, onOpenChange, placeholder }: CommandPaletteProps) {
  // Group commands by category
  const grouped = groupByCategory(commands);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="...">
        <Command>
          <CommandInput placeholder={placeholder ?? "Type a command..."} />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            {Object.entries(grouped).map(([category, cmds]) => (
              <CommandGroup key={category} heading={category}>
                {cmds.map(cmd => (
                  <CommandItem key={cmd.id} onSelect={() => { onSelect(cmd.id); onOpenChange(false); }}>
                    {cmd.icon}
                    <span>{cmd.name}</span>
                    {cmd.shortcut && <span className="...">{cmd.shortcut}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
```

**Key**: This component has ZERO imports from `@workspace/editor`. It receives
everything via props.

#### 5.3 Create `packages/ui/src/components/command-palette/index.ts`

```ts
export { CommandPalette, type CommandPaletteProps, type CommandItem } from "./CommandPalette";
```

#### 5.4 Delete the old files

- **DELETE** `packages/ui/src/components/CommandPalette.tsx` (the 249-line hand-rolled version)
- **DELETE** `packages/ui/src/components/editor-commands.tsx` (the duplicate command registration)

#### 5.5 Create `apps/tauri/src/features/editor/components/EditorCommandPalette.tsx`

This is the **wiring** component that connects the dumb UI to the editor's command registry:

```tsx
import { CommandPalette } from "@workspace/ui/components/command-palette";
import { useCommandRegistry } from "@workspace/editor/commands/context";
import { useState, useEffect } from "react";

export function EditorCommandPalette() {
  const { commands, execute } = useCommandRegistry();
  const [open, setOpen] = useState(false);

  // Global Ctrl+P listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "p") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <CommandPalette
      commands={commands.map(c => ({
        id: c.id,
        name: c.name,
        icon: c.icon,
        shortcut: c.hotkeys?.[0],
        category: c.category,
      }))}
      onSelect={execute}
      open={open}
      onOpenChange={setOpen}
    />
  );
}
```

#### 5.6 Update `packages/ui/package.json`

After deleting the old CommandPalette, `@base-ui/react` may no longer be needed
(check if context-menu is the only user — if so, it gets removed in Phase 3).
Remove `cmdk` from `dependencies` if shadcn's command.tsx handles the import internally
(it does — cmdk becomes a transitive dep).

#### 5.7 Verify

```bash
cd apps/tauri && bun run dev
# Open app → Ctrl+P → command palette opens with all commands
# Right-click → context menu still works (separate concern, untouched here)
```

---

## 6. Phase 2 — Clean the Editor Package

**Goal**: Make `packages/editor` export **only** CodeMirror extensions and command
infrastructure. No React rendering. No UI imports.

### Steps

#### 6.1 Create `packages/editor/src/types.ts`

Extract all shared types:

```ts
import type { Extension } from "@codemirror/state";

export type FetchLinksFn = (query: string) => Promise<Array<{ name: string; path: string }>>;
export type FetchTagsFn = (query: string) => Promise<string[]>;

export interface EditorConfig {
  onFetchLinks?: FetchLinksFn;
  onFetchTags?: FetchTagsFn;
  onOpenLink?: (link: string) => void;
  themeExtensions?: Extension[];
  includeDefaultTheme?: boolean;
}
```

#### 6.2 Create `packages/editor/src/create-extensions.ts`

Factory function that replaces the `editorExtensions` useMemo in index.tsx:

```ts
import type { Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { closeBrackets } from "@codemirror/autocomplete";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import type { EditorConfig } from "./types";
import { wikiLinkExtension, clickableLinksPlugin } from "./extensions/wiki-links";
import { livePreviewPlugin, LIVE_PREVIEW_THEME } from "./extensions/live-preview";
import { taskListPlugin, TASK_CHECKBOX_THEME } from "./extensions/task-list";
import { createSuggestionsPlugin, SUGGESTIONS_THEME } from "./extensions/suggestions";
import { backticksKeymap } from "./extensions/backticks";
import { CUSTOM_THEME } from "./themes/base";

export function createEditorExtensions(config: EditorConfig): Extension[] {
  const { onFetchLinks, onFetchTags, onOpenLink, themeExtensions, includeDefaultTheme = true } = config;

  const themeStack: Extension[] = [];
  if (themeExtensions) themeStack.push(...themeExtensions);
  if (includeDefaultTheme) themeStack.push(CUSTOM_THEME);

  return [
    markdown({ base: markdownLanguage, codeLanguages: languages, extensions: [wikiLinkExtension] }),
    ...themeStack,
    TASK_CHECKBOX_THEME,
    taskListPlugin,
    LIVE_PREVIEW_THEME,
    livePreviewPlugin,
    closeBrackets(),
    keymap.of(backticksKeymap),
    SUGGESTIONS_THEME,
    createSuggestionsPlugin(onFetchLinks, onFetchTags),
    clickableLinksPlugin(onOpenLink),
    EditorView.lineWrapping,
  ];
}
```

#### 6.3 Rename `plugins/` → `extensions/`

```bash
cd packages/editor/src
mv plugins extensions
```

Update all internal imports (`./plugins/` → `./extensions/`).

Also rename `links.ts` → `wiki-links.ts` for clarity.

#### 6.4 Consolidate editor themes into `themes/` directory

Create `packages/editor/src/themes/` directory:

- Move `theme.ts` → `themes/base.ts`
  - Clean up the comment: `// Use this to Override default Configuration of COdemirro` → proper JSDoc
- Create `themes/decorations.ts` — move the aggregated `LIVE_PREVIEW_THEME` array here
- Create `themes/suggestions.ts` — extract `SUGGESTIONS_THEME` from `extensions/suggestions.ts`
- Create `themes/task-list.ts` — extract `TASK_CHECKBOX_THEME` from `extensions/task-list.ts`

Each extension file will then import its theme from `../themes/`.

> **Note**: The individual decoration theme exports (`HEADINGS_THEME`, `CODE_BLOCKS_THEME`, etc.)
> remain in their decoration handler files because they're tightly coupled to the CSS class names
> those handlers emit. The `themes/decorations.ts` file just re-aggregates them.

#### 6.5 Merge command files — single source of truth

The ONE file for editor commands: `packages/editor/src/commands/editor-commands.ts`

- Content: merge from `packages/editor/src/hooks/use-editor-commands.tsx` (the better version)
- **DELETE** `packages/editor/src/hooks/use-editor-commands.tsx`
- **DELETE** `packages/editor/src/hooks/` directory (now empty)
- **DELETE** `packages/ui/src/components/editor-commands.tsx` (duplicate — already done in Phase 1)

#### 6.6 Rewrite `packages/editor/src/index.ts`

The new index is a CLEAN re-export file (no React component):

```ts
// Extension factory
export { createEditorExtensions } from "./create-extensions";

// Types
export type { EditorConfig, FetchLinksFn, FetchTagsFn } from "./types";

// Command system
export { CommandRegistry, type Command, globalCommandRegistry } from "./commands/registry";
export { CommandProvider, useCommandRegistry, useCommand } from "./commands/context";

// Pre-wired command definitions (for features that want to register editor commands)
export { useEditorCommands } from "./commands/editor-commands";

// Themes (for apps that want to compose their own theme stack)
export { CUSTOM_THEME } from "./themes/base";
```

**Key**: No `<Editor>` React component exported. No `<ContextMenu>`. No `<CommandPalette>`.

#### 6.7 Delete the context-menu plugin

**DELETE** `packages/editor/src/extensions/context-menu.ts` (was `plugins/context-menu.ts`).

The context menu is a UI concern. The right-click handling moves to the features layer:
`apps/tauri/src/features/editor/components/EditorContextMenu.tsx`.

That component will use `EditorView.domEventHandlers({ contextmenu: ... })` as
an additional extension passed via config, keeping it out of the editor package.

#### 6.8 Create `apps/tauri/src/features/editor/`

New feature module that replaces what `index.tsx` used to do:

```
apps/tauri/src/features/editor/
├── types.ts
├── hooks/
│   └── useEditor.ts            # MOVED from features/vault/hooks/useEditor.ts
├── components/
│   ├── EditorView.tsx          # <CodeMirror> wrapper using createEditorExtensions()
│   ├── EditorContextMenu.tsx   # Right-click menu wired to commands
│   └── EditorCommandPalette.tsx # (created in Phase 1)
└── index.ts                    # Re-exports
```

`EditorView.tsx` is the new home for the `<CodeMirror>` component:

```tsx
import CodeMirror from "@uiw/react-codemirror";
import { createEditorExtensions } from "@workspace/editor";
import { CommandProvider } from "@workspace/editor/commands/context";
// ... useEditor hooks, context menu, command palette wiring
```

#### 6.9 Update `packages/editor/package.json`

Remove unused dependencies:
- `react-markdown`
- `remark-gfm`
- `@codemirror/theme-one-dark`

Update exports:
```json
{
  "exports": {
    ".": "./src/index.ts",
    "./commands/registry": "./src/commands/registry.ts",
    "./commands/context": "./src/commands/context.tsx",
    "./commands/editor-commands": "./src/commands/editor-commands.ts",
    "./themes/*": "./src/themes/*.ts"
  }
}
```

#### 6.10 Remove the big comment block from what was index.tsx

Lines 42-51 of the old `index.tsx` — the "BASALT EDITOR ARCHITECTURE NOTE" —
should be removed. Architecture documentation belongs in docs, not inline.

#### 6.11 Verify

```bash
cd apps/tauri && bun run dev
# Editor renders correctly
# Live preview works (headings, code blocks, inline marks)
# WikiLinks clickable
# Task checkboxes toggle
# Ctrl+P opens command palette
# Right-click opens context menu
# Autocomplete suggestions work ([[links, #tags)
```

---

## 7. Phase 3 — Rewrite FileTree & Swap ContextMenu

**Goal**: Bring FileTree and ContextMenu up to production quality.

### 7.1 Swap ContextMenu to Radix

#### Steps

1. Add shadcn context-menu:
   ```bash
   cd packages/ui
   npx shadcn@latest add context-menu
   ```
   This generates a new `context-menu.tsx` based on `@radix-ui/react-context-menu`.

2. Overwrite `packages/ui/src/components/ui/context-menu.tsx` with the shadcn version.

3. Ensure the component API is compatible (or update usages in EditorContextMenu.tsx).

4. Remove `@base-ui/react` from `packages/ui/package.json` if no other component uses it.

5. Verify all context menu functionality works.

### 7.2 Rewrite FileTree

#### 7.2.1 Create dumb primitives in `packages/ui/`

```
packages/ui/src/components/file-tree/
├── FileTree.tsx          # ScrollArea + virtualized list container
├── FileTreeNode.tsx      # Single node: icon + name + expand/collapse
├── types.ts              # FileNode interface
└── index.ts              # Re-exports
```

Props interface:
```ts
export interface FileNode {
  id: string;
  name: string;
  type: "file" | "folder";
  children?: FileNode[];
  depth: number;
}

export interface FileTreeProps {
  nodes: FileNode[];
  selectedId?: string;
  expandedIds: Set<string>;
  onSelect: (node: FileNode) => void;
  onToggleExpand: (node: FileNode) => void;
  onContextMenu?: (node: FileNode, event: React.MouseEvent) => void;
}
```

Requirements:
- Use `@tanstack/react-virtual` for virtualization (per ui-rules.md)
- Use shadcn `ScrollArea` as the scroll container
- Use `--sat-*` CSS vars for all colors
- Zero Tauri imports

#### 7.2.2 Update vault feature to use new primitives

`apps/tauri/src/features/vault/components/FileTree.tsx` becomes a thin wrapper:

```tsx
import { FileTree as FileTreeUI } from "@workspace/ui/components/file-tree";
import { useVaultTree } from "../hooks/useVaultTree";

export function VaultFileTree() {
  const { nodes, selectedId, expandedIds, selectFile, toggleExpand } = useVaultTree();
  return (
    <FileTreeUI
      nodes={nodes}
      selectedId={selectedId}
      expandedIds={expandedIds}
      onSelect={selectFile}
      onToggleExpand={toggleExpand}
    />
  );
}
```

#### 7.2.3 Delete old files

- **DELETE** `apps/tauri/src/features/vault/components/FileTree.tsx` (old version)
- **DELETE** `apps/tauri/src/features/vault/components/FileTreeNode.tsx` (old version)

Replace with the new vault-specific wrapper above.

---

## 8. What NOT to Touch

These parts are **already well-structured** and should be left as-is:

| File/Dir | Why it's fine |
|----------|---------------|
| `editor/src/plugins/decorations/` (→ `extensions/decorations/` after rename) | Clean handler pattern, each file does one thing |
| `editor/src/plugins/live-preview.ts` | Correct CM6 StateField/ViewPlugin architecture |
| `editor/src/plugins/links.ts` (WikiLink parser) | Clean Lezer extension |
| `editor/src/plugins/task-list.ts` | Clean ViewPlugin pattern |
| `editor/src/plugins/backticks.ts` | Simple keymap, works fine |
| `editor/src/plugins/suggestions.ts` (logic only) | Autocomplete logic is correct |
| `editor/src/commands/registry.ts` | Clean pub-sub pattern, 54 lines |
| `editor/src/commands/context.tsx` | Clean React context + hooks |
| `apps/tauri/src/features/vault/hooks/` | Already follows feature pattern |
| `apps/tauri/src/features/vault/components/BacklinksSidebar.tsx` | Independent, fine |
| `apps/tauri/src/features/vault/components/Toolbar.tsx` | Independent, fine |
| `apps/tauri/src/features/vault/components/SaveIndicator.tsx` | Independent, fine |
| `apps/tauri/src/features/vault/components/VaultSplash.tsx` | Independent, fine |
| `packages/ui/src/lib/utils.ts` | Just the cn() helper |
| `packages/ui/src/components/ui/button.tsx` | shadcn generated |
| `packages/ui/src/components/ui/scroll-area.tsx` | shadcn Radix wrapper |
| `packages/ui/src/components/ui/separator.tsx` | shadcn generated |

---

## 9. Validation Checklist

After each phase, verify:

- [ ] `bun install` succeeds (no broken workspace links)
- [ ] `bun run dev` in `apps/tauri` starts without errors
- [ ] No TypeScript errors (`bun run typecheck` or `tsc --noEmit`)
- [ ] Editor renders and live preview works
- [ ] WikiLinks are clickable
- [ ] Task checkboxes toggle
- [ ] `[[` triggers link autocomplete
- [ ] `#` triggers tag autocomplete
- [ ] Ctrl+P opens command palette with all commands
- [ ] Right-click opens context menu with editor/format commands
- [ ] Theme switching works (if applicable)
- [ ] No circular dependency warnings
- [ ] FileTree renders vault structure (Phase 3)
- [ ] No `@base-ui/react` imports remain (after Phase 3)
- [ ] All colors use `--sat-*` vars (no hardcoded hex except as CSS fallbacks)
- [ ] `packages/ui/` has zero imports from `@workspace/editor` or `@tauri-apps/*`
- [ ] `packages/editor/` has zero React component exports (only extensions + types)
- [ ] `packages/theme/` has zero runtime dependencies

---

## Quick Reference: Files to DELETE

| File | Reason |
|------|--------|
| `packages/ui/src/components/editor-commands.tsx` | Duplicate command registration |
| `packages/ui/src/components/CommandPalette.tsx` | Replaced by shadcn Command version |
| `packages/editor/src/hooks/use-editor-commands.tsx` | Merged into `commands/editor-commands.ts` |
| `packages/editor/src/hooks/` (directory) | Empty after above |
| `packages/editor/src/plugins/context-menu.ts` | Not an editor concern |
| `packages/editor/src/index.tsx` | Replaced by `index.ts` + `create-extensions.ts` |
| `packages/ui/tokens/` (directory) | Moved to `packages/theme/tokens/` |
| `packages/ui/theme/` (directory) | Moved to `packages/theme/themes/` |
| `packages/ui/src/styles/tokens.d.ts` | Moved to `packages/theme/src/types.ts` |
| `apps/tauri/src/features/vault/components/FileTree.tsx` | Replaced by new implementation |
| `apps/tauri/src/features/vault/components/FileTreeNode.tsx` | Replaced by ui primitive |

## Quick Reference: Files to CREATE

| File | Purpose |
|------|---------|
| `packages/theme/package.json` | New theme package |
| `packages/theme/tsconfig.json` | TS config |
| `packages/theme/build.ts` | Token builder (moved) |
| `packages/theme/src/index.ts` | Re-exports |
| `packages/theme/src/types.ts` | Theme types |
| `packages/editor/src/types.ts` | Shared editor types |
| `packages/editor/src/create-extensions.ts` | Extension factory |
| `packages/editor/src/index.ts` | Clean re-exports |
| `packages/editor/src/themes/base.ts` | Base CM6 theme |
| `packages/editor/src/themes/decorations.ts` | Aggregated decoration themes |
| `packages/editor/src/themes/suggestions.ts` | Autocomplete theme |
| `packages/editor/src/themes/task-list.ts` | Task checkbox theme |
| `packages/editor/src/commands/editor-commands.ts` | Merged command registrations |
| `packages/ui/src/components/command-palette/CommandPalette.tsx` | Props-driven palette |
| `packages/ui/src/components/command-palette/index.ts` | Re-export |
| `packages/ui/src/components/file-tree/FileTree.tsx` | Virtualized tree |
| `packages/ui/src/components/file-tree/FileTreeNode.tsx` | Node renderer |
| `packages/ui/src/components/file-tree/types.ts` | FileNode types |
| `packages/ui/src/components/file-tree/index.ts` | Re-export |
| `apps/tauri/src/features/editor/index.ts` | Feature re-exports |
| `apps/tauri/src/features/editor/types.ts` | Feature types |
| `apps/tauri/src/features/editor/components/EditorView.tsx` | CodeMirror wrapper |
| `apps/tauri/src/features/editor/components/EditorContextMenu.tsx` | Context menu wiring |
| `apps/tauri/src/features/editor/components/EditorCommandPalette.tsx` | Palette wiring |
| `apps/tauri/src/features/editor/hooks/useEditor.ts` | Editor lifecycle (moved) |
