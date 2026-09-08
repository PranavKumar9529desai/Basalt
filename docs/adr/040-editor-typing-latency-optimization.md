# ADR-040: Editor Typing Latency & Live-Preview Pipeline Optimization

**Status:** Accepted (2026-09-09)  
**Date:** 2026-09-09  
**Extends:** ADR-019 (Editor Decoration Pipeline), ADR-020 (Desktop-Tier Performance), ADR-029 (Single Renderer)

---

## Context

Basalt is designed for Obsidian-class power users who work with large vaults and extensive notes. In any desktop markdown application, the editor's typing latency is the most critical metric determining whether the app feels light, snappy, and responsive.

In Obsidian (built on Electron with CodeMirror 6), keystroke latency on small notes (1–5KB) is typically 5–8ms. However, on large notes ($\ge 50\text{KB}$ to $100\text{KB}+$), Obsidian's typing latency degrades to **15ms–35ms** per keystroke. This breaches the 60 FPS frame budget (16.67ms), causing visible caret lag, dropped frames, and input stuttering—especially when notes contain tables, callouts, math formulas, and embeds.

Basalt previously passed the ADR-019 performance gate with its fused single-pass decoration pipeline ($p95 \approx 3.1\text{ms} - 4.0\text{ms}$ @ 100KB). To achieve the ultimate desktop-tier performance target ($p95 \le 2.0\text{ms}$ @ 100KB), this ADR establishes the dedicated architectural optimizations and comprehensive edge-case handling for the editor live-preview pipeline.

---

## Benchmark Definition & Harness

The editor typing benchmark (`packages/editor/src/perf/benchmark.ts` via commands `dev:editor-benchmark` and `dev:editor-benchmark-isolation`) measures synchronous keystroke dispatch latency across document size tiers:
- **1 KB** (~150 words): Short daily note / checklist.
- **10 KB** (~1,500 words): Standard article / project note with callouts and links.
- **100 KB** (~15,000 words): Large power-user document with headings, tables, code blocks, math formulas, wikilinks, callouts, and embeds.

### Metrics Tracked:
- `p50` (median latency): Typical per-character dispatch cost.
- `p95` (95th percentile): The primary gate metric; must stay well below the 16.67ms frame budget.
- `mean` and `max`: Jitter and outlier detection.
- `setDocMs`: Full document replacement time.

---

## Obsidian vs. Basalt Comparison

| Metric / Aspect | Obsidian (Electron / CM6) | Basalt Prior Baseline (ADR-019) | Basalt Target ("Best of Best") |
| :--- | :--- | :--- | :--- |
| **1 KB Keystroke (p95)** | $\approx 5\text{ms} - 8\text{ms}$ | $\approx 1.0\text{ms}$ | $\mathbf{\le 0.8\text{ms}}$ |
| **10 KB Keystroke (p95)** | $\approx 8\text{ms} - 14\text{ms}$ | $\approx 1.8\text{ms}$ | $\mathbf{\le 1.2\text{ms}}$ |
| **100 KB Keystroke (p95)** | $\approx 15\text{ms} - 35\text{ms}$ *(Frame drops, typing stutter)* | $\approx 3.1\text{ms} - 4.0\text{ms}$ *(Passed ADR-019 gate)* | $\mathbf{\le 2.0\text{ms}}$ *(Rock-solid sub-2ms floor)* |
| **Decoration Strategy** | Multiple uncoordinated passes & viewport layout queries | Fused single-pass walk + $O(\Delta)$ position mapping ($>48\text{KB}$) | Zero-alloc fast node dispatch + $O(1)$ cursor range checks |
| **Scroll Invalidation** | Re-computes decorations on scroll | Viewport-independent `StateField` (zero scroll rebuilds) | Viewport-independent `StateField` (zero scroll rebuilds) |

---

## Architectural Optimizations

The optimization plan targets four specific hot paths in `packages/editor/src/preview/`:

