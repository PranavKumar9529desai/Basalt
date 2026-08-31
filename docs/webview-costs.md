# What still looks like Obsidian

**Not an ADR.** ADR-007, ADR-019, and ADR-020 already decided the stack:
JS renders pixels in a system WebView; Rust owns vault-scale bytes; we do
not leave CodeMirror for a native renderer. This note is the leftover
bill. Read it when the "why does this still feel like Electron?" question
comes back.

**Date:** 2026-08-31

---

## The class of app

Basalt and Obsidian are the same architecture class:

```
disk .md  →  native sidecar (Rust / Electron main)
          →  IPC (JSON today)
          →  WebView (WebKit / Chromium)
          →  JS editor (CodeMirror 6)
          →  DOM + CSS layout + GPU composite
```

Rust is winning on I/O, Tantivy, Nucleo, the watcher, and the graph. It
does **not** rasterize glyphs. Every character you type still becomes
DOM mutations inside WebKit. Beating Obsidian is "same compositor, less
JS per keystroke + a native vault." It is not "pixels from Rust."
ADR-019 already rejected GPUI/Zed-style rendering unless we leave the
WebView entirely.

The three places that tax still shows up:

1. The keystroke path mutates WebKit DOM and pays CSS layout.
2. Reading mode is a full React tree, not virtualized.
3. `open_file` ships the whole note as JSON IPC.

---

## 1. Keystroke → WebKit DOM

### What happens on one character

`Host.tsx` mounts a raw CM6 `EditorView`. Typing never `setState`s React
(ADR-018 phase 2). The hot path is still:

1. CM6 transaction
2. Lezer incremental parse (`@codemirror/lang-markdown` + wiki / highlight
   / frontmatter `MarkdownConfig`s)
3. `livePreviewField.update()` in `packages/editor/src/preview/live-preview.ts`
   — full tree walk, or `decorations.map(tr.changes.desc)` above 48KB
   (`LAZY_DOC_THRESHOLD`)
4. `@codemirror/view` mutates the visible DOM (spans, widgets, mark hiding)
5. **WebKit** style → layout → paint → composite

Steps 1–4 we own. Step 5 we do not. CM "virtualization" only means
off-screen *lines* are not in the DOM. The visible page is still a pile
of spans and CSS. That last stretch is the same bill Obsidian pays.

### What we already did

ADR-019 fused the decoration pipeline: one transaction, one tree walk, no
nested dispatch, viewport-independent StateField decorations. Isolation
benchmark gate: **p95 ≤ 4ms @ 100KB** full stack (from 12ms). Stretch
≤2ms was missed. `packages/editor/src/benchmark.ts`, palette command
`dev:editor-benchmark`.

Docs over 48KB map decorations on the keystroke and defer the full walk
to `requestIdleCallback`. Selection/click still rebuilds sync. Stats
debounce 500ms. Autosave is off this path.

### What would actually remove this tax

Not another TypeScript pass. Not Rust-per-keystroke (IPC serialization
exceeds Lezer; ADR-019 rejected it). The only way off this bill is a
different compositor (GPU text, native view). That is a multi-year
rewrite. Do not "fix" it with debounce; that hides the cost and breaks
CM6's synchronous-tree contract.

---

## 2. Reading mode is a full React tree

### What it is

`NoteViewMode = "edit" | "reading"` (`features/tabs/types.ts`). Toggle is
`editor:toggle-view-mode` (Ctrl/Cmd+E).

| Mode | Engine | DOM |
| ---- | ------ | --- |
| `edit` (default) | CM6 live preview, marks hidden off the caret line | CM viewport (visible lines only) |
| `reading` | `Reading.tsx`: mask YAML + wikilink delimiters → `@lezer/markdown` `parser.parse()` → `renderDocument` / `renderBlock` / `renderInline` | **every block as a React element** |

There is no source-only mode and no split preview. The CM host stays
mounted in reading mode (`invisible pointer-events-none`) so switching
back is cheap. The overlay is not cheap.

