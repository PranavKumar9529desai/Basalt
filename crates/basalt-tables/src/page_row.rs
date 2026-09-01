use basalt_graph::NoteGraph;
use basalt_graph::StringArena;
use basalt_parser::query::SourceFilter;
use basalt_types::{TypedValue, yaml_to_typed_pairs};

/// A single row in a DQL query result, built from vault metadata.
pub struct PageRow {
    pub path: String,
    pub name: String,
    pub folder: String,
    pub tags: Vec<String>,
    pub links: Vec<String>,
    pub frontmatter: Vec<(String, TypedValue)>,
}

/// Build `PageRow`s from the vault's metadata cache.
pub fn build_page_rows(arena: &StringArena, graph: &NoteGraph) -> Vec<PageRow> {
    let mut pages = Vec::new();
    for (node_id, meta) in &graph.metadata_cache {
        let path = arena.get_string(*node_id).cloned().unwrap_or_default();
        let name = path
            .rsplit('/')
            .next()
            .unwrap_or(&path)
            .trim_end_matches(".md")
            .to_string();
        let folder = path
            .rfind('/')
            .map(|i| path[..i].to_string())
            .unwrap_or_default();

        let frontmatter_vals: Vec<(String, TypedValue)> = meta
            .frontmatter
            .as_ref()
            .map(|fm| yaml_to_typed_pairs(fm))
            .unwrap_or_default();

        pages.push(PageRow {
            path,
            name,
            folder,
            tags: meta.tags.clone(),
            links: meta.links.clone(),
            frontmatter: frontmatter_vals,
        });
    }
    pages
}

/// Filter pages by a `FROM` source clause (tag / folder / link / boolean组合).
pub fn matches_source(page: &PageRow, source: &SourceFilter, _graph: &NoteGraph) -> bool {
    match source {
        SourceFilter::Tag(tag) => page
            .tags
            .iter()
            .any(|t| t == tag || t.ends_with(&format!("/{}", tag))),
        SourceFilter::Folder(folder) => {
            page.folder == *folder || page.folder.starts_with(&format!("{}/", folder))
        }
        SourceFilter::Link(target) => page.links.iter().any(|l| l == target),
        SourceFilter::And(a, b) => {
            matches_source(page, a, _graph) && matches_source(page, b, _graph)
        }
        SourceFilter::Or(a, b) => {
            matches_source(page, a, _graph) || matches_source(page, b, _graph)
        }
        SourceFilter::Not(a) => !matches_source(page, a, _graph),
    }
}