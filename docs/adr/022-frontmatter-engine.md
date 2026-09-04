# ADR-022: Frontmatter Engine — Structured, Typed, First-Class Properties

## Status

Accepted (2026-08-30); amended the same day with the Properties widget
architecture, fresh Obsidian-Properties research, the WASM keystroke path, and
the generic **block-widget kernel** (rule 14, below) that generalizes the
frontmatter widget to any presentational/replacive block feature.

## Context

Frontmatter (YAML between the leading `---` fences) is the metadata layer that
turns a pile of Markdown files into a queryable knowledge system. Obsidian's own
docs note the convention "was popularized by Jekyll… and has since become a
de-facto standard" — Hugo, Astro, Quartz, Logseq, Pandoc, and GitHub all read
it. Basalt must treat it as a first-class citizen, not decoration.

### Current state in Basalt

- **Editor (TS) — display only.** `packages/editor/src/syntax/frontmatter.ts`
  adds a Lezer `YAMLFrontMatter` block node so the opening `---` is not eaten by
  `HorizontalRule`; `packages/editor/src/preview/frontmatter.ts` (wired at
  `live-preview.ts:230`) merely dims the block and colors keys/fences. There is
  **no structured model, no parsing into values, no editing, no extraction to the
  app.**
- **Rust — already structured.** `crates/basalt-parser/src/metadata.rs::extract_metadata`
  parses the frontmatter block with `serde_yaml_ng` into
  `FileMetadata.frontmatter: Option<serde_yaml_ng::Value>`
  (`crates/basalt-types/src/metadata.rs:11`), alongside UTF-16 spans for
  tags/links/headings/block-ids. `crates/basalt-wasm/frontmatter-wasm` exposes the
  synchronous C-ABI `fm_parse` to JS, and `benches/parse_metadata.rs` benchmarks
  it (at 1k docs).

### The concrete gap (a real defect today)

`extract_metadata` sets its link/tag scan cursor _past_ the frontmatter before
scanning (`metadata.rs:21`, `i = after_frontmatter`). Consequently **`[[links]]`
and `tags:` declared inside frontmatter are never added to `meta.links` /
`meta.tags`.** That is exactly the Obsidian "quoted wikilink in frontmatter is
not a graph/backlink edge" and "frontmatter tags are not indexed" problem — and
Basalt ships it today.

### What users actually struggle with (research)

