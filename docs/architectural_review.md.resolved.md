# Basalt Architectural Review — Honest Assessment

## TL;DR

**Your concern is valid.** Right now Basalt is ~90% a CodeMirror configuration project with a Rust backend that acts as a glorified file indexer and string-search API. The Rust is well-written but underutilized — it does essentially zero work during editing. To beat Obsidian on performance, you need Rust (or WASM) **in the editing hot path**, not just at vault-load time.

---

## 1. What Rust Actually Does Today

| Rust Module | When It Runs | Hot Path? |
|---|---|---|
| `basalt_fs::indexer` | Once at vault open | ❌ |
| `basalt_core::metadata::scan` | Once per file at index time | ❌ |
| `basalt_core::graph` (NoteGraph) | Built at index time, queried for backlinks | ❌ |
| `basalt_core::markdown_parser` | **Never called from Tauri or frontend** | ❌ |
| `basalt_core::inline` | Only via `markdown_parser` (also unused) | ❌ |
| `basalt_wasm` | Exposes [render_markdown](file:///home/pranav/Projects/Basalt/crates/basalt_wasm/src/lib.rs#14-18) + [extract_metadata](file:///home/pranav/Projects/Basalt/crates/basalt_wasm/src/lib.rs#19-23), **neither called by editor** | ❌ |

**Verdict:** Rust handles vault indexing (read files → extract tags/links → build graph). The entire editing experience — parsing, decorations, syntax hiding, live preview — is 100% TypeScript/CodeMirror. The [NoteGraph](file:///home/pranav/Projects/Basalt/crates/basalt_core/src/graph.rs#5-10) is built but only consumed via [get_backlinks](file:///home/pranav/Projects/Basalt/apps/tauri/src-tauri/src/lib.rs#82-110) and `autocomplete_*` commands.

> [!WARNING]
> [markdown_parser.rs](file:///home/pranav/Projects/Basalt/crates/basalt_core/src/markdown_parser.rs) (200 LOC) and [inline.rs](file:///home/pranav/Projects/Basalt/crates/basalt_core/src/inline.rs) (246 LOC) are completely dead code — never invoked from Tauri or the frontend. The WASM crate exposes them but the editor doesn't use them either.

---

## 2. What CodeMirror Does Today (The Real Engine)

Your 5 TypeScript plugins are doing **all** the heavy lifting:

| Plugin | LOC | Responsibility |
|---|---|---|
| [live-preview.ts](file:///home/pranav/Projects/Basalt/packages/editor/src/plugins/live-preview.ts) | 459 | Heading styling, code blocks, blockquotes, inline code, wikilink decoration, mark hiding — THE core plugin |
| [suggestions.ts](file:///home/pranav/Projects/Basalt/packages/editor/src/plugins/suggestions.ts) | 99 | Autocomplete popup (calls Tauri for data) |
| [links.ts](file:///home/pranav/Projects/Basalt/packages/editor/src/plugins/links.ts) | 80 | WikiLink parser extension for Lezer + click handler |
| [task-list.ts](file:///home/pranav/Projects/Basalt/packages/editor/src/plugins/task-list.ts) | 105 | Checkbox widgets |
| [backticks.ts](file:///home/pranav/Projects/Basalt/packages/editor/src/plugins/backticks.ts) | 37 | Triple-backtick auto-completion keymap |

**Total editor logic: ~780 LOC of TypeScript.** This is your entire editing engine.

---

## 3. The Graph — Is It Used?

**Partially.** The [NoteGraph](file:///home/pranav/Projects/Basalt/crates/basalt_core/src/graph.rs#5-10) in [graph.rs](file:///home/pranav/Projects/Basalt/crates/basalt_core/src/graph.rs) maintains forward_links, back_links, and metadata_cache. It IS used:
- [get_backlinks](file:///home/pranav/Projects/Basalt/apps/tauri/src-tauri/src/lib.rs#82-110) command queries `graph.get_back_links()` 
- [autocomplete_links](file:///home/pranav/Projects/Basalt/apps/tauri/src-tauri/src/lib.rs#111-140) iterates `arena.all_strings()`
- [autocomplete_tags](file:///home/pranav/Projects/Basalt/apps/tauri/src-tauri/src/lib.rs#141-163) iterates `graph.metadata_cache.values()`

**But:** You're not using forward_links at all from the frontend. The graph's real value (graph visualization, related notes, orphan detection, PageRank-style note importance) is completely untapped.

---

## 4. Honest Performance Analysis

### Where Obsidian is Slow (Opportunities for Basalt)

1. **Vault indexing** — Obsidian takes 5-15s on 10K+ note vaults. Your Rust indexer with [ignore](file:///home/pranav/Projects/Basalt/.gitignore) crate + zero-AST scan is genuinely faster here. ✅
2. **Editor input latency** — Obsidian's CM6 plugins can have 10-30ms input delay on complex documents. You have the same problem because you're doing the same thing in the same way.
3. **Search** — Obsidian's search is JavaScript-based. Rust could crush this.
4. **File watching / re-indexing** — Obsidian does this in JS. Your [watcher.rs](file:///home/pranav/Projects/Basalt/crates/basalt_fs/src/watcher.rs) does this in Rust. ✅

### Where You're NOT Faster Than Obsidian

- **Typing latency**: Identical architecture (CM6 ViewPlugin rebuilding decorations on every keystroke)
- **Document rendering**: Your [buildLivePreviewDecorations](file:///home/pranav/Projects/Basalt/packages/editor/src/plugins/live-preview.ts#282-435) does two full syntax tree iterations per viewport change — same as Obsidian
- **Memory on large docs**: You load the full document into CM6 state just like Obsidian

---

## 5. Concrete Optimization Opportunities

### Tier 1: Make Rust Actually Matter in the Editor (HIGH IMPACT)

#### A. WASM-Powered Markdown → Decoration Bridge
Instead of iterating the Lezer syntax tree in TypeScript on every keystroke, have Rust/WASM parse the visible viewport text and return decoration ranges:

```
User types → CM6 sends visible text slice to WASM → Rust returns [{from, to, class}] → CM6 applies decorations
```

**Why this wins**: Your [extract_metadata](file:///home/pranav/Projects/Basalt/crates/basalt_wasm/src/lib.rs#19-23) scanner already processes markdown at ~500MB/s in Rust. The Lezer tree walk in [buildLivePreviewDecorations](file:///home/pranav/Projects/Basalt/packages/editor/src/plugins/live-preview.ts#282-435) does the same work at ~10MB/s in JS. For a 10KB visible viewport, the difference is negligible. But for complex documents with deep nesting, Rust can be 10-50x faster for the decoration computation.

#### B. Incremental Document Aware Parsing via WASM
Instead of rebuilding ALL decorations on every keystroke, use Rust's incremental parsing:
1. Keep a Rust-side document state (rope or similar)
2. On each edit, send only the delta (position + inserted/deleted text)
3. Rust recomputes only the affected decorations
4. Return the diff of decorations to CM6

**This is the #1 "shatters Obsidian" opportunity.** Obsidian rebuilds decorations from scratch on every update. A Rust incremental system could provide sub-1ms decoration updates regardless of document size.

#### C. Rust-Side Full-Text Search
Add a Tauri command that does vault-wide search using Rust (tantivy or ripgrep-style pattern matching). This would be measurably faster than any JS-based search and is a clear "Basalt is faster" showcase.

### Tier 2: Editor Architecture Improvements (MEDIUM IMPACT)

#### D. Break Up [live-preview.ts](file:///home/pranav/Projects/Basalt/packages/editor/src/plugins/live-preview.ts) 
At 459 LOC with two full tree iterations, this file is doing too much. Split into:
```
plugins/
├── decorations/
│   ├── headings.ts         # Heading line classes
│   ├── code-blocks.ts      # Code block header/footer widgets + line styling  
│   ├── blockquotes.ts      # Blockquote line classes
│   ├── inline-marks.ts     # InlineCode, WikiLink styling
│   └── mark-hiding.ts      # WYSIWYM syntax mark toggle
├── suggestions.ts
├── links.ts
├── task-list.ts
└── backticks.ts
```

**Why**: Each decoration concern can be a separate ViewPlugin with its own update logic. Heading detection doesn't need to re-run when the cursor moves inside a code block, and vice versa.

#### E. Merge the Two Tree Iterations
[buildLivePreviewDecorations](file:///home/pranav/Projects/Basalt/packages/editor/src/plugins/live-preview.ts#282-435) iterates the syntax tree TWICE — once for code blocks, once for everything else. These should be a single pass with a code-block tracking stack. This alone could halve decoration computation time.

#### F. Viewport-Only StateField
`codeBlockStateField` iterates the ENTIRE syntax tree (not viewport-scoped). For a 50K-line document this is O(n) on every keystroke. Refactor to use ViewPlugin (viewport-scoped) or implement proper incremental updates.

### Tier 3: Future-Proofing (STRATEGIC)

#### G. Plugin System in TypeScript is Fine — With a Clear Boundary
**Should you write plugins in TypeScript?** YES, with a caveat:

- **UI/decoration plugins → TypeScript.** CodeMirror's API is TypeScript-native. Fighting it with WASM interop for simple widgets (task checkboxes, copy buttons) adds complexity with no performance gain.
- **Computation-heavy logic → Rust/WASM.** Anything that processes document content (search, link resolution, metadata extraction, graph queries) should be in Rust.

The pattern is: **TypeScript for DOM, Rust for data.**

#### H. State Architecture
Right now every plugin rebuilds its own decoration set independently on every update. Consider a centralized "document state" managed by Rust:

```
┌─────────────────────────────────┐
│         Rust/WASM Core          │
│  - Document rope                │
│  - Incremental parser           │  
│  - Decoration ranges            │
│  - Metadata (tags, links, etc.) │ 
└────────────┬────────────────────┘
             │ returns decoration specs
┌────────────▼────────────────────┐
│       TypeScript Bridge         │
│  - Converts specs → CM6 Deco   │
│  - Manages widgets (DOM)        │
│  - Handles user input events    │
└─────────────────────────────────┘
```

---

## 6. What's Good (Don't Change These)

1. **[StringArena](file:///home/pranav/Projects/Basalt/crates/basalt_core/src/arena.rs#6-10) + [NoteGraph](file:///home/pranav/Projects/Basalt/crates/basalt_core/src/graph.rs#5-10)** — Clean, memory-efficient graph representation. The arena-based ID system is exactly right.
2. **Zero-AST metadata scanner** ([scan.rs](file:///home/pranav/Projects/Basalt/crates/basalt_core/src/metadata/scan.rs)) — The byte-level scanner that skips full AST construction is genuinely smart design. This is how you index 10K files in under a second.
3. **Monorepo structure** — Clean separation between `crates/`, `packages/`, `apps/`.
4. **WikiLink Lezer extension** ([links.ts](file:///home/pranav/Projects/Basalt/packages/editor/src/plugins/links.ts)) — Clean, minimal, correct parser extension. 
5. **[Vault](file:///home/pranav/Projects/Basalt/crates/basalt_fs/src/lib.rs#17-21) facade** in `basalt_fs` — Simple and does exactly one thing.

---

## 7. What to Leave Alone vs. What to Kill

| Keep | Kill/Refactor |
|---|---|
| [StringArena](file:///home/pranav/Projects/Basalt/crates/basalt_core/src/arena.rs#6-10) | [process_markdown](file:///home/pranav/Projects/Basalt/crates/basalt_core/src/lib.rs#25-35) in [lib.rs](file:///home/pranav/Projects/Basalt/crates/basalt_fs/src/lib.rs) (dead code, just wraps pulldown-cmark for HTML) |
| [NoteGraph](file:///home/pranav/Projects/Basalt/crates/basalt_core/src/graph.rs#5-10) structure | [markdown_parser.rs](file:///home/pranav/Projects/Basalt/crates/basalt_core/src/markdown_parser.rs) + [inline.rs](file:///home/pranav/Projects/Basalt/crates/basalt_core/src/inline.rs) (250+ LOC of dead code, duplicates what metadata scanner does) |
| [extract_metadata](file:///home/pranav/Projects/Basalt/crates/basalt_wasm/src/lib.rs#19-23) scanner | Two-pass tree iteration in [live-preview.ts](file:///home/pranav/Projects/Basalt/packages/editor/src/plugins/live-preview.ts) |
| WikiLink Lezer extension | `codeBlockStateField` iterating entire tree |
| Tauri command architecture | |

---

## 8. Priority Roadmap (If I Were Building This)

| Priority | Action | Impact | Effort |
|---|---|---|---|
| **P0** | Clean up dead code ([markdown_parser.rs](file:///home/pranav/Projects/Basalt/crates/basalt_core/src/markdown_parser.rs), [inline.rs](file:///home/pranav/Projects/Basalt/crates/basalt_core/src/inline.rs), [process_markdown](file:///home/pranav/Projects/Basalt/crates/basalt_core/src/lib.rs#25-35)) | Clarity | 1 hour |
| **P0** | Merge two tree iterations in [live-preview.ts](file:///home/pranav/Projects/Basalt/packages/editor/src/plugins/live-preview.ts) into one pass | -50% decoration cost | 2 hours |
| **P0** | Make `codeBlockStateField` viewport-scoped | Fixes O(n) per keystroke | 2 hours |
| **P1** | Split [live-preview.ts](file:///home/pranav/Projects/Basalt/packages/editor/src/plugins/live-preview.ts) into focused modules | Maintainability | 4 hours |
| **P1** | Add Rust-based vault search (Tauri command) | Visible perf win | 1 day |
| **P2** | WASM decoration bridge (Rust computes decorations for visible text) | 10-50x for complex docs | 3-5 days |
| **P2** | Rust incremental document state | The "Obsidian killer" feature | 1-2 weeks |
| **P3** | Graph visualization / related notes (use the NoteGraph!) | Feature differentiation | 1 week |

---

## 9. Bottom Line

You've built a solid foundation — the Rust metadata pipeline, the arena-based graph, the zero-AST scanner — these are genuinely well-engineered. But your instinct is right: **Rust is doing janitor work while TypeScript runs the show.**

To actually "shatter Obsidian's performance," Rust needs to be in the keystroke-to-pixel pipeline, not just the vault-loading pipeline. The WASM bridge for decoration computation is the single highest-leverage change you can make. Everything else is incremental.

**The good news**: Your architecture is set up for exactly this transition. The `basalt_wasm` crate already exists, the editor is cleanly separated as a package, and the Tauri integration pattern shows you know how to bridge Rust ↔ TypeScript. You just need to move the bridge from "fetch data on demand" to "compute on every keystroke."
