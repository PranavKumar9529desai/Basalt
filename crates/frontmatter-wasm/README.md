# frontmatter-wasm — Keystroke-Path Frontmatter WASM Bridge

A minimal **standalone** WASM bridge for the synchronous YAML frontmatter
parser (ADR-022). It exposes a raw **C-ABI** surface (`alloc`/`parse`/`ptr`/`len`)
consumed from the editor's decoration state field so per-keystroke parsing
never blocks the UI thread.

It is **standalone** (its own `<workspace>`) so
`cargo build --target wasm32-unknown-unknown` here does not pull the whole repo
workspace (which cannot build for wasm). `cdylib` + `rlib`, `opt-level="z"` +
`lto` for minimal binary size. Consumed via `vite-plugin-wasm` `?init`.

## Public API (C-ABI)

All functions are `#[no_mangle]` `extern "C"`:

| Function       | Purpose                                            |
| -------------- | -------------------------------------------------- |
| `fm_alloc(cap)` | Allocate the input buffer in wasm linear memory     |
| `fm_parse(ptr, len)` | Parse the frontmatter at `ptr`/`len`; returns a JSON pointer |
| `fm_ptr()`     | Get the output JSON pointer (wasm-linear-memory offset) |
| `fm_len()`     | Get the output JSON byte length                     |

`fm_parse` returns a JSON-serialized `FrontmatterModel`
(from `basalt-types`). `thread_local!` buffers hold the input document and
JSON result so the JS side can copy them in/out via `fm_ptr`/`fm_len`.

## Usage (frontend)

The editor's frontmatter decoration state invokes this synchronously on each
keystroke, pulls the JSON `FrontmatterModel`, and renders the frontmatter
widget without a round-trip to the main process. See
`apps/tauri/src/features/editor/frontmatter-wasm.ts`.

## Documentation

- ADR-022: [Frontmatter Engine — Structured, Typed, First-Class Properties](../../docs/adr/022-frontmatter-engine.md)
- ADR-019: [Editor Decoration Pipeline — Single-Pass Architecture](../../docs/adr/019-editor-decoration-pipeline.md)