Reading mode walks the **whole** document. No `@tanstack/react-virtual`.
A 200-line note is fine. A 5,000-line daily note is thousands of React
nodes committed at once. Scroll does not mount/unmount blocks; it
overflows. Code fences also `tokenizeCode()` (same Lezer highlighters,
cached in `codeTokenCache`).

Edit-mode virtualization does not help here. You left CM.

### What would actually remove this tax

Window the reading tree (only visible blocks mounted), or render reading
mode as a second CM view with all marks replaced and `editable: false`
(search's `PreviewPane.tsx` is already a read-only CM live-preview).
Do not parse in Rust and ship HTML; that reintroduces IPC on a gesture
path and duplicates Lezer.

---

## 3. `open_file` is JSON of the entire file

### What it is

```
invoke("open_file")
  → commands/files.rs: canonicalize + read_to_string
  → serde JSON across Tauri IPC
  → EditorController.showTab()
  → EditorState.create({ doc, extensions })
  → view.setState(state)
```

A 100KB note is small on disk. As IPC it is a fat JSON string (escaped),
then `JSON.parse`, then one giant CM document + Lezer tree + first
decoration pass + `EditorView` create. ADR-020 already says official
Tauri docs call JSON IPC something that "slows down your application"
for large returns.

Tab *switch* is cheaper: `EditorController` keeps `Map<tabId, EditorState>`.
First open of a note is not. Every new leaf pays the copy. Search
preview is a third CM instance (`PreviewPane.tsx`) and pays a parse of
whatever it is showing.

`parse_frontmatter` IPC is **not** on this path. Editor YAML uses
`crates/frontmatter-wasm` inside the WebView (ADR-022). Do not confuse
the two.

### What would actually remove this tax

ADR-020 move 3 (proposed, **not built**): bincode/postcard +
`tauri::ipc::Response::new(bytes)`, decode into typed arrays. Named for
vault tree / graph dumps / search pages; `open_file` is the same shape
(one large string). Binary IPC for the note body, or a custom protocol
that lets the WebView read bytes without serde, is the move. Do not add
another `invoke` per heading.

---

## Honest inventory

**Rust already owns (not this bill):** vault walk, `extract_metadata`
(zero-AST byte scan), Tantivy, Nucleo, graph, watcher, rename/link
rewrite, self-write suppression.

**Still paid in the WebView (same tax Obsidian pays):**

- Every keystroke: Lezer + CM transaction + decoration rebuild + DOM +
  CSS layout + composite
- Reading mode: full Lezer parse + unwindowed React tree
- `open_file`: whole file as JSON IPC
- Frontmatter WASM runs in-process in the WebView, not a native view
- Graph is WebGL2 in the same WebView (sim is in a worker)
- Editor chrome (tabs, ribbon, tree) is React around the CM host

**Not built, do not pretend otherwise:** image / `![[embed]]` widgets,
source mode, split preview, math, mermaid, HTML tables in edit mode,
HTML renderer leaf (`CURRENT_WORK.md`), binary IPC, pane splits
(ADR-018 phase 3).

`pulldown-cmark` / `basalt-wasm.render_markdown` exist. They are **not**
on the paint path. Display parse is Lezer.

---

## Pointers

| Thing | Where |
| ----- | ----- |
| Decoration pipeline | `packages/editor/src/preview/live-preview.ts`, [ADR-019](adr/019-editor-decoration-pipeline.md) |
| Editor host | `apps/tauri/src/features/editor/components/Host.tsx` |
| Per-tab state | `apps/tauri/src/features/editor/controller/EditorController.ts` |
| Reading mode | `apps/tauri/src/features/editor/components/Reading.tsx` |
| File IPC | `apps/tauri/src-tauri/src/commands/files.rs` (`open_file`, `save_file`) |
| TS vs Rust split | [ADR-007](adr/007-typescript-rust-responsibilities.md) |
| Binary IPC (proposed) | [ADR-020](adr/020-desktop-tier-performance.md) move 3 |
| Typing benchmark | `packages/editor/src/benchmark.ts` |
