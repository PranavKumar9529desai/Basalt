use serde_yaml_ng::Value;

/// Append every `[[...]]` target found in `s` to `out`.
pub(crate) fn collect_wikilinks(s: &str, out: &mut Vec<String>) {
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'[' && i + 1 < bytes.len() && bytes[i + 1] == b'[' {
            let start = i + 2;
            if let Some(close) = s[start..].find("]]") {
                let inner = &s[start..start + close];
                let target = inner.split(['|', '#']).next().unwrap_or("").trim();
                if !target.is_empty() {
                    out.push(target.to_string());
                }
                i = start + close + 2;
            } else {
                break;
            }
        } else {
            i += 1;
        }
    }
}

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