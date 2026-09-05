# @workspace/editor — CodeMirror Markdown Editor

The editor is Basalt's most important feature package. It wraps CodeMirror 6
with a curated set of extensions for markdown editing: live preview, wiki-links
and embeds, task lists, autocomplete, and custom syntax highlighting.

## Responsibility

Pure CodeMirror editor primitives — **zero** business state, zero Tauri IPC,
zero feature-level logic.

## Markdown Syntax Registry (ADR-033)

All Basalt markdown syntax is **one Lezer grammar**, assembled declaratively
from registered `SyntaxManifest`s — never hand-listed per file. The single
source of truth is `src/syntax/registry.ts`:

```ts
// Every Basalt syntax boxes itself in a manifest:
interface SyntaxManifest {
  id: string;                    // e.g. "wikilink", "frontmatter", "dql"
  description: string;           // why a custom node is/isn't needed
  nodeNames: string[];           // Lezer nodes this syntax addresses in the ONE parser
  grammar?: MarkdownConfig[];    // custom Lezer configs, ONLY for parser collisions
  hiddenMarks?: string[];        // delimiter nodes live-preview hides/mutes
  fixtures: string[];            // real docs — the mandatory coverage-test gate
}

// Fold all manifests into the one MarkdownConfig[] consumed by the editor:
import { createBasaltGrammar } from "@workspace/editor";
```

Registered syntaxes (in `basaltSyntaxManifests`): wikilinks **and `![[…]]`
embeds**, YAML frontmatter, `==highlight==`, GFM tables, HTML blocks, and DQL
fences. **Built-in markdown stays built-in** — the registry wraps nodes
(`Table`, `HTMLBlock`, `FencedCode`), it never renames them.

`createEditorExtensions()` builds the markdown language with
`createBasaltGrammar()`, so `syntax/registry.ts` is the **only** place the
grammar list lives. Inline-parser precedence is declared per parser (the embed
parser runs `before: "Image"` — see ADR-033) rather than by list order. See the
[ADR-033 decision section](../../../docs/adr/033-syntax-registry.md).

### Adding a custom grammar

The rule: **add a custom `MarkdownConfig` only when the base parser collides**
(frontmatter `---` vs `HorizontalRule`, highlight `==` vs `Emphasis`, wikilink
`[[` vs `Link`, embed `![[` vs `Image`). If the base parser already emits a
usable node (tables, HTML blocks, fenced/DQL code), declare its built-in name
with no `grammar` and stop. Never rename built-in nodes.

Worked example — a `@@mention@@` inline syntax:

```ts
// 1) src/syntax/mention.ts — the Lezer MarkdownConfig (mirror highlight.ts)
import { tags as t } from "@lezer/highlight";
import type { InlineContext, MarkdownConfig } from "@lezer/markdown";

export const mentionExtension: MarkdownConfig = {
  defineNodes: [
    { name: "Mention", style: t.special(t.variableName) },
    { name: "MentionMark", style: t.processingInstruction },
  ],
  parseInline: [
    {
      name: "Mention",
      parse(cx: InlineContext, next: number, pos: number): number {
        if (next !== 64 || cx.char(pos + 1) !== 64) return -1; // "@@"
        for (let i = pos + 2; i < cx.end - 1; i++) {
          if (cx.char(i) === 64 && cx.char(i + 1) === 64)
            return cx.addElement(
              cx.elt("Mention", pos, i + 2, [
                cx.elt("MentionMark", pos, pos + 2),
                cx.elt("MentionMark", i, i + 2),
              ]),
            );
          if (cx.char(i) === 10) break; // single-line only
        }
        return -1; // not a mention — hand back to the next parser
      },
      // `before` is only needed when a base parser can steal your opener
      // (e.g. "Emphasis" for ==, "Image" for ![). `@@` has no collision, so
      // the default parser order is fine — omit `before`.
    },
  ],
};
```

Precedence note: inline parsers run in order, and a parser may declare
`before`/`after` to force a position relative to a base parser. Use `before`
only when the base parser would otherwise swallow your opener (the highlight
and embed parsers both set `before` — `"Emphasis"` and `"Image"` respectively);
otherwise the default order is fine. `addElement` with `cx.elt(...)` is how you
emit nodes with child marks; returning `-1` declines the match and lets later
parsers try.

