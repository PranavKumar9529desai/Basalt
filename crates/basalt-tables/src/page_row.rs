use std::collections::HashSet;

use basalt_graph::NoteGraph;
use basalt_graph::StringArena;
use basalt_parser::query::SourceFilter;
use basalt_types::{yaml_to_typed, TypedValue};

#[derive(Clone)]
pub struct PageRow {
    pub path: String,
    pub tags: Vec<String>,
    pub links: Vec<String>,
    pub frontmatter: Vec<(String, TypedValue)>,
}

impl PageRow {
    #[inline]
    pub fn name(&self) -> &str {
        self.path
            .rsplit('/')
            .next()
            .unwrap_or(&self.path)
            .trim_end_matches(".md")
    }

    #[inline]
    pub fn folder(&self) -> &str {
        self.path.rfind('/').map(|i| &self.path[..i]).unwrap_or("")
    }
}

/// Extract only requested frontmatter keys from parsed YAML, avoiding cloning
/// unreferenced large structures or entire mappings.
pub fn extract_projected_frontmatter(
    val: &serde_yaml_ng::Value,
    projected: Option<&HashSet<String>>,
) -> Vec<(String, TypedValue)> {
    match val {
        serde_yaml_ng::Value::Mapping(map) => {
            if let Some(set) = projected {
                if set.is_empty() {
                    return Vec::new();
                }
                let mut out = Vec::with_capacity(set.len());
                for (k, v) in map {
                    if let Some(key) = k.as_str() {
                        if let Some(target) = set.get(key) {
                            out.push((target.clone(), yaml_to_typed(v)));
                        }
                    }
                }
                out
            } else {
                map.iter()
                    .filter_map(|(k, v)| {
                        let key = k.as_str()?.to_string();
                        Some((key, yaml_to_typed(v)))
                    })
                    .collect()
            }
        }
        _ => vec![],
    }
}

/// Build `PageRow`s with predicate push-down and column projection.
/// Only notes matching `source` (if given) have rows materialized.
/// Frontmatter, tags, and links are only cloned/extracted if requested.
pub fn build_page_rows_projected(
    arena: &StringArena,
    graph: &NoteGraph,
    source: Option<&SourceFilter>,
    projected_frontmatter: Option<&HashSet<String>>,
    needs_tags: bool,
    needs_links: bool,
) -> Vec<PageRow> {
    let capacity = if source.is_none() {
        graph.metadata_cache.len()
    } else {
        64
    };
    let mut pages = Vec::with_capacity(capacity);
    for (node_id, meta) in &graph.metadata_cache {
        let path_str = arena.get_string(*node_id).map(|s| s.as_str()).unwrap_or("");
        let folder_str = path_str
            .rfind('/')
            .map(|i| &path_str[..i])
            .unwrap_or("");

        // Predicate push-down: evaluate FROM filter before constructing row or parsing frontmatter
        if let Some(src) = source {
            if !matches_source_raw(folder_str, &meta.tags, &meta.links, src) {
                continue;
            }
        }

        let frontmatter_vals = if let Some(ref fm) = meta.frontmatter {
            extract_projected_frontmatter(fm, projected_frontmatter)
        } else {
            Vec::new()
        };

        pages.push(PageRow {
            path: path_str.to_string(),
            tags: if needs_tags { meta.tags.clone() } else { Vec::new() },
            links: if needs_links { meta.links.clone() } else { Vec::new() },
            frontmatter: frontmatter_vals,
        });
    }
    pages
}

/// Build `PageRow`s from the vault's metadata cache (full extraction fallback).
pub fn build_page_rows(arena: &StringArena, graph: &NoteGraph) -> Vec<PageRow> {
    build_page_rows_projected(arena, graph, None, None, true, true)
}

/// Check if raw note metadata matches a `SourceFilter` without constructing a `PageRow`.
pub fn matches_source_raw(
    folder: &str,
    tags: &[String],
    links: &[String],
    source: &SourceFilter,
) -> bool {
    match source {
        SourceFilter::Tag(tag) => {
            let p = tag.strip_prefix('#').unwrap_or(tag);
            tags.iter().any(|t| {
                let t_clean = t.strip_prefix('#').unwrap_or(t);
                t_clean == p || (t_clean.starts_with(p) && t_clean[p.len()..].starts_with('/'))
            })
        }
        SourceFilter::Folder(pattern) => {
            let pat = pattern.trim_matches('/');
            let cur = folder.trim_matches('/');
            cur == pat || (cur.starts_with(pat) && cur[pat.len()..].starts_with('/'))
        }
        SourceFilter::Link(target) => {
            let clean_target = target.trim_matches(&['[', ']'][..]);
            links.iter().any(|l| l.trim_matches(&['[', ']'][..]) == clean_target)
        }
        SourceFilter::And(a, b) => {
            matches_source_raw(folder, tags, links, a)
                && matches_source_raw(folder, tags, links, b)
        }
        SourceFilter::Or(a, b) => {
            matches_source_raw(folder, tags, links, a)
                || matches_source_raw(folder, tags, links, b)
        }
        SourceFilter::Not(a) => !matches_source_raw(folder, tags, links, a),
    }
}

/// Filter pages by a `FROM` source clause (tag / folder / link / boolean combinations).
pub fn matches_source(page: &PageRow, source: &SourceFilter) -> bool {
    matches_source_raw(page.folder(), &page.tags, &page.links, source)
}
