# ADR-048: Native Task Management System

**Status:** Accepted (2026-09-10)
**Date:** 2026-09-10
**Extends:** ADR-027 (DQL Query Engine), ADR-028 (DQL Aggregation), ADR-041 (Zero-AST Scanner + SIMD), ADR-045 (DQL Execution & Optimization), ADR-036 (Core Plugin Architecture)

---

## 1. Context & Motivation

### The Obsidian Tasks Plugin Gap

The [Obsidian Tasks plugin](https://github.com/obsidian-tasks-group/obsidian-tasks) (4.1M downloads, v8.2.2) is the fourth most popular community plugin. It transforms standard markdown checkboxes (`- [ ] ...`) into a structured task management system with dates, priorities, recurrence, dependencies, and a query language. It is the de facto task management layer for Obsidian power users.

**Obsidian Tasks runs entirely in JavaScript.** Every vault open triggers a regex scan of every `.md` file to extract task metadata. On a 25k-note vault, this takes 2–5 seconds and invalidates on every file save. The query engine, date parsing, recurrence calculation, and urgency scoring are all JS — no SIMD, no parallel parsing, no compiled optimization.

**Basalt already has the foundational pieces to build a strictly superior native implementation:**

| Obsidian Tasks Capability | Basalt Existing Piece | Gap |
|---|---|---|
| Regex task scanning | ADR-041 SIMD metadata scanner (`basalt-parser/src/metadata.rs`) | Scanner does not parse `- [ ]` lines today |
| Query language (custom) | DQL engine (`basalt-tables`) with `DataCommand::Task` + `execute_task_query` | No task-specific WHERE/SORT/GROUP predicates |
| Code block rendering | DQL widget (`packages/editor/src/block-widgets/dql-widget.ts`) detects `tasks` lang tag | No dedicated task query widget with task-specific UX |
| Checkbox toggle | `task-list.ts` (`packages/editor/src/input/`) renders and toggles checkboxes | No status cycle, no signifier parsing, no date handling |
| Settings | Zustand settings store (`features/settings/settings-data.ts`) + declarative sections | No task-specific settings |
| Dock panels | View registry (`app-shell/registrations.ts`) + SideDock pattern | No Tasks board view |

**The opportunity:** build a native task management system that is architecturally identical to Obsidian Tasks (same emoji signifiers, same query semantics, same user expectations) but runs 10–50× faster due to Rust scanning, and extends it with a kanban board view, native date pickers, and zero-plugin-load-time integration.

### What This ADR Defines

A complete native task management feature for Basalt, covering:

1. **Data model** — `TaskData` struct parsed from markdown checkbox lines
2. **Scanner extension** — ADR-041 scanner parses task signifiers during the existing SIMD pass
3. **Query language** — ` ```tasks ``` ` blocks with Obsidian Tasks-compatible filter/sort/group syntax
4. **Editor enhancements** — Priority badges, date chips, status cycling, enhanced checkbox widget
5. **Create/Edit modal** — Form UI for task creation with all fields
6. **Task Board dock** — Kanban view over tasks (like Obsidian's Tasks Overview plugin)
7. **Settings** — Global filter, status sequence, date behavior, recurrence options
8. **Commands + keybindings** — Palette commands, toggle hotkey, board view shortcut

---

## 2. Task Data Model

### 2.1 Markdown Line Format

A task line follows the Obsidian Tasks convention:

```markdown
- [x] Buy groceries 🔺 🔁 every week on Monday 🛫 2024-01-01 📅 2024-01-07 ⏳ 2024-01-05 ➕ 2024-01-01
```

The line is decomposed into:

| Component | Position | Example |
|---|---|---|
| List marker | Start | `- `, `* `, `1. ` |
| Checkbox | After marker | `[x]` |
| Description | After checkbox, before first signifier | `Buy groceries` |
| Priority signifier | Inline, any position | `🔺` (highest), `⏫` (high), `🔼` (medium), `🔽` (low), `⏬` (lowest) |
| Recurrence signifier | Inline, any position | `🔁 every week on Monday` |
| Start date | Inline, any position | `🛫 2024-01-01` |
| Due date | Inline, any position | `📅 2024-01-07` |
| Scheduled date | Inline, any position | `⏳ 2024-01-05` |
| Created date | Inline, any position | `➕ 2024-01-01` |
| Done date | Inline, any position | `✅ 2024-01-07` |
| Cancelled date | Inline, any position | `❌ 2024-01-06` |
| Task ID | Inline, any position | `🆔 task-1` |
| Depends-on | Inline, any position | `⛔ task-1` |
| On-completion | Inline, any position | `🏁 delete` or `🏁 keep` |
| Tags | Inline, any position | `#work`, `#urgent` |

**Order of signifiers does not matter.** The scanner processes them greedily left-to-right, consuming each emoji + its value.

### 2.2 Status Types

The checkbox character determines the status type:

| Character | Status Type | Matches `not done`? | Behavior |
|---|---|---|---|
| ` ` (space) | `NON_TASK` | No | Not a task — ignored by queries |
| ` ` (empty) | `TODO` | Yes | Default task state |
| `/` | `IN_PROGRESS` | Yes | Currently being worked on |
| `?` | `ON_HOLD` | Yes | Paused / awaiting input |
| `x` | `DONE` | No | Completed — auto-adds done date |
| `X` | `DONE` | No | Completed (alternate symbol) |
| `-` | `CANCELLED` | No | Cancelled — auto-adds cancelled date |

**Unknown symbols** (any character not in the above set) are treated as `TODO` with status name `Unknown` and next symbol `x`.

### 2.3 Priority Levels

| Emoji | Name | Numeric Rank | Display |
|---|---|---|---|
| `🔺` | Highest | 0 | Red badge |
| `⏫` | High | 1 | Orange badge |
| `🔼` | Medium | 2 | Yellow badge |
| _(none)_ | None | 3 | No badge (default) |
| `🔽` | Low | 4 | Blue badge |
| `⏬` | Lowest | 5 | Gray badge |

### 2.4 Recurrence Rules

After the `🔁` signifier, the recurrence rule text starts with `every`:

```
every 3 days
every weekday                    → Mon–Fri
every week on Monday
every week on Tuesday, Friday
every 2 weeks
every 3 weeks on Friday
every 2 months
every month on the 1st
every month on the last
every month on the last Friday
every month on the 2nd last Friday
every 6 months on the 2nd Wednesday
every January on the 15th
every year
```

Optional suffix: `when done` — next occurrence calculated from completion date instead of original date.

**Recurrence rule parsing:** The rule text is stored verbatim. On task completion, the Rust recurrence engine calculates the next occurrence date using the `rrule` crate (RFC 5545 compliant). This is a Phase 2 concern — Phase 1 stores the rule text and renders it; recurrence expansion on completion is deferred.

### 2.5 Date Priority for Recurrence

When calculating the next occurrence, the reference date is chosen in priority order:

1. Due date (`📅`)
2. Scheduled date (`⏳`) — unless `removeScheduledOnRecurrence` is enabled
3. Start date (`🛫`)

When `removeScheduledOnRecurrence` is enabled:

1. Due date
2. Start date
3. Scheduled date

### 2.6 `TaskData` Rust Struct

```rust
// crates/basalt-types/src/task.rs (NEW FILE)

use serde::{Deserialize, Serialize};
use chrono::NaiveDate;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum TaskStatus {
    Todo,
    InProgress,
    OnHold,
    Done,
    Cancelled,
    NonTask,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum TaskPriority {
    Highest,
    High,
    Medium,
    None,
    Low,
    Lowest,
}

impl TaskPriority {
    pub fn numeric(&self) -> u8 {
        match self {
            Self::Highest => 0,
            Self::High => 1,
            Self::Medium => 2,
            Self::None => 3,
            Self::Low => 4,
            Self::Lowest => 5,
        }
    }

    pub fn from_emoji(emoji: &str) -> Option<Self> {
        match emoji {
            "🔺" => Some(Self::Highest),
            "⏫" => Some(Self::High),
            "🔼" => Some(Self::Medium),
            "🔽" => Some(Self::Low),
            "⏬" => Some(Self::Lowest),
            _ => None,
        }
    }
}

/// A single task extracted from a markdown checkbox line.
///
/// Parsed by the ADR-041 scanner during the metadata scan pass.
/// Stored in `FileMetadata.tasks` alongside tags, links, and headings.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TaskData {
    /// 1-indexed line number in the source file.
    pub line: u32,

    /// Task description text (signifiers stripped).
    /// Leading/trailing whitespace trimmed.
    pub description: String,

    /// Checkbox status type derived from the character between `[` and `]`.
    pub status: TaskStatus,

    /// Priority level from emoji signifier. Defaults to `None`.
    pub priority: TaskPriority,

    /// Dates extracted from signifiers. `None` if not present.
    pub created: Option<NaiveDate>,
    pub scheduled: Option<NaiveDate>,
    pub start: Option<NaiveDate>,
    pub due: Option<NaiveDate>,
    pub done: Option<NaiveDate>,
    pub cancelled: Option<NaiveDate>,

    /// Recurrence rule text after `🔁`, e.g. "every week on Monday".
    /// Stored verbatim; parsed by the recurrence engine on completion.
    pub recurrence: Option<String>,

    /// Whether the recurrence uses "when done" timing.
    pub recurrence_when_done: bool,

    /// Tags found on the task line (e.g. `#work`, `#urgent`).
    pub tags: Vec<String>,

    /// Task ID from `🆔` signifier, for dependency tracking.
    pub id: Option<String>,

    /// Task IDs this task depends on, from `⛔` signifiers.
    pub depends_on: Vec<String>,

    /// On-completion action from `🏁` signifier.
    pub on_completion: Option<String>,

    /// UTF-16 byte span of the full line in the source document.
    /// Used by CM6 for decoration positioning.
    pub span_start: u32,
    pub span_end: u32,
}

impl TaskData {
    /// Whether this task is considered "done" for query filtering.
    pub fn is_done(&self) -> bool {
        matches!(self.status, TaskStatus::Done | TaskStatus::Cancelled | TaskStatus::NonTask)
    }

    /// Whether this task is actionable (matches `not done` filter).
    pub fn is_todo(&self) -> bool {
        matches!(self.status, TaskStatus::Todo | TaskStatus::InProgress | TaskStatus::OnHold)
    }

    /// The "happens" date — the earliest of due, scheduled, start.
    pub fn happens(&self) -> Option<NaiveDate> {
        self.due
            .or(self.scheduled)
            .or(self.start)
    }

    /// The next checkbox character when toggled.
    pub fn next_status_symbol(&self) -> char {
        match self.status {
            TaskStatus::Todo => '/',
            TaskStatus::InProgress => 'x',
            TaskStatus::OnHold => 'x',
            TaskStatus::Done => ' ',
            TaskStatus::Cancelled => ' ',
            TaskStatus::NonTask => ' ',
        }
    }
}
```

### 2.7 `FileMetadata` Extension

```rust
// crates/basalt-types/src/metadata.rs — ADD to existing struct:

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Default)]
pub struct FileMetadata {
    // ... existing fields unchanged ...