```ts
// 2) src/syntax/registry.ts — register it
export const basaltSyntaxManifests: SyntaxManifest[] = [
  // … existing manifests …
  {
    id: "mention",
    description:
      "@@mention@@ — custom inline node because it needs its own parser + marks.",
    nodeNames: ["Mention", "MentionMark"],
    grammar: [mentionExtension],
    hiddenMarks: ["MentionMark"],
    fixtures: ["Hey @@alice@@, review this"],
  },
];
```

That's the whole wiring. Everything else is automatic:

- **Grammar** — `createBasaltGrammar()` folds `grammar` into the one list the
  editor and the test helper consume.
- **Coverage test** — `registry.test.ts` parses every `fixture` and asserts
  each declared `nodeNames` entry appears. This is the mandatory
  coverage contract; it's what caught the `![[` vs `![` Image collision. Add a
  fixture for every collision-relevant form (opener, edge case, mixed).
- **Live preview** — listing the delimiter in `hiddenMarks` folds it into the
  shared `HIDE_MARKS` set in `preview/mark-hiding.ts` automatically.
- **Lint/typecheck** — the editor package (`bunx tsc --noEmit`) and vitest suite
  must stay green, then run `bun run lint`.

Consumers address parsed nodes by the names you declare — e.g. the embed chip
renderer walks `WikiLink`/`EmbedMark` nodes from the same parser. Give syntaxes
readable names and keep them in `nodeNames` so preview/input features can rely
on the registry as their schema.

## Public API

```ts
// The factory that assembles all editor extensions
import { createEditorExtensions } from "@workspace/editor";
import type {
  EditorConfig,
  FetchLinksFn,
  FetchTagsFn,
} from "@workspace/editor";

// The context menu state capture extension (for feature-level context menus)
import { contextMenuExtension } from "@workspace/editor";
import type { ContextMenuState } from "@workspace/editor";
```

### `createEditorExtensions(config: EditorConfig): Extension[]`

Builds the full stack of CM6 extensions:

- **Syntax**: markdown language via the syntax registry (frontmatter,
  `==highlight==`, `[[WikiLinks]]` + `![[embeds]]`, tables, HTML blocks, DQL)
- **Styling**: custom editor theme (via `EditorView.theme()` + `HighlightStyle`)
- **Live preview**: decorations for headings, blockquotes, code blocks, callouts,
  tables, lists, inline marks (bold/italic/code/wiki-link/highlight/strikethrough),
  embed chips (ADR-033), tag highlighting, mark hiding
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
│   ├── wiki-links.ts    # [[WikiLink]] + ![[embed]] parser + click handler
│   ├── registry.ts      # SyntaxManifest registry → createBasaltGrammar() (ADR-033)
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
│   ├── highlight-override.ts
│   └── index.ts
├── block-widgets/       # Decoration/block widget collection
│   ├── frontmatter.ts   # YAML frontmatter widget
│   └── registry.ts
├── syntax/code-highlight-style.ts  # Per-language code highlight overrides
├── frontmatter-widget.ts / frontmatter-icons.ts
├── scroll-header.ts     # Adapter that slots a React title into .cm-scroller (ADR-023)
├── benchmark.ts         # runTypingBenchmark() — editor perf harness
├── editor.ts            # createEditorExtensions() — the main factory
├── types.ts             # EditorConfig, FetchLinksFn, FetchTagsFn
└── index.ts             # Public API barrel
```

## Why this structure?

| Directory  | Contains                                                     | Not to be confused with               |
| ---------- | ------------------------------------------------------------ | ------------------------------------- |
| `syntax/`  | Lezer parser extensions that add/change markdown syntax      | —                                     |
| `preview/` | Visual decoration plugins that change how the editor _looks_ | —                                     |
| `input/`   | User interaction: keyboard, mouse, autocomplete              | —                                     |
| `styling/` | CM6 `EditorView.theme()` + `HighlightStyle`                  | `packages/theme/` (SAT design tokens) |

The name `styling/` was chosen over `themes/` to avoid confusion with
`@workspace/theme` (the SAT CSS token system). The editor "theme" is a
CodeMirror `EditorView.theme()` configuration that references SAT tokens
via CSS variables — it's not a design token system itself.

## External conventions (for feature-layer consumers)

The React `<Host>` wrapper with `onViewReady` lives in
`apps/tauri/src/features/editor/components/editor-component.tsx`.

The `useEditorCommands` hook (registers bold/italic/etc. in the global command
palette) lives in `apps/tauri/src/features/editor/hooks/useEditorCommands.ts`.
