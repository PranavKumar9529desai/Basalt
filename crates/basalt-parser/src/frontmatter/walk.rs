use serde_yaml_ng::Value;

use crate::scan_wikilinks;

/// Walk a parsed YAML frontmatter value, collecting wikilinks (into `links`),
/// `tags:` (into `tags`) and `aliases:` (into `aliases`). Used to make
/// frontmatter properties first-class for graph/backlinks/search (ADR-022
/// rule 1) — closing the gap where FM links/tags were previously ignored.
pub(crate) fn walk_fm(
    v: &Value,
    links: &mut Vec<String>,
    tags: &mut Vec<String>,
    aliases: &mut Vec<String>,
) {
    match v {
        Value::String(s) => collect_wikilinks(s, links),
        Value::Sequence(seq) => {
            for item in seq {
                walk_fm(item, links, tags, aliases);
            }
        }
        Value::Mapping(map) => {
            for (k, val) in map {
                if let Value::String(ks) = k {
                    match ks.as_str() {
                        "tags" => extract_tag_like(val, tags),
                        "aliases" => extract_tag_like(val, aliases),
                        _ => {}
                    }
                }
                walk_fm(val, links, tags, aliases);
            }
        }
        _ => {}
    }
}

/// Append every `[[...]]` target found in `s` to `out`, reusing the canonical
/// `scan_wikilinks` scanner (one wikilink grammar for the whole crate).
fn collect_wikilinks(s: &str, out: &mut Vec<String>) {
    for spec in scan_wikilinks(s) {
        out.push(s[spec.target_from..spec.target_to].to_string());
    }
}

fn extract_tag_like(v: &Value, out: &mut Vec<String>) {
    match v {
        Value::String(s) => out.push(s.clone()),
        Value::Sequence(seq) => {
            for item in seq {
                if let Value::String(s) = item {
                    out.push(s.clone());
                }
            }
        }
        _ => {}
    }
}