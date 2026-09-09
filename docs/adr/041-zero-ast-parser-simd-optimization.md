# ADR-041: Markdown & Frontmatter Zero-AST Scanner + SIMD Optimization

**Status:** Accepted (2026-09-09)  
**Date:** 2026-09-09  
**Extends:** ADR-017 (Benchmark Infrastructure), ADR-022 (Frontmatter Engine), ADR-030 (Rust Crates Quality Refactor)

---

## Context

In an Obsidian-class desktop workspace, indexing a large vault ($\ge 25,000$ notes) requires parsing every note to extract wikilinks `[[target]]`, embeds `![[image.png]]`, tags `#tag`, headings `# H1`, and YAML frontmatter properties.

In Obsidian (Electron/JavaScript), parsing 25,000 notes takes **5 to 12+ seconds** because full Abstract Syntax Trees (ASTs) or complex regular expressions are parsed in V8, generating gigabytes of garbage collection churn.

Basalt avoids this by implementing a native Rust zero-AST streaming byte scanner in `crates/basalt-parser`. However, the legacy scanner had two hidden performance traps:

1. **Rope B-Tree Allocation**: It allocated a `ropey::Rope` data structure per note on the heap just to convert byte offsets to UTF-16 code units.
2. **Scalar Byte-by-Byte Loop**: It scanned text one byte at a time instead of leveraging modern CPU vector registers (SIMD).

This ADR establishes the complete architectural specification for **SIMD-accelerated scanning** and a **zero-allocation Two-Tier Span Resolution Engine**.

---

## Benchmark Definition & Metrics

The parser benchmark (`crates/basalt-parser/benches/parse_metadata.rs`) evaluates extraction throughput across two Criterion tiers:

- **`seq_1k` / `parse_frontmatter_1k`**: 1,000 synthetic notes.
- **`seq_25k` / `parse_frontmatter_25k`**: 25,000 synthetic notes ($\ge 25\text{k}$ power-user scale per AGENTS.md §6).

### Metrics Tracked:

- Elements per second throughput.
- Wall-clock execution time for 25,000 notes.
- Heap allocation count per note (Target: $0$ for ASCII notes).

---

## Obsidian vs. Basalt Comparison

| Metric / Scenario         | Obsidian (Electron / V8 JS)                        | Basalt Current State (Rust Zero-AST)                  | Basalt Target ("Best of Best")                               |
| :------------------------ | :------------------------------------------------- | :---------------------------------------------------- | :----------------------------------------------------------- |
| **Parsing Strategy**      | AST & regex parsing in JavaScript                  | Zero-AST byte scanner in Rust                         | SIMD `memchr3` + 2-Tier Span Resolution                      |
| **25k Vault Index Time**  | $\approx 5\text{s} - 12\text{s}$ (GBs of GC churn) | $\approx 150\text{ms} - 250\text{ms}$ (~100k notes/s) | $\mathbf{\le 50\text{ms}}$ (>500k notes/s)                   |
| **Per-Note Parse Cost**   | $\approx 200\mu\text{s} - 500\mu\text{s}$          | $\approx 8\mu\text{s} - 10\mu\text{s}$                | $\mathbf{\le 2\mu\text{s}}$                                  |
| **Span Calculation Cost** | Native in V8 (UTF-16 string indices)               | Allocates a `ropey::Rope` B-tree per note             | $O(1)$ ASCII fast-path; dual cursor fallback (0 allocations) |

---

## The Coordinate System Problem: Rust (UTF-8) vs. CodeMirror (UTF-16)

When Basalt extracts a wikilink or heading, it must provide a `Span { start, end }` for the CodeMirror editor in the frontend.

- **Rust strings are UTF-8**: offsets are measured in **bytes** ($1$ byte for ASCII, $2\text{--}4$ bytes for multi-byte Unicode).
- **JavaScript / CodeMirror strings are UTF-16**: offsets are measured in **16-bit code units**.

### The ASCII Equivalence Rule

All standard ASCII characters (`0x00` through `0x7F`) occupy exactly **1 byte in UTF-8** and exactly **1 code unit in UTF-16**:
$$\forall c \in \text{ASCII}, \quad \text{len}_{\text{utf8}}(c) = 1 = \text{len}_{\text{utf16}}(c)$$

For pure ASCII text, byte offset is **identically equal** to UTF-16 code unit offset:
$$\text{utf16\_offset} \equiv \text{byte\_offset}$$

---

## Two-Tier Span Resolution Architecture (Zero Heap Allocations)

Rather than allocating a `Rope` B-tree or storing growing arrays of offset shifts (which fail on high-density non-English text), the parser implements a clean 2-tier architecture:

```
                       Start Parsing Note (&str)
                                   │
                                   ▼
                       ┌───────────────────────┐
                       │   input.is_ascii()?   │  (Single SIMD pass)
                       └───────────┬───────────┘
                                   │
                 ┌─────────────────┴─────────────────┐
                 │ TRUE                              │ FALSE
                 ▼                                   ▼
        TIER 1: Pure ASCII Fast Path        TIER 2: Streaming Dual-Cursor
        ----------------------------        -----------------------------
        • 0 conversions, 0 allocations.     • Tracks (byte_idx, utf16_idx).
        • utf16_offset = byte_offset.       • Pure ASCII spans advance 1:1.
        • Immediate O(1) passthrough.       • Non-ASCII advances via c.len_utf16().
                                            • 0 heap allocations, 0 drift.
```

### Tier 1: Whole-Document Fast Path (`is_ascii`)

At the start of parsing, `input.is_ascii()` executes a single vectorized CPU check. For pure ASCII files ($>90\%$ of standard notes):

