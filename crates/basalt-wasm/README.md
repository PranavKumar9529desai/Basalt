# basalt-wasm — WASM Bridge

`wasm_bindgen` bridge exposing Basalt's Rust capabilities to JavaScript:
markdown rendering, metadata/frontmatter parsing, and fuzzy command search.
A thin `Basalt` class wrapper over `basalt-parser`, `basalt-graph`, and
`basalt-types`.

Configured as `["cdylib", "rlib"]` — the `cdylib` is the wasm target, the
`rlib` keeps native build compatibility.

## Public API

```rust
#[wasm_bindgen]
pub struct Basalt { /* ... */ }

Basalt::new()                                  // constructor
render_markdown(input: &str) -> String
extract_metadata(input: &str) -> Result<JsValue, JsValue>
parse_frontmatter(input: &str) -> Result<JsValue, JsValue>
fuzzy_search_commands(query: &str, candidates: JsValue) -> Result<JsValue, JsValue>
```

- `render_markdown` → rendered HTML string
- `extract_metadata` / `parse_frontmatter` → JSON via `serde-wasm-bindgen`
- `fuzzy_search_commands` → ranked fuzzy results

## Relationship to the other wasm crates

This is the **generic, `wasm_bindgen`-style** bridge for the main workspace.
For the two standalone, C-ABI, latency-critical bridges see:

- [`frontmatter-wasm`](../frontmatter-wasm) — synchronous keystroke-path
  frontmatter parsing (ADR-022)
- [`graph-wasm`](../graph-wasm) — graph force-layout simulation (ADR-021)

Where a code path must run per-keystroke or inside a Web Worker with the
tightest possible ABI, prefer those; `basalt-wasm` suits broader JS-side
calls without a C-ABI requirement.
