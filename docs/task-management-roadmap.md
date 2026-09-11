# Task Management — Review, Parity Gaps & Beyond-Obsidian Roadmap

> Living discussion note (not an ADR). Captures the 2026-09-11 review of ADR-048
> native task management, the verified capability matrix, the bug list, and the
> integration ideas we want to push further than Obsidian Tasks.
> Authoritative implementation details live in
> [`docs/adr/048-native-task-management-system.md`](adr/048-native-task-management-system.md).

---

## 1. Where the code lives (the full surface)

The "task feature" isn't one folder — it's six surfaces that currently disagree
with each other in places (§3):

| Surface           | Location                                                                                     |
| ----------------- | -------------------------------------------------------------------------------------------- |
| Frontend feature  | `apps/tauri/src/features/tasks/` (components, hooks, store, lib/commands)                    |
| Editor package    | `packages/editor/src/input/task-signifiers.ts`, `task-list.ts`, `block-widgets/task-query-*` |
| Rust IPC commands | `apps/tauri/src-tauri/src/commands/tasks/{mod,line,signifiers,serializer}.rs`                |
| Rust types        | `crates/basalt-types/src/task.rs` (`TaskData`, `TaskStatus`, `TaskPriority`)                 |
| Rust scanner      | `crates/basalt-parser/src/task_scan.rs` (fused into the ADR-041 metadata pass)               |
| Rust query engine | `crates/basalt-tables/src/output.rs` (`execute_task_query`, urgency)                         |

---

## 2. Verified capability matrix

### 2.1 What works today (confirmed in code)

**Authoring**

- Checkbox tasks: `- [ ]`, `* [ ]`, `1. [ ]`, indented, blockquotes (`> - [ ]`) —
  scanned natively during indexing, no JS regex pass
- 6 statuses via checkbox char: todo `[ ]`, in_progress `[/]`, on_hold `[?]`,
  done `[x]`/`[X]`, cancelled `[-]`
- 5 priorities (`🔺 ⏫ 🔼 🔽 ⏬`); 6 dates (`➕ 🛫 ⏳ 📅 ✅ ❌`);
  recurrence `🔁` (stored verbatim incl. `when done` flag); inline tags incl.
  nested `#a/b`; `🆔` id, `⛔` depends-on, `🏁` on-completion (parsed, stored only)
- In-editor: click checkbox cycles status; `Cmd/Ctrl+Enter` toggle;
  `tasks:cycle-status`; `tasks:postpone` (tomorrow); priority badge, date/tag
  chips (overdue = red), strikethrough on done
- Create/Edit modal: description, status, priority, due/scheduled/start date
  pickers, recurrence presets + custom, tags. Create appends a line to the file
  end; edit rewrites the line in place (CM6 doc is the source of truth)

**Querying (` ```tasks ``` ` blocks)**

- Filters: status is / `done` / `not done`, priority (is/above/below), date
  filters with relative tokens (`today`, `this week`, `next week`, `last
week`), `no <field> date` / `exists`, description/tags/path/folder/filename
  includes, `is recurring`, `is blocked` / `is not blocked`
- Sort: 11 fields (+`reverse`); Group: 8 fields with per-group counts;
  `limit N`; short/full mode + hide-switches; urgency score (Rust); unsupported
  instruction footer

**Glue** — 8 palette commands, `Mod+Enter` keybinding, settings _declarations_
(specs in `features/settings/specs/tasks.ts`)

### 2.2 What does NOT work today

**Parity gaps vs Obsidian Tasks**

1. **Recurrence never advances** — `🔁 every week` is stored/displayed but
   completion does nothing. No next-occurrence computation, no auto-rewrite of
   reference dates, no `when done` scheduling. (ADR Phase 2, never built.)
2. **Auto date stamps inert** — `tasksDoneDateAutoAdd`, `tasksCreatedDateAutoAdd`,
   `tasksCancelledDateAutoAdd`, `tasksStatusSequence`, `tasksGlobalFilter`,
   `tasksDefaultPriority` exist as config but **nothing reads them at runtime**.
   Marking done never writes `✅ 2024-01-07`.
