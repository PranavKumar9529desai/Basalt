# Architecture

## Core Concepts
- **AST (single file)**: `parse_markdown` builds a structured AST for one Markdown document.
- **Metadata scan (vault scale)**: `extract_metadata` scans text for frontmatter, tags, links, headings, and block IDs without building an AST.
- **NoteGraph**: A vault-wide link graph with forward links, backlinks, and a metadata cache.
- **StringArena**: Interns strings to integer IDs for efficient graph storage.

## Flows
### Vault Indexing
1. `index_directory` walks the vault and reads `.md` files.
2. `Vault::add_document` runs `extract_metadata`.
3. `NoteGraph::add_document` updates forward/back links and caches metadata.

### File Editing
- The editor (e.g., CodeMirror) owns text + cursor.
- Optional: call `parse_markdown` for rich, per-file structure.
- For semantic decorations (tags/links/headings), use UTF-16 spans from `extract_metadata`.

## UTF-16 Offsets
Editor positions are UTF-16 code units; Rust strings are UTF-8 bytes. The metadata scanner records UTF-16 spans so the UI can apply highlights and jump-to ranges correctly.
