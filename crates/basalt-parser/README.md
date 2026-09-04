# basalt-parser — Markdown Parser

Parses CommonMark into a custom `MarkdownNode` AST, extracts file metadata
(tags, links, headings, block IDs) without a full AST walk, parses typed YAML
frontmatter with UTF-16 span annotation (ADR-022), and performs surgical
wikilink/path rewriting for note and folder renames (ADR-023).

Uses `pulldown-cmark` for CommonMark parsing and `ropey` for byte↔UTF-16
offset conversion. Depends on `basalt-types`. Pure native Rust (no wasm);
consumed by `basalt-vault` and `frontmatter-wasm`.

## Modules

| Module         | Provides                                                                    |
| -------------- | --------------------------------------------------------------------------- |
| `parser`       | `parse_markdown(input) -> Document`, `process_markdown(input) -> ProcessedMarkdown` |
| `metadata`     | `extract_metadata(input) -> FileMetadata` — a zero-AST extractor             |
| `frontmatter`  | `parse_frontmatter(input) -> FrontmatterModel` — typed YAML frontmatter (ADR-022) |
| `inline`       | `parse_inline_text(input) -> Vec<MarkdownNode>`                              |
| `link_rewrite` | `rewrite_wikilinks`, `rewrite_wikilinks_path`, `NoteRename`, `PathRename`    |
| `utf16`        | `TextDocument` — byte↔UTF-16 offset converter                                 |

## Public API

- `parse_markdown` — full markdown → `Document` (frontmatter + AST + tags/links)
- `process_markdown` — higher-level processed result
- `extract_metadata` — fast **zero-AST** extraction of `FileMetadata`
  (tags/links/headings/block IDs) — ideal for indexing hot paths
- `parse_frontmatter` — typed YAML frontmatter with diagnostics + UTF-16 spans
- `rewrite_wikilinks` / `rewrite_wikilinks_path` — surgical wikilink rewriting
  for note renames (`NoteRename`) and folder/attachment renames (`PathRename`)
- `TextDocument` — byte↔UTF-16 offset conversion (span correctness)

## Documentation

- ADR-022: [Frontmatter Engine — Structured, Typed, First-Class Properties](../../docs/adr/022-frontmatter-engine.md)
- ADR-023: [Inline Note Title + Rename](../../docs/adr/023-inline-title-rename.md)