    /// Tasks extracted from markdown checkbox lines in this file.
    /// Parsed by the ADR-041 scanner during `extract_metadata()`.
    #[serde(default)]
    pub tasks: Vec<TaskData>,
}
```

**Backward compatibility:** `#[serde(default)]` ensures old bincode caches without `tasks` deserialize to an empty Vec. No cache invalidation required.

---

## 3. Scanner Extension (ADR-041 Integration)

### 3.1 Design Principle

The ADR-041 scanner already performs a zero-AST byte scan of every markdown file in two tiers:

- **Tier 1 (ASCII fast-path):** `memchr3` + single-byte comparisons, zero allocations, O(1) spans.
- **Tier 2 (Unicode fallback):** `SpanCursor` for multi-byte characters.

Task line parsing slots into `scan_body_tokens_ascii()` / `scan_body_tokens_unicode()` as a new scan case, triggered when bytes match `- [` or `* [` or a digit + `. [`.

**No extra I/O.** Task parsing runs during the same `extract_metadata()` call that already scans for tags, links, headings, and block IDs. The scanner is called once per file during indexing (ADR-042 parallel map) and during incremental reindex (background mtime sync).

### 3.2 Scanner Implementation

**File:** `crates/basalt-parser/src/metadata.rs`

**New function: `scan_task_line`**

