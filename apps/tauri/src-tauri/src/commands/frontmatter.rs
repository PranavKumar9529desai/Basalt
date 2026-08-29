use basalt_parser::parse_frontmatter as parse_fm;
use basalt_types::FrontmatterModel;

/// Parse a note's YAML frontmatter into a typed, span-annotated model.
/// Runs in the webview's invoke thread; the editor calls it on every
/// frontmatter-region edit via the injected `parseFrontmatter` callback
/// (ADR-022 rule 2). Spans are UTF-16 CodeMirror offsets so they map
/// directly onto editor positions for surgical edits.
#[tauri::command]
pub fn parse_frontmatter(text: String) -> FrontmatterModel {
    parse_fm(&text)
}
