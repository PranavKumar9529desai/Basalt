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
| `frontmatter`   | `PropertyType`, `FrontmatterValue`, `FrontmatterEntry`, `FrontmatterDiagnostic`, `FrontmatterDiagnosticKind`, `FrontmatterModel` |
| `search`        | `Highlight`, `ContextLine`, `LineMatch`, `FileMatch`, `SearchContentResult`, `FileResult` |

## Public types

- **`MarkdownNode`** — the AST produced by `basalt-parser`
- **`Document`** — parsed result: frontmatter, AST, and extracted tags/links
- **`FileMetadata`** — file-level extractables with UTF-16 span locations
- **`FrontmatterModel`** + friends — the typed, structured frontmatter result
  (ADR-022)
- **Search result types** — snippets/highlights re-exported by `basalt-search`

## Documentation

- ADR-022: [Frontmatter Engine — Structured, Typed, First-Class Properties](../../docs/adr/022-frontmatter-engine.md)
- ADR-008: [Native Search Architecture — Tantivy + Nucleo](../../docs/adr/008-native-search-architecture.md)
