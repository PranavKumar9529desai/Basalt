# ADR-045: DQL Query Engine Execution & Optimization

**Status:** Accepted (2026-09-09)  
**Date:** 2026-09-09  
**Extends:** ADR-017 (Benchmark Infrastructure), ADR-020 (Desktop-Tier Performance), ADR-027 (DQL Query Engine Architecture), ADR-028 (DQL Aggregations), ADR-030 (Rust Quality Hardening)

---

## Context

In personal knowledge management (PKM), structured query engines (such as Obsidian's Dataview community plugin) transform Markdown frontmatter and metadata into dynamic tables, task lists, and aggregations. However, in Obsidian, Dataview runs on the single-threaded Electron JavaScript engine:
1. **Main-Thread Latency**: Queries iterating across vaults of 10,000 to 50,000 notes execute synchronously or via microtasks on the UI thread, causing perceptible editor stuttering, dropped keystrokes, and blocked rendering.
2. **High Memory Churn**: V8 object allocations for tens of thousands of parsed frontmatter objects trigger massive Garbage Collection (GC) pauses.
3. **Redundant Computation**: Dataview re-parses and re-evaluates expressions repeatedly during multi-column sorting and filtering.

Basalt offloads query execution entirely to native Rust in `crates/basalt-tables`, communicating with the frontend via typed IPC. However, at **$\ge 25,000$ note vault scale**, naive execution in Rust can still suffer from excessive cloning, repeated AST evaluation during sorting, and unindexed full-table scans.

This ADR defines the architectural optimizations and comprehensive edge-case safeguards required to execute complex DQL queries over **25,000+ notes in under 15ms**.

---

## The Query Execution Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. DQL AST Compilation (crates/basalt-tables)                               │
│    • Parse DQL query string into Query AST (FROM, WHERE, FLATTEN, etc.)      │
│    • Column projection analysis: extract exact frontmatter keys needed      │
├─────────────────────────────────────────────────────────────────────────────┤
│ 2. Predicate & Source Push-Down                                             │
│    • Evaluate FROM clause (tag index, folder prefix, link graph) BEFORE     │
│      constructing PageRow objects                                           │
│    • Eliminate 90%+ of vault notes with zero frontmatter cloning            │
├─────────────────────────────────────────────────────────────────────────────┤
│ 3. Lightweight Row Construction & Filtering                                 │
│    • Materialize only matching rows with projected frontmatter keys         │
│    • Evaluate WHERE predicate using three-valued logic (Null-safe)          │
├─────────────────────────────────────────────────────────────────────────────┤
│ 4. Transformation & Aggregation (FLATTEN / GROUP BY)                        │
│    • Bounded row expansion for FLATTEN (cap at 50,000 rows)                 │
│    • Single-pass hash grouping over row indices (zero row cloning)          │
│    • Streaming aggregate accumulators (sum, count, avg, min, max)           │
├─────────────────────────────────────────────────────────────────────────────┤
│ 5. Ordering & Pagination (SORT / LIMIT)                                     │
│    • Pre-evaluate sort keys via Schwartzian Transform: O(N log N) compare   │
│    • Canonical type tiering: total ordering across mixed TypedValue variants│
│    • Top-K Heap Selection: O(N log k) priority queue when LIMIT is present  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Benchmark Definition & Metrics

Query performance is evaluated through native Rust Criterion benchmarks in `crates/basalt-tables/benches/`:

1. **`dql_scan_and_filter.rs`**: Evaluates `TABLE file.name, status WHERE status = "active"` over 1k, 5k, and **25,000 notes**.
   - **Target**: Complete source scan and `WHERE` filtering in **$\le 5\text{ms}$** at 25k notes.
2. **`dql_sort_limit.rs`**: Evaluates `SORT date DESC LIMIT 20` over 25,000 notes.
   - **Target**: Pre-evaluation and top-k selection in **$\le 4\text{ms}$** at 25k notes.
3. **`dql_flatten_group.rs`**: Evaluates multi-level `FLATTEN tags` and `GROUP BY category` with aggregations (`sum`, `average`).
   - **Target**: Complete aggregation and grouping in **$\le 15\text{ms}$** at 25k notes.

---

## Obsidian (Dataview) vs. Basalt Comparison

| Dimension | Obsidian (Dataview / JS) | Basalt Current State (Rust) | Basalt Target ("Best of Best") |
| :--- | :--- | :--- | :--- |
| **Execution Environment** | Electron Main Thread (JavaScript) | Native Rust Worker Thread | Native Rust Rayon Multi-core + SIMD |
| **25k Notes Scan & Filter** | $\approx 250 - 600\text{ms}$ *(Blocks UI)* | $\approx 35\text{ms}$ (Full clone) | **$\le 5\text{ms}$** *(Predicate push-down)* |
| **Sorting Cost** | $O(N \log N)$ repeated JS eval | $O(N \log N)$ repeated AST eval | **$O(N \log N)$ Schwartzian / $O(N \log k)$ Top-K Heap** |
| **Memory Allocation** | Tens of thousands of V8 objects | Clones all frontmatter maps | **Zero-copy projected key slices** |
| **Null / Mixed-Type Safety** | JS type coercion surprises (`"5" > 10`) | Partial match / unwrap | **Canonical Type Hierarchy (Strict Total Order)** |
| **UI Responsiveness** | UI freezes during heavy query | Asynchronous IPC response | **Sub-16ms async streaming response** |

---

## Identified Bottlenecks & Architectural Solutions

### 1. Predicate & Source Push-Down (`build_page_rows`)
- **Bottleneck**: Previously, the execution engine cloned the entire frontmatter dictionary, tag list, and link collection for all 25,000 notes in the vault into `PageRow` structs *before* running `matches_source` or `WHERE`. For a query matching only `#project-alpha` (50 notes out of 25,000), 24,950 full allocations were wasted.
- **Solution**:
  - Push `Source` evaluation directly into the vault index layer.
  - The index checks `folder`, `tag`, or `link` sets using inverted index lookups or prefix scans before creating `PageRow`.
  - Only candidates passing the source filter have their metadata materialized.

### 2. Schwartzian Transform & Top-K Heap for Sorting
- **Bottleneck**: Calling `rows.sort_by(|a, b| eval(expr, a).cmp(&eval(expr, b)))` executes the AST evaluation logic $O(N \log N)$ times (approx. $25,000 \times 15 \approx 375,000$ AST evaluations).
- **Solution**:
  - **Schwartzian Transform**: Pre-evaluate the sort expression once per row into a contiguous vector:
    ```rust
    let mut sort_keys: Vec<(TypedValue, usize)> = rows
        .iter()
        .enumerate()
        .map(|(idx, row)| (eval_expression(&query.sort.expr, row), idx))
        .collect();
    sort_keys.sort_by(|(ka, _), (kb, _)| compare_typed(ka, kb, query.sort.direction));
    ```
  - **Top-K Heap Selection (`LIMIT k` without `GROUP BY`)**: When a query requests `LIMIT k` (e.g., `LIMIT 20`), avoid sorting all 25,000 rows. Maintain a bounded binary heap (`std::collections::BinaryHeap`) of size $k$. Complexity drops from $O(N \log N)$ to $O(N \log k)$, reducing sorting time from $12\text{ms}$ to $< 1\text{ms}$.

### 3. Projected Column Extraction (Zero Full-Map Cloning)
- **Bottleneck**: Cloning the full frontmatter `HashMap<String, TypedValue>` for every candidate note creates immense heap traffic.
- **Solution**:
  - Analyze the query AST prior to execution to compute the set of referenced symbols:
    `RequiredColumns = { col.field for col in query.columns } ∪ { field for field in query.where_clause } ∪ ...`
  - In `build_page_rows`, extract and clone *only* the specific fields requested. Unreferenced large frontmatter structures (such as long YAML summaries or nested arrays) are completely ignored.

### 4. Single-Pass Hash Grouping & Streaming Aggregations
- **Bottleneck**: `GROUP BY` operations previously cloned entire rows into nested lists `TypedValue::List(Vec<TypedValue>)`.
- **Solution**:
  - Grouping constructs a map of row indices: `HashMap<GroupKey, Vec<usize>>`.
  - Aggregations (`sum`, `average`, `count`, `min`, `max`) run as streaming single-pass accumulators directly over the index groups without allocating intermediate lists.

---

## Comprehensive Edge Cases & Failure Modes Matrix

| Edge Case / Scenario | Root Cause / Failure Mode | Architectural Defense / Resolution |
| :--- | :--- | :--- |
| **1. Heterogeneous Sort Types (Canonical Type Tiering)** | A frontmatter field contains mixed types across notes (e.g., Note A has `priority: 1`, Note B has `priority: "high"`, Note C has `priority: true`, Note D has `priority: null`). In standard Rust, comparing different enum variants either panics or breaks transitivity ($A < B \land B < C \implies A < C$), causing `sort_by` to panic or produce non-deterministic ordering. | **Enforce a strict Canonical Type Hierarchy**:<br>`Null < Checkbox < Number < Date < DateTime < Text < Link < List`.<br>If variants differ, compare their variant discriminant order. If variants match, compare inner values. Transitivity is mathematically guaranteed. |
| **2. Three-Valued Logic for `Null` in `WHERE` Filters** | Missing frontmatter fields evaluate to `TypedValue::Null`. In boolean filters, naive comparison (e.g. `rating > 3`) might coerce `Null` or panic. In standard SQL/DQL, relational operators (`<`, `<=`, `>`, `>=`) with `Null` must evaluate to `false`. | **SQL-Standard Three-Valued Logic**:<br>Relational comparisons against `TypedValue::Null` always evaluate to `false` (Unknown). A note without a `rating` field is cleanly excluded from `WHERE rating > 3` without errors or warnings. Equality `rating = null` or `IS NULL` explicitly matches `Null`. |
| **3. Aggregate Arithmetic & Division-by-Zero** | Queries using `average(field)` over an empty group or empty table attempt to divide by zero ($0 / 0$), which produces IEEE 754 `NaN`. If serialized to JSON, `NaN` produces invalid JSON or deserialization errors. | **Typed Aggregate Accumulator**:<br>`average` on an empty group returns `TypedValue::Null`. Non-numeric values within an aggregated list are skipped by `sum` and `avg`. Floating-point division guards against zero and ensures result sanitization (`finite_or_null`). |
| **4. Combinatorial Row Explosion in `FLATTEN`** | A note has multiple multi-element lists (e.g., 50 tags, 50 authors, 50 categories). Chained `FLATTEN` operations compute a Cartesian product, multiplying 1 row into $50 \times 50 \times 50 = 125,000$ rows, causing an Out-Of-Memory (OOM) crash. | **Bounded Evaluation Safety Ceiling**:<br>Impose an explicit runtime working-row limit of **50,000 rows**. If a `FLATTEN` operation exceeds this limit, execution halts safely and returns a typed error: `TableError::EvaluationLimitExceeded("Row expansion exceeded 50,000 rows")`. |
| **5. Exact Sub-Tag Segment Matching** | A query specifies `FROM #work`. Without delimiter boundaries, substring matching falsely includes `#homework`, `#framework`, and `#working`. Conversely, strict equality excludes legitimate child tags like `#work/client-a`. | **Path-Segment Tag Matcher**:<br>A tag $T$ matches target prefix $P$ if and only if:<br>`T == P || T.starts_with(&(P.to_string() + "/"))`.<br>Guarantees `#work` and `#work/proj` match, while `#homework` is rejected. |
| **6. Built-in `file.*` Attribute Shadowing** | A user defines a custom frontmatter property named `file: "my_custom_data"` or `name: "My Note"`. If the resolver accesses properties ambiguously, `file.size` or `file.name` will be shadowed or corrupt built-in file metadata accessors. | **Strict Namespace Precedence**:<br>Prefix `file.` is strictly reserved for built-in file metadata (`file.name`, `file.path`, `file.size`, `file.mtime`, `file.tags`, `file.outlinks`). Frontmatter keys are accessed either unprefixed or explicitly via `frontmatter.<key>`. Built-in attributes cannot be shadowed. |
| **7. Date and DateTime Lexicographical Desync** | Dates in frontmatter may be formatted as ISO 8601 strings (`2026-09-09`), timestamps, or short dates (`2026-9-9`). String-based comparisons cause `2026-10-01` to sort before `2026-9-9`. | **Normalized Temporal Representation**:<br>Parse ISO dates and dates into native `chrono::NaiveDate` and `chrono::DateTime<Utc>` at ingestion time inside `TypedValue::Date` and `TypedValue::DateTime`. Sort comparisons operate directly on integer epoch offsets. |

---

## Verification & Test Strategy

1. **Criterion Microbenchmarks (`crates/basalt-tables/benches/`)**:
   - `benches/query_scale.rs`: 25,000 synthetic notes fixture with randomized frontmatter (strings, numbers, dates, tags, and arrays).
   - Assert execution time under 15ms for `TABLE file.name, status, rating WHERE rating > 4 SORT file.mtime DESC LIMIT 50`.
2. **Property-Based Testing (`proptest`)**:
   - Generate randomized pairs of `TypedValue` variants to verify total ordering transitivity:
     $\forall a, b, c: a \le b \land b \le c \implies a \le c$.
3. **Edge Case Unit Tests**:
   - `test_subtag_matching`: Test `#work` against `#work/sub`, `#homework`, `#work-1`.
   - `test_flatten_row_limit`: Test Cartesian explosion safely aborting at 50,000 rows.
   - `test_null_relational_logic`: Test `null > 5`, `null < 5`, `null == null`, `null != 5`.
   - `test_aggregate_empty`: Test `average([]) == TypedValue::Null`.

---

## Consequences

- **Sub-15ms Query Latency**: Users can embed large dynamic tables without fearing UI freezes or sluggish tab switching.
- **Robust Sort Invariance**: Sort operations will never panic regardless of dirty or inconsistent frontmatter across thousands of files.
- **Predictable Memory Footprint**: Push-down filtering and top-k selection keep RAM usage proportional to the *result set* rather than the entire vault size.