3. **Query results are read-only** — no live checkboxes, no edit/postpone
   buttons, no backlink column. The IPC for all of it exists (`toggle_task`,
   line lookup) — it's just never rendered.
4. **No natural-language dates** — filter tokens are fixed (`today`/`tomorrow`/
   `this week`…); no `Friday`, no `in 3 days`; and the modal accepts ISO only.
5. **No blocked/⚠ UX** — `⛔ depends_on` is queryable but never displayed.
6. **No boolean combos, regex, or heading filters** — all filters AND-combined
   only.
7. **Create appends to file end**, not at cursor/section.
8. **No board/kanban** (excluded by user), **no calendar**, **no task duration**.

**Bugs found in review (verified)**

- `status is in progress` / `status is on hold` filters never match — engine
  compares `format!("{:?}", status).to_lowercase()` (`"inprogress"`/`"onhold"`)
  against snake_case wire values; the parser additionally keeps the space
  (`"on hold"`). Affects the Status column output too.
- `not done` wrongly includes `cancelled` tasks (engine only excludes `done`).
- CRLF files destroyed by `lines()` + `join("\n")` in `toggle_task` /
  `update_task` / `create_task` (scanner handles CRLF; commands don't).
- Status cycle divergence: TS `todo → in_progress → done` (editor toggle) vs
  Rust `todo → done → cancelled` (`toggle_task` IPC). One gesture, two machines.
- `sort by happens` sorts undated tasks _first_ (`None < Some` in derived Ord)
  — contradicts `date_field_cmp`'s undated-last rule elsewhere.
- Task-line `[[wikilinks]]` deliberately **not** indexed as links
  (`task_scan.rs` test asserts `meta.links.is_empty()`).

**Quality debt (sloppy / AI-generated smells)**

- `CreateTaskModal.tsx` ~560 lines vs 200 budget; three copy-pasted
  `<Select.Root>` blocks with identical class strings
- Fabricated "legacy" priority tokens in `signifiers.rs` (`🔴🟡🔵`, `最低`,
  `p0–p4`) — not real Obsidian tokens; "last wins" vs scanner's "first wins"
- Checkbox-char ↔ status mapping exists 4–5× (`STATUS_CHAR_MAP`,
  `statusFromMarker`, `statusFromChar`, TS switch, Rust `checkbox_char_to_status`)
- Dead code: `TaskBadge`, `TaskDateChip`, `TASK_ICONS`, `TaskMeta`,
  `PRIORITY_EMOJI`, `STATUS_CHAR_MAP`, `getTasks` + `toggleTask` in
  `useTaskActions` — all zero consumers
- `useTaskActions.getTasks` typed with `unknown[]`; wire types duplicated vs
  `task-query-types.ts`
- `toggle_task` uses loose `parse_checkbox_line` (matches `foo [x] bar`) while
  `update_task` uses the strict parser — inconsistent "is a task" definition

---

## 3. Structural decision: a `basalt-task` crate

Proposed: **create `crates/basalt-task/`** as the task _domain layer_.

**Dependency chain works:** `basalt-tables → basalt-task → basalt-vault →
basalt-parser → basalt-types`. No cycle (vault does not depend on tables).

**Moves in:**

- Signifier grammar — single source of truth for emoji↔field, checkbox-char↔
  status, status cycle, priority rank (today exists 3× and disagrees)
- Line parse/serialize round-trip (`line.rs` + `serializer.rs` — now pure
  functions trapped in `src-tauri`, untestable without `State`; violates
  CONVENTIONS §11.5)
- Task query execution (`execute_task_query`, `matches_filter`, sort, urgency)
  out of `basalt-tables` (tables then depends on task for the DQL TASK branch)
- Delete the `String`-based statuses in `signifiers.rs` — type everything against
  the real `TaskStatus`/`TaskPriority` enums (kills `"deferred"`, which exists
  in strings but not the enum)

**Stays where it is:**

- `TaskData`/`TaskStatus`/`TaskPriority` in `basalt-types` (leaf type everyone
  consumes; moving it up creates a cycle)
- `task_scan.rs` in `basalt-parser` (fused into the hot scan pass; moving it
  creates `parser → task → vault → parser`)

**Result:** `commands/tasks/` collapses to thin IPC wrappers.

### 3.1 Migration mechanics (phases + gates)

Target crate: `crates/basalt-task/` (lib name `basalt_task`).

**Dependencies:** `basalt-types`, `basalt-vault`, `chrono` (dates), `serde`
(wire structs). No `basalt-parser` dep — the crate parses _lines_, not
files; the scanner stays in `basalt-parser`.

**New file map** (pure moves today, typed rewrites where noted):

| Source (today)                               | Target                          | Change                                                                                                                                                                                                                                |
| -------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src-tauri/commands/tasks/signifiers.rs`     | `basalt-task/src/signifiers.rs` | Typed rewrite: `checkbox_char_to_status`/`status_to_checkbox_char` → return `TaskStatus`; delete `"deferred"` string status + fabricated legacy tokens (`🔴🟡🔵 最低 p0–p4`) + `DEFAULT_STATUS_CYCLE`; priority maps → `TaskPriority` |
| `src-tauri/commands/tasks/line.rs`           | `basalt-task/src/line.rs`       | Move as-is (unify `parse_checkbox_line`/`parse_task_line_parts` into one strict parser while here)                                                                                                                                    |
| `src-tauri/commands/tasks/serializer.rs`     | `basalt-task/src/serializer.rs` | Move; merge `build_task_line` + `build_task_line_from_parts` into one builder                                                                                                                                                         |
| `basalt-tables/src/output.rs` (task section) | `basalt-task/src/query.rs`      | Move + fix bugs in place (typed status matching, `not done` excludes cancelled, `happens` undated-last)                                                                                                                               |
| `basalt-tables/src/urgency.rs`               | `basalt-task/src/urgency.rs`    | Move as-is                                                                                                                                                                                                                            |

`TaskQuery`/`TaskFilter`/`TaskSort` + `execute_task_query` move to `basalt-task`;
`basalt-tables` **re-exports** them so `engine.rs` (DQL TASK branch) and the
`get_tasks` IPC wire shape are untouched.

**Phases:**

1. **Skeleton** — `Cargo.toml` + empty `lib.rs`, add to workspace members,
   `cargo check` passes. No behavior.
2. **Signifiers/line/serializer move** — relocate + typed rewrite; unit tests
   migrate with the code. Gate: `cargo test --package basalt-task` +
   `src-tauri` compiles.
3. **Query exec move** — relocate from `basalt-tables`, add re-export;
   apply the bug fixes (status matching, not-done, happens) in the same commit.
   Gate: `cargo test --workspace`.
4. **Thin the command layer** — `commands/tasks/mod.rs` keeps the
   `#[tauri::command]` signatures; bodies call `basalt_task::…`;
   read-modify-write (`write_and_reindex`, CRLF-preserving line replacement)
   stays command-side (it's `AppState`/`index_upsert` territory). Delete
   src-tauri copies. Gate: `cargo test` in src-tauri + manual toggle/create/edit.

**Not moving** (unchanged from §3): `TaskData`/`TaskStatus`/`TaskPriority`
stay in `basalt-types`; `task_scan.rs` stays in `basalt-parser`.

**Wire/ABI invariant:** the serde shapes on the wire (`TaskLineResult`,
`TaskQuery`, checkbox chars) are byte-identical — zero frontend changes.
The command names (`get_tasks`, `toggle_task`, …) and `generate_handler!`
registration are untouched.

**Icons — direction agreed (2026-09-11), recorded in ADR-048 §17:** emoji
signifiers are the _data format_ (markdown syntax, Obsidian-compatible, scanned
by Rust) — they stay in the file, always. What looked unprofessional is the
_rendering_: raw OS-font emoji with baked-in colors (can't obey `--sat-*`),
plus EOL chip duplication, plus **zero chrome in reading mode / PDF export**
(`taskListPlugin` is edit-mode-only).

Decision: a `packages/icons` SVG glyph set (~20 icons, `currentColor` paths,
ISC/Apache-derived or hand-authored); each signifier span is replaced by a
glyph widget via the same `Decoration.replace` mechanism as the checkbox, in
BOTH edit and reading mode (closes the PDF gap). Theming via `currentColor` +
the existing `--sat-*` priority/date maps; source mode keeps raw emoji; delete
the EOL chip duplication; optional `tasks.iconRendering: svg | emoji | off`
setting. Extend the `ICONS` registry in `packages/commands/src/icons.ts` for
palette/ribbon/toolbar chrome (keeps the icon-name contract).

Research basis (web, 2026-09-11): the Obsidian Tasks team solved the same
problem with a webfont hack (obsidian-tasks-group/obsidian-tasks-custom-icons)
— emoji codepoints → monochrome woff2 glyphs via `@font-face`. That's
monochrome-only (no per-signifier theming), non-interactive, a manual CSS
snippet. We own our renderer → real SVG widgets are strictly superior. Also
found: the Obsidian emoji-format surface is **20 signifiers**; we parse ~14
(missing `📍` location, `📝` note, `🔗` link, `⏰` time, `⏩` forward).

---

## 4. Beyond Obsidian — integration ideas (ranked)

| #   | Idea                                                                                                                                        | Integrates with                         | Why it beats Obsidian Tasks              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ---------------------------------------- |
| 1   | **Live task blocks** — toggle/edit/postpone inside `tasks` results as CM6 transactions (undoable)                                           | single renderer, editor widgets         | Obsidian's result edits bypass undo      |
| 2   | **Task lines in the link graph** — index `[[wikilinks]]` in task descriptions (small scanner change) → tasks become graph nodes + backlinks | graph view (WASM), backlinks panel      | Obsidian Tasks has zero graph presence   |
| 3   | **Daily-note rollover** — unfinished tasks from yesterday appear today; `🔁` advances reference dates                                       | Daily notes core plugin + templates     | Combo Obsidian needs 2 plugins to fake   |
| 4   | **Task search in quick switcher** — fuzzy-jump to task lines; `task:open due:today` operators                                               | tantivy + nucleo                        | Obsidian's switcher never searches tasks |
| 5   | **Focus/inbox dock** — urgency-sorted "due soon" panel + overdue counter in status bar                                                      | registry side docks, status bar         | Native GTD layer Obsidian lacks          |
| 6   | **Natural-language dates in modal** — type "next friday" → writes `📅`                                                                      | reuse query parser's date tokens        | Better than Obsidian's picker-only UI    |
| 7   | **Blocked ⚠ + dependency DAG** — "blocked by" chips, dependency chains                                                                      | `depends_on` already parsed; graph view | Obsidian shows flat ⚠ only               |
| 8   | **PDF task reports** — "due this week" export                                                                                               | reading-mode export                     | Obsidian needs 3rd-party export          |
| 9   | **Native speed moat** — scanner fused into SIMD index pass; task queries at 25k scale                                                       | ADR-041/042/045                         | Obsidian re-regexes in JS on every save  |

---

## 5. Proposed work order

1. **Fix the 6 bugs** (status filters, cycle divergence, CRLF, not-done, happens
   sort, + link indexing decision) — they poison the parity story
2. **Parity push** — recurrence advancement engine; wire the inert settings
   (auto-dates, global filter, status sequence == single cycle definition);
   lock one status machine everywhere
3. **`basalt-task` crate** — host 1+2 cleanly (§3)
4. **Interactivity + integrations** — table §4 top-down
5. **Icons** — polish layer, editor chrome first

---

## 6. Open questions for the next session

- Order agreement: crate-first (fixes land in the right home) vs bugs-first?
- Is the kanban board coming back (ADR-048 Phase 6)? Affects icon set scope.
- Icon authorship + license: derive from Lucide (ISC, as the Obsidian custom-
  icons repo does) vs hand-author vs draft the glyph manifest for approval?
- Icon rendering setting: default `svg` or `emoji` initially (ADR-048 §17.2 lists
  `tasks.iconRendering: svg | emoji | off`)?
- Parse the 5 unparsed Obsidian signifiers (`📍 location, 📝 note, 🔗 link,
⏰ time, ⏩ forward`) or declare them non-goals? (ADR-048 §17.4)
- Should task-line wikilinks be indexed (graph/backlinks integration) or stay
  excluded (current behavior)?
- Recurrence engine scope: Obsidian-parity rules only, or also Basalt-only
  semantics (e.g. auto-rollover of date fields on completion)?
