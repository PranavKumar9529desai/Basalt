# @workspace/editor — CodeMirror Markdown Editor

The editor is Basalt's most important feature package. It wraps CodeMirror 6
with a curated set of extensions for markdown editing: live preview, wiki-links,
task lists, autocomplete, and custom syntax highlighting.

## Responsibility

Pure CodeMirror editor primitives — **zero** business state, zero Tauri IPC,
zero feature-level logic.

## Public API

```ts
// The factory that assembles all editor extensions
import { createEditorExtensions } from "@workspace/editor";
import type { EditorConfig, FetchLinksFn, FetchTagsFn } from "@workspace/editor";

// The context menu state capture extension (for feature-level context menus)
import { contextMenuExtension } from "@workspace/editor";
import type { ContextMenuState } from "@workspace/editor";
```

### `createEditorExtensions(config: EditorConfig): Extension[]`

Builds the full stack of CM6 extensions:
- **Syntax**: markdown language + YAML frontmatter + ==highlight== + [[WikiLinks]]
- **Styling**: custom editor theme (via `EditorView.theme()` + `HighlightStyle`)
- **Live preview**: decorations for headings, blockquotes, code blocks, callouts,
  tables, lists, inline marks (bold/italic/code/wiki-link/highlight/strikethrough),
  tag highlighting, mark hiding
- **Task lists**: clickable `- [ ]` / `- [x]` checkboxes
- **Autocomplete**: `[[link` and `#tag` suggestions via callbacks
- **Editable**: close brackets, line wrapping, backtick keymap

### `contextMenuExtension(onContextMenu): Extension`

A CM6 DOM event handler that captures right-click events and provides
cursor position + selection text. Pure state capture — no UI.

## Architecture

The editor is organized by conceptual function, NOT by file type:

```
src/
├── syntax/              # Language syntax extensions (Lezer MarkdownConfig)
│   ├── frontmatter.ts   # YAML frontmatter parser
│   ├── highlight.ts     # ==highlight== syntax extension
│   ├── wiki-links.ts    # [[WikiLink]] parser + click handler
│   └── index.ts
├── preview/             # Live preview visual decoration system
│   ├── live-preview.ts  # Orchestrator: StateField + ViewPlugin
│   ├── blockquotes.ts
│   ├── callouts.ts
│   ├── code-blocks.ts
│   ├── frontmatter.ts
│   ├── headings.ts
│   ├── inline-marks.ts
│   ├── lists.ts
│   ├── mark-hiding.ts
│   ├── tables.ts
│   └── types.ts         # DecorationCollector, DecorationContext
├── input/               # User interaction & input handling
│   ├── backticks.ts     # Triple backtick key binding
│   ├── context-menu.ts  # Right-click state capture
│   ├── suggestions.ts   # [[link]] / #tag autocomplete
│   ├── task-list.ts     # Clickable checkboxes
│   └── index.ts
├── styling/             # CodeMirror editor visual theme (NOT SAT tokens)
│   ├── base.ts          # EditorView.theme() + HighlightStyle
│   └── index.ts
├── editor.ts            # createEditorExtensions() — the main factory
├── types.ts             # EditorConfig, FetchLinksFn, FetchTagsFn
└── index.ts             # Public API barrel
```

## Why this structure?

| Directory | Contains | Not to be confused with |
|---|---|---|
| `syntax/` | Lezer parser extensions that add/change markdown syntax | — |
| `preview/` | Visual decoration plugins that change how the editor *looks* | — |
| `input/` | User interaction: keyboard, mouse, autocomplete | — |
| `styling/` | CM6 `EditorView.theme()` + `HighlightStyle` | `packages/theme/` (SAT design tokens) |

The name `styling/` was chosen over `themes/` to avoid confusion with
`@workspace/theme` (the SAT CSS token system). The editor "theme" is a
CodeMirror `EditorView.theme()` configuration that references SAT tokens
via CSS variables — it's not a design token system itself.

## External conventions (for feature-layer consumers)

The React `<EditorHost>` wrapper with `onViewReady` lives in
`apps/tauri/src/features/editor/components/editor-component.tsx`.

The `useEditorCommands` hook (registers bold/italic/etc. in the global command
palette) lives in `apps/tauri/src/features/editor/hooks/useEditorCommands.ts`.