```rust
/// Scan a markdown task line starting at byte position `i`.
///
/// Prerequisites: bytes[i..] starts with a list marker (`- `, `* `, or `1. `)
/// followed by `[` and a status character.
///
/// Returns the parsed `TaskData` and the number of bytes consumed (to advance
/// the scanner past this line), or `None` if the line is not a valid task.
#[inline]
fn scan_task_line(
    input: &str,
    bytes: &[u8],
    i: usize,
    meta: &mut FileMetadata,
) -> Option<usize> {
    // 1. Verify list marker + checkbox
    //    Match: ("- " | "* " | <digit> ". ") "[" <status_char> "]"
    //
    // 2. Extract status character → TaskStatus
    //
    // 3. Scan forward through the rest of the line for emoji signifiers:
    //    🔺 ⏫ 🔼 🔽 ⏬  (priority)
    //    📅 ⏳ 🛫 ✅ ❌ ➕  (dates — followed by YYYY-MM-DD)
    //    🔁  (recurrence — followed by text until next emoji or EOL)
    //    🆔  (task ID — followed by identifier text)
    //    ⛔  (depends-on — followed by identifier text)
    //    🏁  (on-completion — followed by "keep" or "delete")
    //
    // 4. Description = text between checkbox close `]` and first signifier
    //
    // 5. Tags = inline `#tag` references on the line
    //
    // 6. Return TaskData + bytes consumed (to EOL)
}
```

**Integration point:** Inside `scan_body_tokens_ascii()`, after the existing heading/tag/link checks, add a branch:

```rust
// After existing checks in scan_body_tokens_ascii():
if bytes[i] == b'-' && i + 1 < bytes.len() && bytes[i + 1] == b' ' {
    // Potential task line: "- [ ] ..." or "- [x] ..."
    if let Some(consumed) = scan_task_line(input, bytes, i, meta) {
        i += consumed;
        continue;
    }
}
```

**Performance characteristics:**

- Triggered only when byte = `-` followed by ` ` — rare outside list items, zero overhead for non-task files.
- Emoji bytes are unique high-bit patterns — detectable with single-byte comparison (no UTF-8 decoding needed for Tier 1).
- Date values (`YYYY-MM-DD`) are ASCII — parsed with the same `is_iso_date_string()` already in `basalt-types`.
- Zero allocations: `TaskData` is pushed directly to `meta.tasks` Vec.

### 3.3 Tier 2 Unicode Fallback

The `scan_task_line_unicode()` variant handles non-ASCII list markers (rare but possible) and multi-byte emoji. Uses the existing `SpanCursor` for UTF-16 position tracking. Same logic as Tier 1 but with cursor-advancing helpers.

---

## 4. DQL Task Query Engine Extension

### 4.1 Existing TASK Infrastructure

The DQL engine already has:

- `DataCommand::Task` in `basalt-parser/src/query/ast.rs`
- `execute_task_query()` in `basalt-tables/src/output.rs` — renders File + Task columns
- The DQL widget detects `tasks` as a language tag

**What's missing:** task-specific WHERE predicates, SORT fields, GROUP fields, and the ` ```tasks ``` ` block query language parser (which is separate from DQL).

### 4.2 Task Query Language

The ` ```tasks ``` ` code block uses a **line-based declarative syntax** (not DQL). Each line is one instruction. Lines are processed in order. This matches Obsidian Tasks semantics exactly.

**Parser location:** `packages/editor/src/block-widgets/task-query-parser.ts` (NEW)

```
# Filters — each line is AND-combined
not done                                    → status != Done, Cancelled, NonTask
done                                        → status == Done, Cancelled, NonTask
status is in progress                       → status == InProgress
status.name includes "custom"               → text match on status name
status.type is IN_PROGRESS                  → type match

# Date filters (each date type supports: before, on, on or before, after, on or after, is empty, exists)
due before tomorrow                         → due < tomorrow
due on 2024-01-07                           → due == 2024-01-07
due this week                               → due in [this_monday, this_sunday]
scheduled after today                       → scheduled > today
happens before next week                    → min(due, scheduled, start) < next_week
created after 2024-01-01                    → created > 2024-01-01
no due date                                 → due is empty
due exists                                  → due is not empty

# Priority filters
priority above medium                       → priority < Medium (numeric rank)
priority below high                         → priority > High
priority is highest                         → priority == Highest

# Text filters
description includes "buy"                  → substring match
description regex matches /buy|shop/i       → regex match
heading includes "Shopping"                 → section heading contains text

# Tag filters
tags include #work                          → task has tag
tag includes #urgent                        → alias for above

# File filters
path includes Projects/                     → file path substring
folder includes "Daily Notes"               → immediate folder match
filename includes "2024"                    → filename substring

# Recurrence
is recurring                                → recurrence is not null
is not recurring                            → recurrence is null
recurrence includes "weekly"                → recurrence text substring

# Dependencies
is blocked                                  → depends_on is not empty
is not blocked                              → depends_on is empty
is blocking                                 → task.id is referenced by another task