From Sébastien Dubois' 2026 deep-dives on
[Obsidian Properties](https://www.dsebastien.net/the-complete-guide-to-obsidian-properties/)
(20k-note vault) and
[Dataview](https://www.dsebastien.net/the-complete-guide-to-dataview-in-obsidian/),
plus the
[Obsidian 1.9.10 Bases changelog](https://obsidian.md/changelog/2025-08-18-desktop-v1.9.10/):

1. **No note types; flat global property namespace.** One name → one type
   vault-wide (`types.json`). `pages` on a book ("page count") collides with
   `pages` on a site ("sub-pages"). Obsidian cannot scope it; a
   [forum FR for a type system](https://forum.obsidian.md/t/super-fr-enhance-obsidian-with-a-type-system-for-notes-and-database-like-views-metadata-object-oriented-model/46444)
   has stalled.
2. **Type mismatch = silent dead end.** Odd values turn orange and the _visual
   editor refuses to edit them_; you must drop to Source.
3. **The `---` must be byte-0.** A blank line above it silently demotes the
   whole block to plain text.
4. **Duplicate keys / malformed YAML** require manual cleanup.
5. **The quoted-wikilink trap.** `parent: "[[Note]]"` is a link for Dataview but
   _not_ for Obsidian (no graph/backlinks). The visual editor quotes for you;
   templates/scripts must hand-handle it.
6. **Dates-as-strings ruin sorting; types matter on day one.**
7. **Metadata sprawl**: synonyms, `Status` vs `status` (different properties),
   orphans. Discipline doesn't scale.
8. **Dataview results are invisible outside render** — not in graph, backlinks,
   search, git diff, or to an AI agent reading the raw file. "Serialize what
   matters."
9. **Inline fields `Key:: Value` are Dataview-only**, with no Properties
   equivalent → a fragmented metadata model.
10. **Indexing speed**: Datacore is described as a "WIP successor to Dataview
    with a focus on UX and speed," acknowledging Dataview's vault-wide indexing
    is slow.
11. **Bases** (1.9.10) are views _over_ Markdown + YAML properties; data stays in
    the file, the base is config. Dashboard-first, complementary to Dataview.

### Properties UX research — what Obsidian does well and badly (2026-08)

Second pass, specifically on Obsidian's **Properties** feature — the panel that
replaces raw YAML in the editor and the UI this ADR's widget design matches
against. Sources: official Obsidian Help (Properties), the
[practicalpkm Properties guide](https://practicalpkm.com/basics-of-properties-in-obsidian/),
[obsidianmate's Properties guide](https://obsidianmate.com/blog/properties-the-complete-guide-part-1-the-basics),
the
[Extended Properties plugin](https://github.com/dy-sh/extended-properties) and
[Better Properties](https://github.com/rwv/better-properties) plugins, plus
official-forum threads (data-loss reports and the type-system FR cited above).

**What Obsidian does well**

- **Plain-text, portable storage.** The panel is a friendly editor _over_ the
  same YAML frontmatter any tool can read; the files-first model survives.
- **Type-aware widgets.** The type drives the field: date → picker, checkbox →
  toggle, list → pill editor, link → note-autocomplete picker.
- **Vault-wide autocompletion** of property _names_ and previously-used _values_
  — a cheap, effective anti-fragmentation device.
- **Behavioral default properties** (`tags`, `aliases`, `cssclasses`) get real
  integrations: aliases feed the quick switcher, tags feed the tag pane, and
  link-type properties become graph/backlink edges.
- **Type mismatch is visible** (an orange "Type mismatch, expected X" warning
  instead of silently mis-parsing) — though see the trap below.
- **Escape hatches:** per-app Display modes (Visible / Hidden / Source), Source
  mode per note, `Cmd+;` add-property, a Properties sidebar pane, and vault-wide
  property rename (merges synonyms) from All properties.

**What Obsidian does badly**

- **No note types; a flat, global property namespace** (`types.json`): one name
  → one type vault-wide, unscopable (research point 1). Community plugins
  ("Better Properties" schemas) only paper over it.
- **Type mismatch traps you in Source mode** — orange values cannot be edited in
  the panel (research point 2). ADR-022 already rejects this: diagnostics are
  non-blocking, editing never disabled.
- **One invalid value can destroy the whole section.** A single unquoted colon
  invalidates _all_ properties, and adding a new property afterwards can
  silently rewrite away the existing section (forum: "Invalid properties may
  cause data loss"). Whole-block rewrites are a hard no for us.
- **types.json is a partial, guessed sidecar** — only explicitly chosen types
  are stored, everything else is inferred, and plugins fake behavior by patching
  `metadataCache` (e.g. Typed Tags) → fragmented sources of truth.
- **No controlled vocabularies / enums / value restrictions**, and no core path
  to custom property types; the gap is entirely filled by plugins.
- **No date maintenance**: `created`/`updated`/`viewed` are never written by
  Obsidian; only templates' `{{date}}` placeholders or plugins fill the gap.
- **Broken at our scale**: link autocomplete degrades past a few hundred notes
  (~29K searchable items, 2024 bug graveyard), duplicate keys need manual
  removal, nested properties unsupported, and a blank line above `---` silently
  demotes the block.

### Why this is Basalt's opening

Because Rust **already** parses frontmatter into a structured value, Basalt can
make properties **first-class app state** rather than a plugin-render-only
artifact. That by construction solves research point 8: if the live model feeds
search/graph/backlinks natively, properties show up everywhere. The single
highest-leverage fix is closing the extraction gap above.

This ADR sits on three accepted foundations: **ADR-007** (Rust owns heavy
parse/index; TS owns gestures), **ADR-019** (one keystroke = one pass; no nested
dispatch; benchmark-gated; "why not Rust per keystroke"), and **ADR-018** (shell
renders from registries — dock-appropriate panels are `registerView`s; Properties
is deliberately _not_ one, see rule 7). **ADR-020**
sets the ≥25k-note perf tier and the WASM-compute path we reuse.

## Decision

### Governing principle

**Frontmatter is a typed, vault-wide model owned by Rust. The editor exposes it
through a pure, dependency-injected model plugin that reparses only when the
frontmatter region changes. The UI edits surgically via spans. Properties feed
graph, search, and backlinks natively — never as a render-only layer.**

### Rules (binding on the listed crates/packages)

1. **One parser of truth.** Fix `extract_metadata` so its link/tag scan also
   covers the frontmatter block (extract `[[…]]` and `tags:`/`aliases:` from it).
   Add `parse_frontmatter(input) -> FrontmatterModel { values: Vec<(key,
FrontmatterValue, Span)>, diagnostics: Vec<Diag> }` returning **typed** values
   and **UTF-16 per-key/value spans**. The vault indexer and the live editor call
   the _same_ function → no live/indexed drift.
2. **Parser injection keeps `packages/editor` pure.** The editor receives the
   parser through `EditorConfig.parseFrontmatter`, exactly like the existing
   `onFetchLinks` / `onFetchTags` callbacks (`packages/editor/src/editor.ts`).
   The feature layer supplies the WASM-backed implementation. The package imports
   **no** WASM/IPC/`@tauri-apps` — preserving the `AGENTS.md` purity rule and
   keeping it unit-testable with a stub.
3. **Incremental reparse (ADR-019).** A `frontmatterModelPlugin` (`StateField` +
   `ViewPlugin`) reparses only when a transaction's changed range intersects the
   `YAMLFrontMatter` node (the Lezer node already computed for decoration). Body
   typing pays **zero** frontmatter cost. Diagnostics are **non-blocking**
   decorations (orange-ish) — editing is never disabled (rejects Obsidian's trap,
   point 2).
4. **Surgical edits, not re-serialization.** The visual editor rewrites only the
   changed key's line range, using the spans from `parse_frontmatter`. This
   preserves formatting, is **CRLF-safe** (avoids the "wiped all frontmatter on
   CRLF" class of bug), and minimizes doc churn.
5. **Typed registry + per-note-type schemas.** `basalt-types` defines
   `PropertyType` (text / list / number / checkbox / date / datetime / link) and
   a vault-wide type registry (`types.json`-style), extended to **per-note-type
   schemas** — the gap Obsidian cannot close (point 1). A **link-aware value
   type** round-trips `"[[Note]]"` on disk ↔ `[[Note]]` in the UI, and is always
   treated as a graph/backlink edge.
6. **First-class downstream.** `apps/tauri/src/shared` feeds the live frontmatter
   model into the search index, the graph (links), and backlinks. Native, not
   plugin-render-only (closes point 8).
7. **Properties live inline at the top of the note, Obsidian-style.** The
   Properties surface is the **inline block widget** replacing the YAML at the
   top of the editor canvas (the note's header block) — exactly where Obsidian
   shows it. There is **no side-dock properties panel** and no window
   header-band strip: the window's 40px header band is chrome (tabs/ribbon/dock
   headers), and Obsidian puts properties in the note, not the chrome. In
   _reading / live-preview_ the same block renders dim (rule 11); editing
   happens where the note is.
8. **Benchmark-gated (ADR-019 / ADR-020).** Add a `blockWidgets` entry to
   `EditorExtensionGroups` (`packages/editor/src/editor.ts`) so the isolation
   benchmark attributes per-keystroke cost. Extend `parse_metadata` to a **25k-note
   frontmatter corpus** (ADR-020's scale rule). Acceptance: keystroke p95 stays
   flat with vs without frontmatter; vault-wide extraction stays within its
   Criterion budget.

### Widget architecture (update 2026-08-30)

The inline Properties widget is a block `Decoration.replace` over the frontmatter
span (`blockSpan.start` → end of the closing `---`): the raw YAML is replaced on
screen by an interactive panel, and the document text is only ever touched via
span-scoped edits. The architecture that makes the widget scalable, multi-pane
safe, and extensible to future property types:

9. **Synchronous model via WASM; IPC stays off the keystroke path.** The editor
   parses frontmatter **in the webview** through the standalone
   `crates/basalt-wasm/frontmatter-wasm` (C-ABI `fm_parse`, the same `?init` load path as
   `crates/basalt-wasm/graph-wasm`), wrapped and injected as `EditorConfig.parseFrontmatter`
   (rule 2). A frontmatter-region transaction reparses and re-renders the
   widget in the same frame — no async gap, no "widget lags the keystroke."
   The Tauri `parse_frontmatter` **command** remains for the vault
   indexer/batch only. _Landing note (2026-08-30 amend): the previous
   deviation (feature-layer IPC + module-global cache/debounce/reparse
   effect) is deleted; the sync WASM path is the code._*
10. **Per-view state, never module globals.** The live-preview field's
    `widgetModels` (kernel) is the single per-editor holder of the model;
    `surgicalEdit` is bound to its own `EditorView`; the widget binds its view
    at `toDOM`. There is **no `activeView` singleton, no shared
    cache, no global refresh timer** — split panes (ADR-018 Phase 3) each own their
    model and widget, so panes can never render each other's state. The inline
    Properties surface (rule 7) _is_ the widget; it reads the model from its own
    field and there is no separate panel store to keep in sync.
11. **Explicit render-mode facet.** `blockWidgetModeFacet` (per widget id) ∈
    `"widget"` (editing surfaces: the inline Properties widget — Obsidian's
    model), `"dim"` (read-only
    / live preview: tinted YAML via the `--sat-frontmatter-*` token group),
    `"none"` (Source mode / power users). Which surface shows what is declared,
    not a side-effect of which callbacks happen to be wired.
12. **Widget = registry of per-type field components (ADR-018 pattern).** The
    widget dispatches each entry on its `PropertyType` to a registered field
    component (`registerPropertyField(type, component)`): text, list/chips,
    number, checkbox, date / datetime (picker + one-click insert of
    `frontmatterDefaults.today|now`), tags, link (nucleo note-picker), url,
    enum/select. **Adding a property type = one Rust enum variant + one
    registered field component** — no editor surgery and no metadataCache-style
    patching (unlike Obsidian's plugin hacks). Value autocompletion (vault value
    corpus, tag corpus, note-title corpus, schema enum) flows from a single
    `suggestFor(type, key)` seam supplied through `frontmatterFetchFacet` — the
    same extensibility mechanism Obsidian's global `types.json` lacks.
13. **Data-loss-safe by construction.** Diagnostics are non-blocking; edits are
    span-scoped; **no code path may rewrite the whole block or drop a section to
    "fix" a value** (Obsidian's silent-rewrite class of bug). A malformed entry
    offers a _fix action_ (quote it, coerce to type, drop duplicate) instead of a
    silent rewrite, and `created` / `updated` / `viewed` auto-date maintenance is
    a first-class `frontmatterDefaults` behavior (gated behind config), where
    Obsidian leaves it to templates or plugins.
14. **One kernel, many block widgets (extensibility rule — added 2026-08-30).**
    The Properties widget is the **first** of a family of _block widgets_:
    syntax-node-matched blocks (frontmatter, and tomorrow callouts and embeds,
    citations, datasheets…) replaced on screen by an interactive widget while the
    document text stays untouched. They all render through one registry
    (`packages/editor/src/block-widgets/registry.ts`): a spec has `id`,
    `matches(node)`, synchronous `parse`, `render`, `span`, optional read-only
    `decorateDim`, and `theme`. The registry is **fused into live-preview's
    single tree walk** (ADR-019 rule 2) via `handleBlockWidgetsNode`, so N widget
    types still cost exactly one pass and a spec's parse runs inside the StateField
    where no view exists; widgets bind the view at `toDOM` for their edits.
    Per-widget parsed models collect into the field's `widgetModels[id]` and are
    read externally via `getBlockWidgetModel(view, id)` — genuinely per-view
    (rule 10), never module-global. Adding a widget = one generic spec file +
    one boot entry (`registerBlockWidget` / an editor group); **no live-preview
    edits, no new StateFields, no shell surgery.** Rendering per surface remains
    declared via the mode facet (rule 11), now generalized to
    `blockWidgetModeFacet` ("widget" | "dim" | "none") keyed by widget id. The
    frontmatter spec lives in `block-widgets/frontmatter.ts` and is registered by
    the `blockWidgets` extension group; read-only previews register the same spec
    under the `frontmatterDimMode` facet to keep the tinted-YAML presentation.

### Layer map

```
Rust (single source of truth)
  basalt-parser::parse_frontmatter  ──►  FrontmatterModel {typed values, UTF-16 spans, diags}
  basalt-parser::extract_metadata    (fixed: FM links/tags/aliases)  ──► vault index
  basalt-types::{FrontmatterValue, PropertyType, TypeRegistry}
  crates/basalt-wasm/frontmatter-wasm            (C-ABI fm_alloc/fm_parse/fm_ptr/fm_len; WASM `?init`)

Webview (per keystroke, synchronous via frontmatter-wasm)
  packages/editor (pure)
    block-widgets/registry.ts        ── generic kernel: blockWidgetSpecsFacet + mode facet +
                                       handleBlockWidgetsNode (fused into the one walk, ADR-019)
    block-widgets/frontmatter.ts     ── the frontmatter spec + dep facets + dim-mode facet + watcher
    preview/live-preview.ts          ── single walk owns livePreviewField.widgetModels;
                                       getBlockWidgetModel(view, id); requestPreviewRebuild
    FrontmatterWidget                ── block Decoration.replace; view bound at toDOM;
                                       propertyFieldRegistry (type→field) [rule 12 — future]
    surgicalEdit(view, …)            ── span-scoped edits, bound to its own view
    frontmatterFetchFacet            ── suggestFor(type, key): value/tag/title/enum suggestions
  features/editor
    frontmatter-wasm.ts (sync loader + parser) · parseFrontmatter (injected) ·
    surgicalEdit (feature-side spans) · initFrontmatterWasm (boot race)
  shared
    live model ──► search index · graph edges · backlinks
  app-shell
    (no properties panel — Properties is the inline widget at the top of the note)
  packages/theme
    --sat-frontmatter-* tokens (tinted YAML in "dim" mode)
```

### Rejected alternatives

- **JS YAML parser inside the editor (e.g. `yaml` / `js-yaml`).** A second parser
  → drift vs the Rust-indexed model; JS allocation at vault scale violates
  ADR-007. Reuse Rust via WASM.
- **Rust per keystroke over Tauri IPC.** Re-litigates ADR-019's "Why not Rust for
  the keystroke path": serializing document state across IPC each keystroke costs
  more than the compute and breaks CM6's synchronous-tree contract. WASM runs _in_
  the webview (no IPC), so it is acceptable; full re-parse of the FM block is
  still avoided via the intersect guard.
- **Full re-serialize of the block on every edit.** Formatting loss, CRLF-wipe
  risk, larger churn. Rejected in favor of span-based surgical edits (rule 4).
- **Blocking validation (Obsidian's orange → uneditable).** Traps users in broken
  state. Rejected; use non-blocking diagnostics + a fix action (rule 3).
- **Full YAML 1.1 everywhere.** Frontmatter is a constrained subset (maps of
  scalar/list/date/number/bool). A hand-rolled FM scanner may beat
  `serde_yaml_ng` for 25k×N indexing — but treat as a **benchmark-gated**
  optimization, not an upfront rewrite.

## Consequences

- `basalt-parser` gains `parse_frontmatter` and the `extract_metadata`
  FM-link/tag fix; `basalt-types` gains `FrontmatterValue` / `PropertyType` /
  type registry; `crates/basalt-wasm/frontmatter-wasm` exposes the C-ABI keystroke parser.
- `packages/editor` gains the **block-widget kernel** (`block-widgets/registry.ts`),
  the frontmatter spec + dep facets (`block-widgets/frontmatter.ts`), the fused
  `handleBlockWidgetsNode` dispatch + per-view `widgetModels` in the live-preview
  field, `getBlockWidgetModel`/`requestPreviewRebuild`, `FrontmatterWidget`
  (view-bound edits), the per-type `propertyFieldRegistry` (rule 12),
  `frontmatterModeFacet` (rule 11), `frontmatterFetchFacet`/`suggestFor`, and a
  `blockWidgets` isolation group — all pure. The bespoke `frontmatter-model.ts`
  StateField is deleted.
- `features/editor` supplies the sync WASM loader + parser impl and deletes the
  IPC-on-keystroke globals (`useFrontmatter` store, refresh timer, activeView
  cache); `shared` wires frontmatter into search/graph/backlinks; the
  Properties surface is the inline widget itself — there is **no side-dock
  panel** (ADR-018 view registration is not used for Properties; it stays
  reserved for dock-appropriate panels like Files and Backlinks).
- Frontmatter `[[links]]` and `tags:` become real graph/backlink/search edges —
  Basalt's headline differentiator over Obsidian's plugin-only metadata.
- **Adding a new block widget** (callout, embed, citation, datasheet…) is one
  `BlockWidgetSpec` file + one registration — no editor-plumbing changes. The
  live-preview walk stays single-pass regardless of how many widget types exist.
- Risks to manage:
  - `serde_yaml_ng` key-order preservation (uses `IndexMap`) must be verified
    before relying on it for surgical edits; if it reorders, parse to an
    explicitly ordered map.
  - YAML quoting for the link round-trip must quote `"[[Note]]"` only when
    required and unquote on read, so the panel shows `[[Note]]` while the file
    stays valid.
  - Adding a new `PropertyType` touches both Rust (`basalt-types` enum +
    `basalt-parser` parse arm) and TS (one `registerPropertyField` call). The
    two must stay in lockstep; a mismatch surfaces as an unregistered-field
    diagnostic rather than a silent mis-render.
  - The kernel makes large-doc (`>48KB`) frontmatter edits update the widget on
    the idle-tick rebuild rather than the same keystroke (they travel the lazy
    decoration path). Acceptable at this scale; revisit if a giantnote
    frontmatter edit feels sticky.

## Verification

- **Unit (`basalt-parser`):** `parse_frontmatter` extracts FM `[[links]]` into
  links and `tags:` into tags; duplicate keys and malformed YAML produce
  diagnostics (not panics); typed coercion (date string → date, `"5"` → number)
  behaves; spans map to correct UTF-16 ranges.
- **Editor isolation bench:** the `blockWidgets` group shows p95 ≤ baseline +
  small additive at 100KB; at the 25k corpus, vault-wide extraction stays within
  Criterion budget (ADR-020).
- **Widget, multi-pane:** with two panes open on different notes, editing a
  property in one never changes the other's model; a split-pane open during a
  frontmatter edit shows no cross-pane render. `blockWidgetModeFacet` in
  `"dim"` renders tinted YAML; `"none"` is invisible; `"widget"` renders the
  panel.
- **Kernel extensibility:** register a second trivial `BlockWidgetSpec` in a
  test; assert it renders on its node, its model is readable via
  `getBlockWidgetModel`, and the live-preview walk still completes in one pass
  (widget + fields produce no added tree iteration). Breadcrumb of rule 14:
  the frontmatter migration already exercises the identical path.
- **Data-loss safety:** a malformed value (unquoted colon, duplicate key, type
  mismatch, blank line above `---`) produces a non-blocking diagnostic with a
  fix action; the document is never survived a whole-block rewrite. Property
  edits change only the key's span; CRLF files round-trip unchanged elsewhere.
- **Extensibility:** adding a fresh `PropertyType` requires only the Rust
  variant + one registered field component; a unit test registers a custom
  type and exercises its widget + round-trip without touching the editor.
- **Manual:** edit a property in the visual panel → graph/backlinks/search update;
  type in the body → profiler shows no frontmatter reparse; introduce a blank
  line above `---` → non-blocking diagnostic, still editable.
