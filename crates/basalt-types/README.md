# basalt-types — Shared Domain Types

The foundational data model for Basalt's Rust crates. Defines the
derivable/serializable types for the markdown AST, file metadata, typed
frontmatter, and search results. Everything else in `crates/` depends on this
crate; it depends only on `serde` and `serde_yaml_ng`.

Native Rust library (no wasm).

## Modules

| Module          | Provides                                                                 |
| --------------- | ------------------------------------------------------------------------ |
| `node`          | `MarkdownNode` AST enum, `Document { frontmatter, ast, tags, links }`     |
| `metadata`      | `FileMetadata` — tags/links/aliases + UTF-16 `Span`s (headings, tags, links, block IDs) |
| `frontmatter`   | `PropertyType`, `FrontmatterEntry`, `FrontmatterDiagnostic`, `FrontmatterDiagnosticKind`, `FrontmatterModel`; `FrontmatterValue` is a type alias for `TypedValue` (ADR-030) |
| `query`         | `TypedValue` (internally-tagged enum — the single value type), `QueryColumn`, `QueryColumnType`, `QueryResult`, `yaml_to_typed` |
| `search`        | `Highlight`, `ContextLine`, `LineMatch`, `FileMatch`, `SearchContentResult`, `FileResult` |

- **`TypedValue`** — the single internally-tagged value type (ADR-030 Phase 2); `FrontmatterValue` is a type alias for it
- **`QueryColumn`** / **`QueryColumnType`** — column metadata and the closed set of DQL column types
- **`QueryResult`** — full query result returned to the frontend
- **Search result types** — snippets/highlights re-exported by `basalt-search`

## Documentation

- ADR-022: [Frontmatter Engine — Structured, Typed, First-Class Properties](../../docs/adr/022-frontmatter-engine.md)
- ADR-030: [Rust Crates Quality Refactor](../../docs/adr/030-rust-crates-quality-refactor.md) — TypedValue collapse, QueryColumnType enum, thiserror errors
- ADR-008: [Native Search Architecture — Tantivy + Nucleo](../../docs/adr/008-native-search-architecture.md)

