# Basalt Frontmatter & Properties — Design Proposal

**Status:** Draft  
**Date:** 2026-08-07  
**Scope:** UI, parsing/serialization, IPC, search index integration

---

## 1. Why frontmatter matters (and where Obsidian hurts)

Obsidian's own Properties panel (v1.4+) is the reference UX most users know — and it has a predictable set of
complaints. We researched the Obsidian forums, plugin ecosystem, and community posts. Listing the **pain points
first** because they directly shape what Basalt should and shouldn't build.

### Pain points reported by Obsidian users

1. **Properties editing is a mini-UI bolted on top of a text blob.** The YAML lives in the source; the Properties
   panel is a separate, opinionated rendering (dates, booleans, tag chips). The two can fight each other:
   - "Properties in Document" setting (Visible/Hidden/Source) behaves inconsistently across views
     ([forum 85971](https://forum.obsidian.md/t/frontmatter-issues/85971)).
   - Plugins like Templater can't programmatically set typed property values; date-type fields even reject
     template input ([Templater #1191](https://github.com/SilentVoid13/Templater/issues/1191)).
2. **No round-trip guarantee / data mangling.** When users edit or bulk-modify frontmatter via plugins, `git diff`
   shows keys reordered, comments dropped, spacing/reformatting changed. People fear the tool rewriting their
   hand-written YAML. The Obsidian YAML-editor ecosystem's stated design goal is literally *"round-trip
   preservation — never reorders keys, strips comments, or reformats whitespace"*
   ([obsidian-yaml-editor README](https://github.com/idheitmann/obsidian-yaml-editor)).
3. **Inconsistent schema / no schema awareness.** Users casually add keys → half their notes have
   `due_date`, half have `dueDate`, half have none. Dataview queries silently return empty tables. The fix people
   reach for is *feedback*: type autocompletion ranked by vault frequency, and validation/linting
   ([Dan Holloran guide](https://danholloran.me/posts/obsidian-properties-and-frontmatter-a-practical-guide));
   [obsidian-superskills/frontmatter](https://github.com/ericgandrade/obsidian-superskills)).
4. **Frontmatter isn't a first-class search citizen.** Obsidian 1.4 added properties display but the native search
   is text-centered; frontmatter-aware querying is delegated to Dataview/Bases. Basalt's own index flags frontmatter
   indexing as an explicit TODO
   ([native-search-design.md §Future Work](./2026-04-04-native-search-design.md)).
5. **Editing YAML by hand is fragile & error-prone.** Tabs-vs-spaces, unquoted reserved words (`true`, `null`),
   wrong indentation → one bad line silently breaks the whole block, and users debug it blind
   ([forum 43472](https://forum.obsidian.md/t/front-matter-and-tags-not-working-as-expected/43472),
   [reddit frontmatter fix](https://www.reddit.com/r/ObsidianMD/comments/1atnup8/)).

### Opportunities for Basalt

Basalt has three structural advantages that let us *avoid* most of Obsidian's pain instead of recreating it:

- **Native Rust backend.** Serialization, round-trip safety, validation, and bulk ops live in `basalt-parser` /
  `basalt-vault`, not JS. We can do lossless YAML round-tripping and index frontmatter fields properly.
- **CodeMirror 6 + Lezer.** The editor extensions are composable — we can give the frontmatter block structured
  highlighting, folding, and diagnostics without losing source round-trip.
- **Blank slate.** No legacy users to keep compatible with; we decide the model, not a plugin SDK.

---

## 2. Core design principle: **"The frontmatter block is source"**

> A note is text. Frontmatter is a text region with a structured interpretation. Editing structured data MUST NOT
> destroy the user's text.

Two complementary editing/reading surfaces share ONE source of truth (the raw `---` block):

- **Raw mode** — you see and edit the actual YAML text (syntax-highlighted, folded, validated live).
- **Property panel** — one property at a time, typed controls (date, boolean, tag-list, string) that *read*
  from and *write back into* the same text block.

"Write back" is byte-preserving: editing a property edits **only that property's lines**, leaving key order,
comments, blank lines, surrounding text, and unknown keys untouched. We never reformat the whole block.

---

## 3. Data model & parsing (Rust)

### 3.1 What exists today

- `basalt-parser/src/metadata.rs` `extract_metadata()` detects a leading `---\n ... \n---` block and parses it to
  `serde_yaml_ng::Value` (`meta.frontmatter: Option<Value>`). It computes byte boundaries so the body offset is
  known.
- `basalt-parser/src/parser.rs` `parse_markdown()` does the same frontmatter strip for the full AST path.
- `basalt-types/src/metadata.rs` `FileMetadata.frontmatter: Option<serde_yaml_ng::Value>` is cached in the
  `NoteGraph` (`metadata_cache`), which every search/index call already consumes.
- The frontend NEVER sees `frontmatter` today — no IPC returns it; the editor treats content as an opaque string.

### 3.2 What's missing (the core deltas)

1. **A lossless YAML document representation.** `serde_yaml_ng::Value` is a plain value tree — it **cannot round
   trip** (comments, key order, quoting, blank lines are discarded). We need to keep `Value` for the fast scans
   but add a line-aware model for editing.
2. **A serializer** back to the `---` block (doesn't exist anywhere).
3. **Frontmatter span info** in `FileMetadata` (start/end of the block in UTF-16 for CodeMirror positioning) —
   today the block offset is thrown away after slicing.
4. **IPC commands** to read/modify frontmatter.

### 3.3 Recommended approach: keep `Value`, add a `FrontmatterBlock` with `(key, value, span)` rows

Do **not** re-serialize from a `Value` tree (that path is how Obsidian-family tools lose comments/order). Instead:

- Parse the frontmatter text into an ordered list of **properties**:
  ```
  struct FrontmatterProperty {
      key: String,           // 'title', 'tags', custom, nested via YAML path?
      key_span: Span,        // byte + utf16 offsets of the key
      value: PropertyValue,  // String | Number | Bool | Null | TagList | TodoList
      value_span: Span,
      // we retain the raw lines so mutations are surgical
  }
  struct FrontmatterBlock {
      start_span: Span,      // covering "---\n"
      end_span: Span,        // covering "\n---"
      props: Vec<FrontmatterProperty>,
      // line-by-line raw text retained for untouched props
  }
  ```

- Editing a property = **replace the byte range `value_span` (or key_span) with newly serialized text**, exact
  string surgery — left unaffected lines byte-identical. Serializing one scalar/list value (not the whole doc) is
  trivial and safe.

This directly answers pain point #2 (round-trip) and #5 (don't reformat).

### 3.4 Serializer location

- `basalt-parser` gains a `frontmatter.rs` module:
  - `parse_frontmatter_block(input) -> Option<FrontmatterBlock>` (reuse existing `---` detection)
  - `FrontmatterBlock::to_source(&self) -> String` (rebuild the `---` block only when adding/removing a property)
  - value-level ser/deser helpers for profiles of YAML equal (`to_scalar_yaml`, `list_yaml`)
- The pieces used for editing (**minimal:** parse a value, serialize a value, find a key's span) should be
  reachable from the TS side via IPC, but heavier parsing stays Rust.

---

## 4. IPC surface (Rust ↔ TypeScript)

Today `open_file` returns raw `String`. Add a small, focused set of commands. Keep it batched/lazy — this is not
on the hot path (only when the properties UI is open or save).

| Command | Signature | Purpose |
|---|---|---|
| `get_note_metadata(path)` | -> `NoteMetadata` | parsed `frontmatter` (ordered props incl. spans), `tags`, `links`, `headings` — for the properties panel + statusbar. |
| `set_note_property(path, key, kind, value)` | -> `FrontmatterMutationResult` | lossyaml replace of ONE property; returns new raw content + new metadata (so the editor can update in place) |
| `add_note_property(path, key, kind)` | -> same | insert a new property (before a designated key or at end) |
| `delete_note_property(path, key)` | -> same | remove the property's full line(s), minimally |
| `get_vault_property_index()` | -> `PropertyIndex` | aggregated key usage counts/types across the vault for autocomplete + schema inference (pain point #3). This belongs in `basalt-vault`, refreshed on index/reindex. |

`FrontmatterMutationResult` returns the **authoritative new content string**. The editor then updates its
content (and cleans dirty/save flow) rather than the UI mangling text itself.

Notes:
- Writing through `set_note_property` should reuse `save_file`'s path (disk write + `vault.add_document` +
  `vault://file-changed`) so the search index and graph stay fresh.
- `delete` of the whole block (when last property removed) returns a content without `---`.

---

## 5. Editor integration (CodeMirror 6)

### 5.1 Single source of truth

The editor already holds `content: string` as the single source (`useEditor.ts`). The properties UI **does not
hold a parallel state** — every change is: invoke IPC (`set_note_property`), receive authoritative new
`content`, `setContent(newContent)`, mark dirty, schedule save (existing pipeline). Live-preview/backlink refresh
already react to content changes, so links/tags stay fresh.

This mirrors and reuses the existing save node of ADR-006 (`useEditor.performSave` at
`apps/tauri/src/features/editor/hooks/useEditor.ts:124`). No new save path.

### 5.2 Frontmatter-aware editor primitives

- Extend `packages/editor/src/syntax/frontmatter.ts` (already has `YAMLFrontMatter` Lezer node) with:
  - **Folding** of the block and of list values (CodeMirror foldable range).
  - **Diagnostics**: on `content` change, if the block fails to parse, surface an inline marker (pain point #5).
- Property **insert mode** — typing `---` at doc start mirrors Obsidian's auto-create (already parseable).

---

## 6. UI — properties panel (packages/ui + features)

### 6.1 Location: a right-hand properties panel (state-driven, route-less per ADR-004)

- New `apps/tauri/src/features/properties/`:
  - `store.ts` — Zustand: `open`, `notePath`, `frontmatter`, `validation`, `dirty` per property
  - `hooks/useProperties.ts` — loads via `get_note_property`, convenience to update/delete/add, handles
    per-property dirty & undo
  - `types.ts`, `index.ts` re-exports
- New thin components under `apps/tauri/app-shell/` or as a feature-local composite:
  - `PropertiesPanel.tsx` (renders the list; wires to `features/properties/store`)
  - each row = a typed field (see primitives below)

### 6.2 Reusable UI primitives (`packages/ui`)

Because properties have repeated, typed shapes, add **dumb, stateless** presentational components to
`packages/ui/src/components/properties/` (following ADR-001 — props in, DOM out; no `invoke`/state):

- `PropertyValueInput` — renders the right control by kind (built on shadcn `Input`, `Textarea`, `Dialog`).
  Parent-driven: it receives `value`, `onChange(value)`, `onCommit()`. Contains no business state.
- `TagListInput` — chips; add/remove; comma/source; used for `tags`, `aliases`, `cssclasses`.
- `TodoListInput` — checkbox items (Obsidian's "todo list" type).
- `PropertyTypeSelect` — a dropdown of kinds (`text`, `number`, `boolean`, `date`, `tags, list, to-do`). Mirrors
  Obsidian's type-switcher; persisted in the YAML equal and inferred values.

These all comply with the "dumb component" rule: no `invoke()`, no cross-feature imports, `--sat-*` tokens only.

### 6.3 Type mapping & inference

Infer property **kind** from the stored YAML value + the optional type coercion. For the schema-driven
view (pain point #2), the vault-level index (`get_vault_property_index`) suggests:
- keys that other notes use (ranked by frequency), so you don't invent `dueDate` next to `due_date`
- the dominant value type per key (`string`, `number`, `boolean`, `date`, `tag/list`) — enables autocomplete
  and surfaces **schema drift** (same key, two different types across the vault)

This is the same insight that powers the Obsidian YAML-plugin "inferred schema" — delivered natively.

### 6.4 Validation

Inline per-property: while typing, IPC (or client light check) flags:
- malformed YAML (breaks block) → red marker, block "revert to saved" (`Cmd/Ctrl+Z`)
- duplicate keys
- type mismatch vs vault-prevailing kind (warning, not error — Basalt is not a gatekeeper)

Undo is trivial if edits write-back only the mutated property: `Cmd/Ctrl+Z` in the field, or the panel
"Revert" restores last saved content.

---

## 7. Search index integration (follow-up, not v1 gate)

- Extend tantivy schema (`basalt-search/src/tantivy/schema.rs`) with frontmatter-aware fields, pushing forward
  the existing Future Work in ADR-008. Ideally:
  - the `tags` field should be populated from `frontmatter.tags` (YAML list) as well as inline `#tag` (fixes the
    current `#`-only tokenizer gap — `search_state.rs:73-78`).
  - type-inference being done once in Rust enables typed queries (e.g. `date:2026-07`).
- Doing the lossyaml parse (+ granular write-back) in Rust means the index derive and UI derive share `extract`.
- This is a **separate workstream**; the properties panel only needs `get_note_metadata` + property writing to ship.

---

## 8. Phased delivery

### Phase 1 — "Edit source safely" (foundation)
- `frontmatter.rs` in `basalt-parser`: `parse_frontmatter_block`, per-property `replace`, `--` Literal rebuild for add/delete. Unit tests incl. round-trip ("save → parse → resave == identical text when unchanged").
- Expose `FrontmatterBlock` spans in `FileMetadata` (UTF-16).
- CodeMirror: folding + parse diagnostics on the existing `YAMLFrontMatter` node.
- Result: hand-editing frontmatter is structured, safe, and round-trip proven. **No new surface service.**

### Phase 2 — "Properties panel (read + typed edit)"
- `features/properties` store + IPC commands `get_note_metadata`, `set_note_property`, `add/delete`.
- `packages/ui` primitives + right-hand `PropertiesPanel`.
- Per-property write-back (byte-preserving).
- Result: Obsidian-style typed properties without the round-trip loss.

### Phase 3 — "Inference, validation, discovery"
- Vault-wide `property index` command + key/type suggestion UI; schema-inconsistency warnings.
- Completions in the source YAML editor.

### Phase 4 — "Search is metadata-aware"
- Tantivy typed metadata fields; frontmatter tags into `tags`; query filters. (ADT-008 follow-through.)

---

## 9. Decisions (locked)

| # | Decision | Value chosen | Rationale |
|---|---|---|---|
| 1 | Property kinds v1 | `text`, `number`, `boolean`, `date`, `tags`, `list`, `todo` | Obsidian-compatible but lean. `tag` and `list` are consumed by a `tags`/`aliases` special case; `todo` for checkbox lists. `file`, `image` etc. deferred. |
| 2 | `Value` vs structured model | Keep `serde_yaml_ng::Value` for fast scans; add ordered `FrontmatterBlock` with `(key, value, span)` rows for editing | Lossless round-trip (pain point #2). Value tree alone can't preserve comments/order/spans. Anchors/aliases are out of scope for the panel; source mode still exists. |
| 3 | Schema | Inferred-only (vault-wide property index → frequency-ranked keys + dominant type) in v1; explicit JSON Schema deferred | Addresses pain point #3 (schema drift) without new config surface. Ott-visited, non-blocking. |
| 4 | Panel location | Right-side dock | `RightSidebar.tsx` already exists in the shell; reuse it, don't introduce a new routing surface (ADR-004 state-driven navigation). |

### Scope: Phase-1 focus
Phase 1 (foundation) ships as its own branch/worktree: **lossless frontmatter parsing + per-property replacement
with round-trip guarantees** in `basalt-parser`, plus folding + parse diagnostics on the existing
`YAMLFrontMatter` CodeMirror node. Later phases (properties panel, vault property index, tantivy metadata
fields) build on this in subsequent branches.

---

## 10. Success criteria / litmus tests

- Editing any single property leaves every other byte of the note identical — verify with a `git diff`-in-test.
- Added property with a comment before it keeps the comment (round-trip).
- Going "delete all properties" yields a source with zero leftover `---`.
- Typed controls never reformat the whole block; only the touched key changes.
- `get_note_metadata` is fast (< budget) over the active note; `property_index` is batched/off-main.

---

## References

- Obsidian Properties docs: https://obsidian.md/help/properties
- Obsidian forum pain points: [85971](https://forum.obsidian.md/t/frontmatter-issues/85971), [43472](https://forum.obsidian.md/t/front-matter-and-tags-not-working-as-expected/43472)
- Templater #1191 (typed/date reject syntax): https://github.com/SilentVoid13/Templater/issues/1191
- obsidian-yaml-editor (round-trip + inferred schema): https://github.com/idheitmann/obsidian-yaml-editor
- Dan Holloran, "Stop Treating Metadata as an Afterthought": https://danholloran.me/posts/obsidian-properties-and-frontmatter-a-practical-guide
- Basalt ADR-008 (search schema TODO): `docs/adr/008-native-search-architecture.md`