### 1. Node Dispatch Jump Table in `collector.ts`
- **Problem**: During the single syntax-tree walk (`tree.iterate({ enter(node) })`), `collector.ts` executed a linear sequence of 12 handler checks (`handleCodeBlockNode`, `handleHeadingNode`, `handleCalloutNode`, `handleBlockquoteNode`, `handleListNode`, `handleBlockWidgetsNode`, `handleTableNode`, `handleInlineNode`, `handleMarkHidingNode`, `handleEmbedNode`, `handleInlineMathNode`, etc.) for **every AST node**.
  On a 100KB note containing 8,000 AST nodes, this resulted in nearly 100,000 redundant function calls per rebuild.
- **Solution**: Route node types through a fast category dispatch switch based on `node.type.name`. Leaf nodes like plain `Text`, `Paragraph`, or formatting markers immediately skip all block-level handlers in $O(1)$ time, eliminating tens of thousands of redundant function calls.

### 2. Monotonic Code Block Cursor Tracking ($O(\log N) \to O(1)$)
- **Problem**: `isInCodeBlock(node.from, ctx.codeBlockRanges)` performed a binary search ($O(\log N)$) across all code block ranges for every non-code node encountered during the walk.
- **Solution**: Because `tree.iterate` traverses the syntax tree strictly in ascending document order, code block containment is resolved using a forward-advancing monotonic index cursor (`currentCodeBlockIdx`). This reduces code block containment resolution from $O(\log N)$ to amortized $O(1)$ per node.

### 3. Elimination of Post-Walk Scans (`handleHeading7Lines`)
- **Problem**: `handleHeading7Lines(0, doc.length, ctx, collector)` ran a full post-walk line iteration across the entire document to detect 7-level headings (`#######`), regardless of whether any `#` characters existed in the file.
- **Solution**: Track `#` token presence during the single tree walk. If no heading-7 markers exist in the document, the entire post-walk line iteration is bypassed.

### 4. Array Allocation & GC Pressure Reduction in `makeCollector`
- **Problem**: `makeCollector()` created fresh empty arrays `widgets: Range<Decoration>[]` and `replaces: Range<Decoration>[]` per rebuild, generating garbage collection pressure in V8/WebKit during rapid 100+ WPM typing bursts.
- **Solution**: Optimize the internal collection buffer and avoid intermediate object wrappers for point/line decorations, keeping keystroke memory allocations near zero.

---

## Comprehensive Edge-Case Handling

| Edge Case Scenario | Failure Mechanism | Architectural Solution |
| :--- | :--- | :--- |
| **Large Note Boundary ($48\text{KB}$ Threshold)** | Keystrokes near the $48\text{KB}$ threshold flip between full rebuild and lazy map | `LAZY_DOC_THRESHOLD = 48 * 1024` with hysteresis; typing transactions take the $O(\Delta)$ position map path without jitter. |
| **Rapid Selection Moves vs. Typing** | Click or arrow keys moving into a widget require instant reveal | Non-typing transactions (with explicit selection) rebuild synchronously; typing dispatches take the lazy map path. |
| **Fast Typing at Document Start (Pos 0)** | Inserting `#` at pos 0 can desynchronize heading line styles | Empty selection during typing is treated as the active-line signal, preventing premature marker hiding. |
| **Nested Elements (Callouts inside Lists)** | Inner nodes double-triggering line classes | Handlers check parent containment; callout matching takes precedence over plain blockquote styling. |
| **Widget Replacement Detachment** | Async widgets (DQL, Mermaid) replacing mid-typing | Widget `toDOM` verifies element attachment and query matching before committing paints. |

---

## Verification Plan

1. **Isolation Benchmark**: Run `dev:editor-benchmark-isolation` verifying full-stack $p95 \le 2.0\text{ms}$ @ 100KB across all variants (`base`, `+syntax`, `+links`, `+live-preview`, `full`).
2. **Automated Unit Tests**: All 278 `packages/editor` vitest suites must pass clean.
3. **Memory Stability**: Profile V8 heap allocations during 1,000 simulated consecutive keystrokes to ensure zero memory leaks.