- Every span offset is recorded directly from the byte index: `Span { start: byte_start, end: byte_end }`.
- Zero conversions, zero data structures, zero CPU cycles spent on translation.

### Tier 2: Streaming Dual-Cursor Fallback (for Non-ASCII Notes)

When `input.is_ascii()` returns `false`, the note contains one or more non-ASCII characters. The parser tracks a monotonic running cursor pair on the stack:

```rust
struct SpanCursor {
    byte_idx: usize,
    utf16_idx: usize,
}
```

As the parser scans sequentially through the document from byte $0$ to EOF:

1. **ASCII slices**: When the scanner advances through ASCII text (e.g. via SIMD match), both cursors advance by the exact same amount:
   $$\Delta_{\text{byte}} = \Delta_{\text{utf16}} = N$$
2. **Non-ASCII characters**: When non-ASCII UTF-8 bytes are traversed, the scanner decodes standard Rust `char` scalars:
   $$\text{byte\_idx} += \text{char.len\_utf8()}, \quad \text{utf16\_idx} += \text{char.len\_utf16()}$$
3. **Link / Tag Discovery**: When a token `[[...]]` or `#tag` is captured at `byte_idx`, the corresponding `utf16_idx` is already known in $O(1)$ stack time with zero heap allocations.

---

## SIMD Acceleration via `memchr3`

Markdown documents are overwhelmingly composed of plain prose ($>95\%$), while target tokens (`[[`, `![[`, `#`, `^`) represent $<5\%$ of total content.

The scalar byte loop (`while i < bytes.len()`) is replaced with `memchr::memchr3(b'[', b'^', b'#', &bytes[i..])`:

1. **Vector Register Execution**: Loads 16 to 64 bytes into CPU vector registers (`_mm256_cmpeq_epi8` on AVX2, ARM NEON `vceqq_u8`, or SSE2 `_mm_cmpeq_epi8`).
2. **Bulk Skipping**: If a 32-byte chunk contains no `[`, `^`, or `#`, the CPU skips the entire chunk in **1 clock cycle** ($\approx 0.3\text{ns}$).
3. **Cursor Sync**: The number of skipped ASCII bytes ($N$) advances both `byte_idx += N` and `utf16_idx += N` instantaneously.
4. **Runtime Hardware Portability**: `memchr` employs dynamic CPU feature detection. It runs on AVX2/AVX-512 on modern x86, NEON on Apple Silicon/ARM, SSE2 on older PCs, and falls back to a 64-bit integer SWAR bitmask algorithm on machines with zero vector units. It is 100% portable and never crashes.

---

## Comprehensive Edge-Case Analysis

| Edge Case Scenario                                             | Why Naive Implementations Fail                                                                                                | How Basalt Architecture Guarantees Correctness                                                                                            |
| :------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------- |
| **High-Density Non-ASCII (CJK, Russian, Accented text)**       | Storing a "shift/delta table" allocates thousands of array entries and makes lookups $O(\log K)$                              | The **streaming dual-cursor** requires $0$ heap storage regardless of character density; it advances monotonically in $O(1)$ stack space. |
| **Multi-Codepoint Emojis & ZWJ Sequences** (`👩‍💻`, `👨‍👩‍👧‍👦`, Flags) | Assuming emojis are fixed 4-byte characters causes fatal span drift (e.g. `👩‍💻` is 11 bytes UTF-8 but 5 code units in UTF-16). | Every multi-byte sequence is decoded using Rust's `char.len_utf16()`, guaranteeing exact CodeMirror surrogate pair synchronization.       |
| **Combining Diacritics (NFD: `e` + `\u{0301}`)**               | Grapheme counting misidentifies the 2 UTF-16 code units as 1 character.                                                       | Coordinates track strictly CodeMirror UTF-16 code units (matching JS `String.length`), not visual grapheme clusters.                      |
| **UTF-8 Char Boundary Slicing**                                | Naive integer indexing into multi-byte characters panics in Rust (`byte index is not a char boundary`).                       | Byte advances are strictly governed by valid character lengths; all slicing operations assert boundary safety.                            |
| **Windows CRLF (`\r\n`) Line Endings**                         | Slicing or trimming `\r` can desynchronize line-end tracking.                                                                 | `\r\n` is 2 bytes in UTF-8 and 2 code units in UTF-16 ($1:1$). Line trim operations preserve the dual-cursor offset invariant.            |
| **Large Data Notes (1MB – 50MB files)**                        | Building ASTs or storing token offsets in intermediate arrays exhausts RAM.                                                   | Streaming zero-AST scanning streams through files with fixed, near-zero memory footprint.                                                 |

---

## In-Place Tag and Link Deduplication

In `crates/basalt-parser/src/metadata.rs`, merging frontmatter tags/links with body tags previously allocated temporary `HashSet<String>` structures:

```rust
// Legacy: Allocates temporary heap HashSet per note
let mut existing_links: HashSet<String> = meta.links.iter().cloned().collect();
for l in fm_links { if existing_links.insert(l.clone()) { meta.links.push(l); } }
```

**Optimization**:
Append frontmatter items directly into `meta.links` / `meta.tags` without intermediate `HashSet` allocation, followed by an in-place sort and deduplication pass:

```rust
meta.links.sort_unstable();
meta.links.dedup();
```

This eliminates heap reallocation and hash-table hashing costs on every parsed note.

---

## Verification Plan

1. **Criterion Benchmark**: Run `cargo bench -p basalt-parser --bench parse_metadata` verifying $>500,000$ notes/sec throughput on the 25k tier.
2. **Span Accuracy Tests**: Verify UTF-16 coordinates across all Unicode categories: pure ASCII, emoji ZWJ sequences, CJK ideographs, and decomposed accents.
3. **Workspace Tests**: All 82 `basalt-parser` tests must pass clean.