# Boolean combinations (parenthesized, single line)
(not done) OR (done)
(path includes Projects) AND NOT (tags include #archive)

# Custom filter (JS expression)
filter by function task.description.includes("urgent")

# Sort
sort by due                                 → ascending by due date
sort by due reverse                         → descending
sort by priority                            → ascending (Highest first)
sort by urgency                             → calculated score
sort by status.type                         → IN_PROGRESS → TODO → DONE
sort by description                         → alphabetical
sort by path                                → file path
sort by filename                            → file name
sort by heading                             → section heading
sort by tag                                 → first tag alphabetically
sort by created                             → creation date
sort by scheduled                           → scheduled date
sort by start                               → start date
sort by done                                → done date
sort by happens                             → combined date
sort by random                              → random order
sort by function <JS expression>            → custom sort

# Grouping
group by status                             → Done / Todo headings
group by status.name                        → by status name
group by status.type                        → by status type
group by due                                → by due date (with weekday)
group by done                               → by done date
group by scheduled                          → by scheduled date
group by start                              → by start date
group by created                            → by created date
group by priority                           → by priority level
group by urgency                            → by urgency category
group by recurring                          → recurring vs one-time
group by tags                               → by tags
group by path                               → by file path
group by root                               → by root folder
group by folder                             → by immediate folder
group by filename                           → by file name
group by heading                            → by section heading
group by backlink                           → by source note link
group by function <JS expression>           → custom grouping

# Display options
short mode                                  → compact display
full mode                                   → show all metadata
hide priority                               → hide priority badge
hide backlink                               → hide source note link
hide edit button                            → hide toggle button
hide postpone button                        → hide postpone button
hide due date                               → hide 📅
hide scheduled date                         → hide ⏳
hide start date                             → hide 🛫
hide created date                           → hide ➕
hide done date                              → hide ✅
hide cancelled date                         → hide ❌
hide recurrence rule                        → hide 🔁
hide on completion                          → hide 🏁
hide tags                                   → hide tags
hide id                                     → hide 🆔
hide depends on                             → hide ⛔
hide task count                             → hide "X of Y tasks"
hide toolbar                                → hide toolbar
show tree                                   → show task hierarchy
show urgency                                → show urgency score

# Limits
limit 100                                   → max 100 tasks
limit groups 5                              → max 5 tasks per group

# Debug
explain                                     → show query interpretation
```

### 4.3 Default Sort Order

When no `sort by` instruction is present, these are automatically appended (matching Obsidian Tasks):

```
sort by status.type
sort by urgency
sort by due
sort by priority
sort by path
```

When any `sort by` is present, the user's sort takes priority and the defaults are NOT appended.

### 4.4 Urgency Calculation

Urgency is a composite score. Phase 1 implementation (simple, correct):

```rust
fn calculate_urgency(task: &TaskData, today: NaiveDate) -> i32 {
    let mut score: i32 = 0;

    // Priority component (0–5 → score 0–25)
    score += (5 - task.priority.numeric() as i32) * 5;

    // Due date proximity
    if let Some(due) = task.due {
        let days_overdue = (today - due).num_days();
        if days_overdue > 0 {
            score += 20 + days_overdue.min(30); // overdue: 20–50
        } else if days_overdue == 0 {
            score += 15; // due today
        } else if days_overdue >= -3 {
            score += 10; // due within 3 days
        } else if days_overdue >= -7 {
            score += 5; // due within a week
        }
    }

    // Scheduled date proximity
    if let Some(scheduled) = task.scheduled {
        if scheduled <= today {
            score += 5; // scheduled today or past
        }
    }

    // Recurring tasks get a small boost
    if task.recurrence.is_some() {
        score += 2;
    }

    score
}
```

### 4.5 Engine Extension

**File:** `crates/basalt-tables/src/engine.rs`

In `execute_query()`, the `DataCommand::Task` branch already exists but delegates to `execute_task_query()`. Extend it:

1. **Filter phase:** When the query includes task-specific predicates (from the ` ```tasks ``` ` parser), iterate `vault.metadata(path).tasks` for each document and apply predicates against each `TaskData`.

2. **Sort phase:** Task-specific sort fields (`due`, `priority`, `urgency`, `status.type`, `happens`) are evaluated against `TaskData` fields.

3. **Group phase:** Task-specific group fields produce headings from `TaskData` properties.

4. **Output phase:** `execute_task_query()` is extended with optional columns: Status, Priority, Due, Scheduled, Tags, Urgency.

### 4.6 Query Execution Flow

```
```tasks code block content
        │
        ▼
task-query-parser.ts (TS)
  Parses line-by-line into TaskQueryInstructions
        │
        ▼
Serialize to JSON { filters, sorts, groups, display, limit }
        │
        ▼
invoke("run_query", { dql: taskQueryJSON })  (Tauri IPC)
        │
        ▼
commands/query.rs → basalt_tables::execute_task_query(vault, task_query)
        │
        ▼
Engine iterates vault.metadata(path).tasks for each document
  Applies WHERE → SORT → GROUP → LIMIT
        │
        ▼
Returns QueryResult { columns, rows, total }
        │
        ▼
task-query-widget.ts renders results in CM6 block widget
```

---

## 5. Editor Enhancements

### 5.1 Enhanced Checkbox Widget

**File:** `packages/editor/src/input/task-list.ts` (EXTEND existing)

Current behavior: renders `[ ]` / `[x]` as interactive checkbox widgets. Click toggles between empty and checked.

**Extended behavior:**

1. **Parse signifiers from line text.** After finding a checkbox node in the Lezer AST, scan the line text for emoji signifiers to extract priority, dates, recurrence.

2. **Render priority badge.** After the checkbox, render a small colored pill for priority:
   - `🔺` → red "Highest" pill
   - `⏫` → orange "High" pill
   - `🔼` → yellow "Medium" pill
   - `🔽` → blue "Low" pill
   - `⏬` → gray "Lowest" pill

3. **Render date chips.** Inline subtle tags for due/scheduled/start dates:
   - `📅 Jan 7` (with overdue highlighting if past)
   - `⏳ Jan 5`
   - `🛫 Jan 1`

4. **Render recurrence indicator.** Small `🔁` icon with tooltip showing rule text.

5. **Status cycle on click.** Instead of binary toggle, cycle through configured status sequence:
   - Default: `[ ]` → `[/]` → `[x]` → `[ ]`
   - Configurable via settings

6. **Write-back on toggle.** When status changes, write the new checkbox character back to the source document at the correct byte offset. The scanner re-parses on next index cycle.

### 5.2 Task Metadata Parser (TS)

**File:** `packages/editor/src/input/task-metadata.ts` (NEW)

```typescript
interface TaskMeta {
  status: 'todo' | 'in_progress' | 'on_hold' | 'done' | 'cancelled' | 'non_task';
  priority: 'highest' | 'high' | 'medium' | 'none' | 'low' | 'lowest';
  due?: string;        // YYYY-MM-DD
  scheduled?: string;
  start?: string;
  created?: string;
  doneDate?: string;
  cancelled?: string;
  recurrence?: string; // "every week on Monday"
  tags: string[];
  id?: string;
  dependsOn: string[];
}

function parseTaskFromLine(line: string): TaskMeta | null;
function serializeTaskToLine(task: TaskMeta, description: string): string;
```

Used by the Create/Edit modal and the enhanced checkbox widget.

---

## 6. Task Query Block Widget

### 6.1 Architecture

**File:** `packages/editor/src/block-widgets/task-query-widget.ts` (NEW)

Follows the exact pattern of `dql-widget.ts`:

- Registers a `BlockWidgetSpec` for fenced code blocks with language tags `tasks` and `task`.
- Parses the block content using `task-query-parser.ts`.
- Invokes the Rust task query engine via `runQueryFacet`.
- Renders results in a styled container (similar to DQL results but with task-specific layout: checkbox toggle buttons, priority badges, date chips, backlinks).

### 6.2 Task Query Result Rendering

Each task result row renders:

```
[checkbox] [priority badge] description text   [date chips]   [tags]   [backlink]
```

- **Checkbox:** Interactive — click toggles status, writes back to source file.
- **Priority badge:** Colored pill matching priority level.
- **Description:** Clickable — navigates to source note and scrolls to the task line.
- **Date chips:** Subtle inline tags with date values.
- **Tags:** Rendered as clickable tag pills.
- **Backlink:** Source note name, clickable to navigate.

### 6.3 Group Headings

When `group by` is active, results are divided under markdown heading elements:

```markdown
## Overdue (3)
- [ ] Task 1
- [ ] Task 2
- [ ] Task 3

## Today (1)
- [ ] Task 4

## Tomorrow (2)
- [ ] Task 5
- [ ] Task 6
```

### 6.4 Task Count Display

Bottom of results: `50 of 286 tasks` (when `limit` truncates). Per-group counts when grouping is active: `Overdue (3)`.

---

## 7. Create/Edit Task Modal

### 7.1 UI Component

**File:** `apps/tauri/src/features/tasks/components/CreateTaskModal.tsx` (NEW)

A modal dialog (shadcn `Dialog`) with form fields:

| Field | Input Type | Notes |
|---|---|---|
| Description | Text input | Required. Auto-focused on open. |
| Status | Select dropdown | Options: Todo, In Progress, On Hold, Done, Cancelled |
| Priority | Select dropdown | Options: Highest, High, Medium, None, Low, Lowest |
| Due Date | Date picker | Optional. Clearable. |
| Scheduled Date | Date picker | Optional. Clearable. |
| Start Date | Date picker | Optional. Clearable. |
| Recurrence | Select + text | Preset rules or custom text input. Presets: "every day", "every weekday", "every week on Monday", "every 2 weeks", "every month", "every year". Custom: free text starting with "every". |
| Tags | Multi-select / text | Type to add tags. |
| Depends On | Multi-select | Pick from existing task IDs in vault. |
| On Completion | Select | Keep / Delete |
| Created Date | Auto-populated | Set automatically if `createdDateAutoAdd` is enabled. |
| Done Date | Auto-populated | Set automatically when status changes to Done. |

### 7.2 Validation

- Description is required.
- Recurring tasks require at least one date (Due, Scheduled, or Start). If none set, show inline error: "Recurring tasks must have at least one date."
- Date fields validate format (YYYY-MM-DD).

### 7.3 Trigger Points

- Command palette: `Tasks: Create or edit task`
- Editor toolbar button (when cursor is on a task line → edit mode)
- Editor toolbar button (when cursor is on empty line → create mode)
- Keyboard shortcut: configurable (default: none)

### 7.4 Write-back

On save, the modal either:
- **Creates:** Inserts a new task line at the cursor position (or end of current section).
- **Updates:** Replaces the existing task line at the known line number, preserving the description and signifiers.

Both operations go through `commands/common.rs` `write_markdown_note` (the standard file write contract).

---

## 8. Task Board (Kanban) Dock View

### 8.1 Architecture

**File:** `apps/tauri/src/features/tasks/components/TaskBoard.tsx` (NEW)

A dock panel registered via `viewRegistry.register()` in `app-shell/registrations.ts`.

### 8.2 Board Layout

```
┌──────────────┬──────────────┬──────────────┬──────────────┐
│  TODO (12)   │ IN PROGRESS  │  ON HOLD (3) │  DONE (45)   │
│              │     (5)      │              │              │
│ ┌──────────┐ │ ┌──────────┐ │ ┌──────────┐ │ ┌──────────┐ │
│ │ Buy milk │ │ │ Write ADR│ │ │ Wait for │ │ │ Fix bug  │ │
│ │ 📅 Jan 7 │ │ │ 🔺       │ │ │ review   │ │ │ ✅ Jan 5 │ │
│ │ #errand  │ │ │ ⏳ Jan 6 │ │ │ 🔽       │ │ │          │ │
│ └──────────┘ │ └──────────┘ │ └──────────┘ │ └──────────┘ │
│ ┌──────────┐ │ ┌──────────┐ │              │ ┌──────────┐ │
│ │ Call Kate│ │ │ Refactor │ │              │ │ Deploy   │ │
│ │ 📅 Jan 8 │ │ │ #code    │ │              │ │ ✅ Jan 4 │ │
│ └──────────┘ │ └──────────┘ │              │ └──────────┘ │
└──────────────┴──────────────┴──────────────┴──────────────┘
```

### 8.3 Card Rendering

Each card shows:
- Description (truncated to 2 lines)
- Priority badge (if not None)
- Due date (with overdue highlighting)
- Tags (as small pills)
- Source file name (subtle, bottom)

### 8.4 Interactions

- **DnD between columns:** Dragging a card from "TODO" to "IN PROGRESS" updates the checkbox character in the source file from `[ ]` to `[/]`.
- **Click card:** Navigates to source note and scrolls to the task line.
- **Filter bar:** Scope tasks to specific folder, tag, or priority level.

### 8.5 Column Configuration

Default columns: TODO, IN_PROGRESS, ON_HOLD, DONE.

Settings allow customizing:
- Which status types to show as columns
- Column order
- Whether to show CANCELLED as a separate column

### 8.6 Data Source

The board reads tasks from `vault.metadata(path).tasks` for all documents. This is the same data source as the query engine. No separate index.

---

## 9. Settings

### 9.1 Settings Keys

**File:** `apps/tauri/src/features/settings/lib/settings-data.ts` — ADD to `DEFAULTS`:

```typescript
// Task Management
'tasks.globalFilter': '' as string,
// Only tasks whose line contains this tag/text appear in queries.
// Example: '#task'. Empty = all tasks.

'tasks.defaultPriority': 'none' as string,
// Default priority for new tasks: 'highest' | 'high' | 'medium' | 'none' | 'low' | 'lowest'

'tasks.doneDateAutoAdd': true as boolean,
// Automatically add ✅ date when task status changes to DONE.

'tasks.cancelledDateAutoAdd': true as boolean,
// Automatically add ❌ date when task status changes to CANCELLED.

'tasks.createdDateAutoAdd': false as boolean,
// Automatically add ➕ date when a new task is created.

'tasks.statusSequence': ['/', 'x'] as string[],
// Status cycle order when toggling. Default: [ ] → [/] → [x] → [ ]
// The first element is the "in progress" symbol, the second is "done".

'tasks.newTaskPosition': 'above' as 'above' | 'below',
// Where to insert the new recurring task relative to the completed one.

'tasks.removeScheduledOnRecurrence': false as boolean,
// Remove ⏳ date from the next recurrence occurrence.

'tasks.boardColumns': ['todo', 'in_progress', 'on_hold', 'done'] as string[],
// Which status types to show as board columns, and in what order.
```

### 9.2 Settings UI

**File:** `apps/tauri/src/features/settings/lib/` — new section component

Add a "Tasks" section under the "Core Plugins" group in the settings modal. Uses the declarative `SettingsFields` pattern from ADR-036.

### 9.3 Status Collections (Phase 2)

Pre-built status configurations from popular themes (Minimal, ITS, etc.). One-click import. Deferred to Phase 2 — Phase 1 uses the default 6-status set.

---

## 10. Commands & Keybindings

### 10.1 Commands

**Icons are never hardcoded per command or component.** `commands.json` stores
only icon-name strings (existing registry convention); every task icon name
resolves through the single `ICONS` map in `packages/commands/src/icons.ts`
(extended with the task set). Task UI components (board, cards, badges) import
icons from one feature-local module, `features/tasks/lib/task-icons.ts`, never
scattered `@tabler/icons-react` imports.

**File:** `packages/commands/src/commands.json` — ADD entries:
{ "id": "tasks:create", "name": "Tasks: Create or edit task", "category": "Tasks", "icon": "IconCheckbox" },
{ "id": "tasks:toggle", "name": "Tasks: Toggle done", "category": "Tasks", "icon": "IconCheckbox" },
{ "id": "tasks:cycle-status", "name": "Tasks: Cycle task status", "category": "Tasks", "icon": "IconRefresh" },
{ "id": "tasks:set-priority", "name": "Tasks: Set priority", "category": "Tasks", "icon": "IconFlag" },
{ "id": "tasks:set-due-date", "name": "Tasks: Set due date", "category": "Tasks", "icon": "IconCalendar" },
{ "id": "tasks:set-scheduled", "name": "Tasks: Set scheduled date", "category": "Tasks", "icon": "IconCalendarDue" },
{ "id": "tasks:board-view", "name": "Tasks: Open board view", "category": "Tasks", "icon": "IconLayoutKanban" },
{ "id": "tasks:postpone", "name": "Tasks: Postpone to tomorrow", "category": "Tasks", "icon": "IconCalendarOff" }
```

### 10.2 Keybindings

**File:** `packages/keybindings/src/keybindings.json` — ADD:

```json
{ "command": "tasks:toggle", "key": "Mod+Enter", "description": "Toggle task done" }
```

### 10.3 Command Callbacks

**File:** `apps/tauri/src/features/tasks/lib/commands.ts` (NEW)

Each command callback:
1. Gets the active editor view from the editor store.
2. Finds the task line at the cursor (if any).
3. Executes the action (toggle, create, edit, set priority, etc.).
4. Writes the result back to the document.

---

## 11. Tauri Commands

### 11.1 Task Commands Module

**File:** `apps/tauri/src-tauri/src/commands/tasks.rs` (NEW)

```rust
/// Toggle the status of a task at a specific line in a file.
/// Returns the updated TaskData.
#[tauri::command]
pub fn toggle_task(
    path: String,
    line: u32,
    state: State<'_, AppState>,
) -> Result<TaskData, AppError>

/// Create a new task at a cursor position or end of section.
#[tauri::command]
pub fn create_task(
    path: String,
    line: u32,
    description: String,
    priority: Option<String>,
    due: Option<String>,
    scheduled: Option<String>,
    start: Option<String>,
    recurrence: Option<String>,
    tags: Option<Vec<String>>,
    state: State<'_, AppState>,
) -> Result<TaskData, AppError>

/// Update an existing task's metadata.
#[tauri::command]
pub fn update_task(
    path: String,
    line: u32,
    description: Option<String>,
    status: Option<String>,
    priority: Option<String>,
    due: Option<String>,
    scheduled: Option<String>,
    start: Option<String>,
    recurrence: Option<String>,
    tags: Option<Vec<String>>,
    state: State<'_, AppState>,
) -> Result<TaskData, AppError>

/// Get all tasks matching an optional filter.
/// Used by the board view and task query widget.
#[tauri::command]
pub fn get_tasks(
    filter: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<TaskResult>, AppError>
```

### 11.2 Registration

**File:** `apps/tauri/src-tauri/src/commands/mod.rs` — ADD:

```rust
pub mod tasks;
pub use tasks::{toggle_task, create_task, update_task, get_tasks};
```

**File:** `apps/tauri/src-tauri/src/lib.rs` — ADD to `generate_handler![]`:

```rust
tasks::toggle_task, tasks::create_task, tasks::update_task, tasks::get_tasks,
```

---

## 12. File Structure Summary

### New Files

```
crates/basalt-types/src/task.rs                    — TaskData, TaskStatus, TaskPriority structs
crates/basalt-parser/src/task_scan.rs              — scan_task_line() scanner function
packages/editor/src/block-widgets/task-query-widget.ts  — ```tasks``` block renderer
packages/editor/src/block-widgets/task-query-parser.ts  — Task query line parser
packages/editor/src/block-widgets/task-query-theme.ts   — Task widget styles
packages/editor/src/block-widgets/task-query-html.ts    — Task result HTML renderer
packages/editor/src/input/task-metadata.ts               — parseTaskFromLine / serializeTaskToLine
apps/tauri/src/features/tasks/                           — Task feature directory
  ├── index.ts                                            — Barrel exports
  ├── types.ts                                            — Task, TaskStatus, TaskPriority (TS mirror)
  ├── store.ts                                            — Task cache store (Zustand)
  ├── lib/
  │   ├── commands.ts                                     — Command callbacks
  │   └── task-query.ts                                   — Task query serialization
  ├── hooks/
  │   └── useTaskBoard.ts                                 — Board view state hook
  └── components/
      ├── TaskBoard.tsx                                   — Kanban board dock view
      ├── TaskCard.tsx                                    — Individual task card
      ├── TaskList.tsx                                    — Query result task list
      ├── CreateTaskModal.tsx                             — Create/edit task form
      ├── TaskBadge.tsx                                   — Priority/status badge
      └── TaskSettingsSection.tsx                         — Settings section
apps/tauri/src-tauri/src/commands/tasks.rs               — Tauri command handlers
```

### Modified Files

```
crates/basalt-types/src/metadata.rs                   — Add `tasks: Vec<TaskData>` field
crates/basalt-types/src/lib.rs                        — Add `pub mod task;`
crates/basalt-parser/src/metadata.rs                  — Integrate scan_task_line() into scan_body_tokens()
crates/basalt-parser/src/lib.rs                       — Add `pub mod task_scan;`
crates/basalt-parser/src/query/ast.rs                 — Extend Expr with task predicates (Phase 2)
crates/basalt-tables/src/engine.rs                    — Extend execute_query() for task WHERE/SORT/GROUP
crates/basalt-tables/src/output.rs                    — Extend execute_task_query() with optional columns
packages/editor/src/input/task-list.ts                — Enhanced checkbox rendering + status cycling
packages/editor/src/block-widgets/dql-widget.ts       — Add 'tasks'/'task' to DQL_LANGUAGES (already there)
packages/editor/src/index.ts                          — Export new task modules
packages/commands/src/commands.json                   — Add task commands
packages/keybindings/src/keybindings.json             — Add Mod+Enter keybinding
apps/tauri/src/app-shell/registrations.ts             — Register TaskBoard dock view
apps/tauri/src/features/settings/lib/settings-data.ts — Add task settings to DEFAULTS
apps/tauri/src-tauri/src/commands/mod.rs              — Add tasks module
apps/tauri/src-tauri/src/lib.rs                       — Register task commands
```

---

## 13. Implementation Phases

### Phase 1: Core Data + Scanner (Foundation)

**Goal:** Tasks are parsed during indexing and stored in `FileMetadata.tasks`.

1. Create `crates/basalt-types/src/task.rs` with `TaskData`, `TaskStatus`, `TaskPriority`.
2. Add `tasks: Vec<TaskData>` to `FileMetadata` with `#[serde(default)]`.
3. Create `crates/basalt-parser/src/task_scan.rs` with `scan_task_line()`.
4. Integrate into `scan_body_tokens_ascii()` / `scan_body_tokens_unicode()`.
5. Add unit tests: parse various task line formats, edge cases (no dates, all dates, nested lists, indented tasks).
6. Verify: `cargo test --package basalt-parser` passes.
7. Verify: `cargo test --package basalt-types` passes.

**Acceptance:** A vault with 25k notes containing tasks has `FileMetadata.tasks` populated for every file with checkboxes. No measurable regression in `extract_metadata` benchmark (task parsing adds < 5% overhead).

### Phase 2: Query Engine Extension

**Goal:** Task queries execute against the vault's task data.

1. Extend `basalt-tables/src/engine.rs` to handle task-specific predicates.
2. Implement `calculate_urgency()` in `basalt-tables/src/`.
3. Extend `execute_task_query()` with optional columns.
4. Add Tauri command `get_tasks`.
5. Write integration tests: query tasks by status, date, priority.
6. Verify: `cargo test --workspace` passes.

**Acceptance:** `get_tasks` returns correct filtered/sorted results. Urgency calculation matches expected values.

### Phase 3: Task Query Block Widget

**Goal:** ` ```tasks ``` ` blocks render in the editor.

1. Create `task-query-parser.ts` — line-based parser for the task query language.
2. Create `task-query-widget.ts` — BlockWidgetSpec following dql-widget pattern.
3. Create `task-query-theme.ts` — styled layout.
4. Create `task-query-html.ts` — result HTML renderer.
5. Wire `runQueryFacet` to invoke `get_tasks` Tauri command.
6. Test in editor: write a ` ```tasks ``` ` block, verify results render.

**Acceptance:** `not done due this week` in a ` ```tasks ``` ` block shows matching tasks. Sort, group, hide, limit all work.

### Phase 4: Editor Enhancements

**Goal:** Enhanced checkbox widget with signifier parsing.

1. Extend `task-list.ts` to parse signifiers from line text.
2. Render priority badges (colored pills).
3. Render date chips (inline tags with date values).
4. Render recurrence indicator.
5. Implement status cycle on click.
6. Write-back on toggle.
7. Test: toggle a task, verify the source file updates correctly.

**Acceptance:** Checkboxes show priority badges and date chips. Clicking cycles through status sequence. Source file updates correctly.

### Phase 5: Create/Edit Modal

**Goal:** Form UI for task creation.

1. Create `CreateTaskModal.tsx` with all form fields.
2. Create `TaskBadge.tsx` for priority/status display.
3. Wire to `create_task` / `update_task` Tauri commands.
4. Add command palette entry.
5. Test: create a task via modal, verify it appears in the editor.

**Acceptance:** Can create and edit tasks via modal. All fields write correctly to the source file.

### Phase 6: Task Board

**Goal:** Kanban dock view.

1. Create `TaskBoard.tsx` with column layout.
2. Create `TaskCard.tsx` for individual cards.
3. Create `useTaskBoard.ts` hook for board state.
4. Implement DnD between columns (using `@dnd-kit/core` or similar).
5. Register as dock view in `registrations.ts`.
6. Test: open board view, see tasks grouped by status, drag to change status.

**Acceptance:** Board view shows tasks in columns. DnD updates source file checkboxes.

### Phase 7: Settings + Commands

**Goal:** Configuration and keyboard shortcuts.

1. Add task settings to `DEFAULTS` in `settings-data.ts`.
2. Create `TaskSettingsSection.tsx`.
3. Add commands to `commands.json`.
4. Add keybindings.
5. Create `lib/commands.ts` with command callbacks.
6. Test: configure settings, verify they affect behavior.

**Acceptance:** Settings persist. Commands appear in palette. `Mod+Enter` toggles task.

---

## 14. Edge Cases & Constraints

### 14.1 Edge Case Matrix

| Edge Case | Behavior |
|---|---|
| Task line with no dates | Valid. Filterable by `no due date` etc. Recurring requires ≥1 date. |
| Task with recurrence but no dates | Stored but not searchable by date. Modal warns. |
| Unknown status symbol (e.g. `[z]`) | Treated as `TODO` with status name `Unknown`, next symbol `x`. |
| Task in indented list (`  - [ ] ...`) | Parsed. Indentation is part of the description context, not a separate task. |
| Task with emoji in description | Signifiers are only recognized at word boundaries. Description text after last signifier is preserved. |
| Task line exceeds 1000 chars | Truncated for display but full text preserved in metadata. |
| Multiple tasks on same line | Not supported. Only first checkbox per line is parsed. |
| Task in code block | Scanner skips content inside fenced code blocks (` ``` `). |
| Task in blockquote (`> - [ ] ...`) | Parsed. Blockquote prefix is stripped for signifier scanning. |
| Task in table row | Not supported (tables don't have checkbox semantics). |
| Vault switch during task query | Same generation-cancel mechanism as DQL queries. |
| Empty vault | No tasks. Board view shows empty columns with "No tasks" message. |

### 14.2 Performance Targets

| Metric | Target | How |
|---|---|---|
| Task parsing overhead per file | < 0.01ms | Runs in existing SIMD scan pass, no extra I/O |
| Task query on 25k vault | < 50ms | Iterates `metadata_cache`, applies filters, returns |
| Board view load | < 100ms | Reads from vault metadata, groups by status |
| Checkbox toggle → source update | < 5ms | Direct document edit, no re-index triggered |
| Urgency calculation (25k tasks) | < 10ms | Simple arithmetic per task, no allocations |

### 14.3 Backward Compatibility

- `FileMetadata.tasks` uses `#[serde(default)]` — old bincode caches deserialize to empty Vec.
- No cache invalidation required. Tasks are populated on next `extract_metadata()` call.
- Existing DQL queries are unaffected — `DataCommand::Task` is a separate branch.
- Existing `task-list.ts` checkbox rendering is enhanced, not replaced.

---

## 15. Non-Goals (Phase 1)

These features are explicitly deferred:

| Feature | Why Deferred | Phase |
|---|---|---|
| Recurrence expansion on completion | Requires `rrule` crate integration + write-back logic | Phase 2 |
| On-completion actions (keep/delete) | Depends on recurrence expansion | Phase 2 |
| Custom status collections UI | Needs settings UI for status symbol/name/type configuration | Phase 2 |
| Urgency as a query-able field in DQL (non-task queries) | Task-specific for now | Phase 2 |
| Task dependencies DAG visualization | Complex UI, low priority | Phase 3 |
| `filter by function` / `sort by function` (JS execution) | Security concern (ADR-002). Defer to plugin host phase. | Phase 3 |
| Calendar view of tasks | Separate feature (Calendar dock) | Phase 3 |
| Task duration tracking | New feature not in Obsidian Tasks | Future |

---

## 16. Consequences

### Achieved

- Tasks parse at zero marginal cost during the existing ADR-041 scan pass — no extra I/O, no cache invalidation.
- ` ```tasks ``` ` code blocks render native task queries with the same UX as Obsidian Tasks.
- Checkbox toggle is instant (< 5ms) with correct source file write-back.
- Board view provides visual task management without leaving the editor.
- Settings are configurable and persistent via the existing settings system.
- All task data lives in `FileMetadata.tasks` — same data model as tags, links, headings. No separate index to maintain.

### Known Limitations (Phase 1)

- `filter by function` / `sort by function` (JavaScript execution) is not supported — security concern. Defer to plugin host phase.
- Recurrence expansion on completion is not implemented — recurring tasks must be manually updated. Phase 2.
- Custom status collections (import from themes) are not available — Phase 2.
- Task dependencies are stored but not visualized — no DAG view, no blocking indicator in board. Phase 3.
- The `explain` debug instruction is not implemented — Phase 2.
- `limit groups` is not implemented — Phase 2.

### Risks

- **Emoji parsing edge cases:** Some emojis are multi-byte (4 bytes in UTF-8). The Tier 1 ASCII fast-path must handle these correctly. Mitigation: thorough unit tests with diverse emoji.
- **Performance regression in scanner:** Adding task parsing to the hot scan path could slow down indexing for non-task vaults. Mitigation: the `- [` trigger is rare outside list items; benchmark before/after.
- **Date format ambiguity:** Users may write dates in non-ISO formats. Mitigation: strict YYYY-MM-DD parsing, matching Obsidian Tasks behavior.
