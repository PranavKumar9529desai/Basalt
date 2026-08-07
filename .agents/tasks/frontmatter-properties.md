# Task: Frontmatter Properties — Phase 1 Foundation

**Branch:** `frontmatter-properties`
**Worktree:** `../.worktrees/basalt-frontmatter-properties`
**Agent:** opencode
**Depends on:** none
**Risk:** Medium

## Problem

The frontend treats note content as an opaque string. Frontmatter is parsed into a lossy
`serde_yaml_ng::Value` (no comments, order, or spans preserved), so it cannot round-trip. The
`---` block's byte offsets are discarded after slicing. We need a lossless, span-aware
frontmatter model before we can build a typed properties panel.

Design: `docs/superpowers/specs/2026-08-07-frontmatter-properties-design.md`

## Solution (Phase 1)

1. New `crates/basalt-parser/src/frontmatter.rs`:
   - `FrontmatterProperty { key, key_span, value, value_span, is_special-key }`
   - `FrontmatterBlock { props: Vec<FrontmatterProperty>, start_span, end_span, raw }`
   - Parse a leading `---\n...\n---` block with byte spans (surgical, lossless).
   - `parse_frontmatter_block(input) -> Option<FrontmatterBlock>`
   - `FrontmatterBlock::to_source(&self) -> String` (rebuild `---` block)
   - `FrontmatterBlock::set(key, ..)` / remove(key) that replaces **only that key's span**.
   - value * scalar / list YAML serialization helpers.
- Wire into `crates/basalt-parser/src/lib.rs`.
- Add round-trip tests: `parse → to_source == input` when unchanged; single-property edit leaves
  other bytes identical.
- CodeMirror (packages/editor): folding + parse diagnostics on existing `YAMLFrontMatter` node.

## Files to touch

```
crates/basalt-parser/src/frontmatter.rs   ← create
crates/basalt-parser/src/lib.rs           ← add module + exports
crates/basalt-parser/src/frontmatter.rs   ← tests (in-module)
packages/editor/src/syntax/frontmatter.ts ← folding + diagnostics
packages/editor/src/preview/frontmatter.ts← optional diagnostics
docs/superpowers/specs/2026-08-07-frontmatter-properties-design.md ← present
.agents/tasks/frontmatter-properties.md   ← this file
```

## Task List

- [ ] **Step 1:** Read files listed above
- [ ] **Step 2:** Implement strategy in `crates/basalt-parser/src/frontmatter.rs` + lib wiring
- [ ] **Step 3:** Verify:
  ```bash
  cargo test -p basalt-parser
  cd apps/tauri && bunx tsc --noEmit
  bun run lint
  ```
- [ ] **Step 4:** Commit:
  ```bash
  git add -A && git commit -m "feat(parser): lossless frontmatter parsing + round-trip"
  git push origin frontmatter-properties
  ```
- [ ] **Step 5:** Signal completion

## Verification

- [ ] `cargo test -p basalt-parser` passes
- [ ] Round-trip test : edited single key leaves sibling bytes identical
- [ ] `bunx tsc --noEmit` passes
- [ ] `bun run lint` passes
- [ ] No dead code / console.log

## Merge Dependencies

None.