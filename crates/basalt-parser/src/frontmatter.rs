use std::collections::HashMap;

use basalt_types::{
    FrontmatterDiagnostic, FrontmatterDiagnosticKind, FrontmatterEntry, FrontmatterModel,
    FrontmatterValue, Span,
};
use serde_yaml_ng::Value;

use crate::utf16::TextDocument;

/// Parse a note's YAML frontmatter into a typed, span-annotated model.
///
/// Returns an empty model when there is no frontmatter. Spans are UTF-16
/// code-unit offsets (CodeMirror coordinates) so the editor can map them
/// directly to document positions for surgical edits (ADR-022 rule 4).
pub fn parse_frontmatter(input: &str) -> FrontmatterModel {
    let mut model = FrontmatterModel::default();

    let (open, close_start) = match fm_bounds(input) {
        Some(x) => x,
        None => return model,
    };

    let text_doc = TextDocument::new(input);
    let bytes = input.as_bytes();
    let to_u16 = |b: usize| text_doc.byte_offset_to_utf16(b).unwrap_or(b);

    let mut seen: HashMap<String, Span> = HashMap::new();
    let mut line_start = open;

    while line_start < close_start {
        // Locate end of this line.
        let mut line_end = line_start;
        while line_end < close_start && bytes[line_end] != b'\n' {
            line_end += 1;
        }
        let mut content_end = line_end;
        if content_end > line_start && bytes[content_end - 1] == b'\r' {
            content_end -= 1;
        }
        let line = &input[line_start..content_end];

        // Only top-level keys (no leading whitespace) are frontmatter entries.
        if !line.starts_with(' ') && !line.starts_with('\t') {
            if let Some((key, value_text, val_col)) = parse_key_line(line) {
                let key_byte_start = line_start;
                let key_byte_end = line_start + key.len();
                let val_byte_start = line_start + val_col;
                let mut val_byte_end = content_end;

                // Collect `- item` continuation lines into a list value.
                let mut list_items: Vec<FrontmatterValue> = Vec::new();
                let mut consumed_until = line_end + 1;
                if value_text.trim().is_empty() {
                    let mut k = line_end + 1;
                    while k < close_start {
                        let mut le = k;
                        while le < close_start && bytes[le] != b'\n' {
                            le += 1;
                        }
                        let mut ce = le;
                        if ce > k && bytes[ce - 1] == b'\r' {
                            ce -= 1;
                        }
                        let ll = &input[k..ce];
                        let trimmed = ll.trim_start();
                        if let Some(stripped) = trimmed.strip_prefix("- ") {
                            list_items.push(coerce_scalar(stripped).0);
                            val_byte_end = ce;
                            consumed_until = le + 1;
                            k = le + 1;
                        } else if ll.trim().is_empty() {
                            k = le + 1;
                        } else {
                            break;
                        }
                    }
                }

                let is_list = !list_items.is_empty();
                let (value, malformed) = if is_list {
                    (FrontmatterValue::List(list_items), None)
                } else {
                    coerce_scalar(value_text)
                };

                let key_span = Span {
                    start: to_u16(key_byte_start),
                    end: to_u16(key_byte_end),
                };
                let value_span = Span {
                    start: to_u16(val_byte_start),
                    end: to_u16(val_byte_end),
                };

                if seen.contains_key(&key) {
                    model.diagnostics.push(FrontmatterDiagnostic {
                        kind: FrontmatterDiagnosticKind::DuplicateKey,
                        message: format!("Duplicate frontmatter key '{key}'"),
                        span: key_span.clone(),
                    });
                } else {
                    seen.insert(key.clone(), key_span.clone());
                }

                if malformed.is_some() {
                    model.diagnostics.push(FrontmatterDiagnostic {
                        kind: FrontmatterDiagnosticKind::MalformedValue,
                        message: format!("Could not parse value for '{key}'"),
                        span: value_span.clone(),
                    });
                }

                model.entries.push(FrontmatterEntry {
                    key,
                    value,
                    key_span,
                    value_span,
                });

                line_start = if is_list {
                    consumed_until
                } else {
                    line_end + 1
                };
                continue;
            }
        }

        line_start = line_end + 1;
    }

    model.block_span = Some(Span {
        start: 0,
        end: to_u16(close_start),
    });
    model
}

/// Returns `(open_end, close_start)` byte offsets for the frontmatter block,
/// where `open_end` is the first byte of the first frontmatter line and
/// `close_start` is the byte where the closing `---`/`...` begins.
fn fm_bounds(input: &str) -> Option<(usize, usize)> {
    let open = if input.starts_with("---\n") {
        4
    } else if input.starts_with("---\r\n") {
        5
    } else {
        return None;
    };

    let bytes = input.as_bytes();
    let mut search = open;
    while search < input.len() {
        let nl = input[search..].find('\n')? + search;
        let mut ce = nl;
        if ce > search && bytes[ce - 1] == b'\r' {
            ce -= 1;
        }
        let line = &input[search..ce];
        if line == "---" || line == "..." {
            return Some((open, search));
        }
        search = nl + 1;
    }
    None
}

/// Parse a top-level `key: value` line. Returns the key, the (untrimmed)
/// value text, and the byte column where the value begins.
fn parse_key_line(line: &str) -> Option<(String, &str, usize)> {
    let mut colon: Option<usize> = None;
    for (i, c) in line.char_indices() {
        if c == ':' {
            colon = Some(i);
            break;
        }
        if c == ' ' || c == '\t' {
            return None;
        }
    }
    let colon = colon?;
    let key = &line[..colon];
    if key.is_empty() {
        return None;
    }
    let first = key.chars().next().unwrap();
    if !first.is_alphanumeric() && first != '_' && first != '-' {
        return None;
    }
    if !key.chars().all(|c| c.is_alphanumeric() || c == '_' || c == '-') {
        return None;
    }

    let after = colon + 1;
    let mut vstart = after;
    if vstart < line.len() && (line.as_bytes()[vstart] == b' ' || line.as_bytes()[vstart] == b'\t') {
        vstart += 1;
    }
    let value_text = &line[vstart..];
    Some((key.to_string(), value_text, vstart))
}

/// Coerce a raw value string into a typed `FrontmatterValue`. Returns the value
/// plus an optional `MalformedValue` flag when YAML parsing fails.
fn coerce_scalar(text: &str) -> (FrontmatterValue, Option<FrontmatterDiagnosticKind>) {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return (FrontmatterValue::None, None);
    }
    match serde_yaml_ng::from_str::<Value>(trimmed) {
        Ok(v) => (yaml_to_value(&v), None),
        Err(_) => (
            FrontmatterValue::Text(trimmed.to_string()),
            Some(FrontmatterDiagnosticKind::MalformedValue),
        ),
    }
}

fn yaml_to_value(v: &Value) -> FrontmatterValue {
    match v {
        Value::Null => FrontmatterValue::None,
        Value::Bool(b) => FrontmatterValue::Checkbox(*b),
        Value::Number(n) => FrontmatterValue::Number(n.as_f64().unwrap_or(0.0)),
        Value::String(s) => infer_string(s),
        Value::Sequence(seq) => FrontmatterValue::List(seq.iter().map(yaml_to_value).collect()),
        Value::Tagged(_) => FrontmatterValue::Text(serde_yaml_ng::to_string(v).unwrap_or_default()),
        Value::Mapping(_) => FrontmatterValue::Text(serde_yaml_ng::to_string(v).unwrap_or_default()),
    }
}

fn infer_string(s: &str) -> FrontmatterValue {
    if s.contains("[[") && s.contains("]]") {
        if let Some(target) = first_wikilink_target(s) {
            return FrontmatterValue::Link(target);
        }
    }
    if is_iso_date(s) {
        return FrontmatterValue::Date(s.to_string());
    }
    if is_iso_datetime(s) {
        return FrontmatterValue::DateTime(s.to_string());
    }
    FrontmatterValue::Text(s.to_string())
}

/// Extract the first `[[Target]]` target from a string (ignoring alias/`#`).
pub(crate) fn first_wikilink_target(s: &str) -> Option<String> {
    let open = s.find("[[")?;
    let rest = &s[open + 2..];
    let close = rest.find("]]")?;
    let inner = &rest[..close];
    let target = inner
        .split(['|', '#'])
        .next()
        .unwrap_or("")
        .trim();
    if target.is_empty() {
        None
    } else {
        Some(target.to_string())
    }
}

/// Append every `[[...]]` target found in `s` to `out`.
pub(crate) fn collect_wikilinks(s: &str, out: &mut Vec<String>) {
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'[' && i + 1 < bytes.len() && bytes[i + 1] == b'[' {
            let start = i + 2;
            if let Some(close) = s[start..].find("]]") {
                let inner = &s[start..start + close];
                let target = inner
                    .split(['|', '#'])
                    .next()
                    .unwrap_or("")
                    .trim();
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

pub(crate) fn is_iso_date(s: &str) -> bool {
    let b = s.as_bytes();
    if b.len() != 10 {
        return false;
    }
    b[4] == b'-'
        && b[7] == b'-'
        && b[0..4].iter().all(|c| c.is_ascii_digit())
        && b[5..7].iter().all(|c| c.is_ascii_digit())
        && b[8..10].iter().all(|c| c.is_ascii_digit())
}

pub(crate) fn is_iso_datetime(s: &str) -> bool {
    let b = s.as_bytes();
    if b.len() < 11 {
        return false;
    }
    b[10] == b'T' && is_iso_date(&s[..10])
}

#[cfg(test)]
mod tests {
    use super::*;

    fn model(input: &str) -> FrontmatterModel {
        parse_frontmatter(input)
    }

    #[test]
    fn parses_scalar_types() {
        let m = model(
            "---\ntitle: Hello\nrating: 5\npublished: true\ndate: 2024-01-01\n---\nbody",
        );
        assert_eq!(m.entries.len(), 4);
        assert_eq!(m.entries[0].value, FrontmatterValue::Text("Hello".into()));
        assert_eq!(m.entries[1].value, FrontmatterValue::Number(5.0));
        assert_eq!(m.entries[2].value, FrontmatterValue::Checkbox(true));
        assert_eq!(m.entries[3].value, FrontmatterValue::Date("2024-01-01".into()));
        assert!(m.diagnostics.is_empty());
    }

    #[test]
    fn parses_list() {
        let m = model("---\ntags:\n  - a\n  - b\n---\nbody");
        assert_eq!(m.entries.len(), 1);
        assert_eq!(
            m.entries[0].value,
            FrontmatterValue::List(vec![
                FrontmatterValue::Text("a".into()),
                FrontmatterValue::Text("b".into())
            ])
        );
    }

    #[test]
    fn link_value_is_typed_and_unquoted() {
        let m = model("---\nrelated: \"[[Other Note]]\"\n---\nbody");
        assert_eq!(m.entries[0].value, FrontmatterValue::Link("Other Note".into()));
    }

    #[test]
    fn duplicate_key_diagnostic() {
        let m = model("---\ntitle: A\ntitle: B\n---\nbody");
        assert_eq!(m.entries.len(), 2);
        assert!(m
            .diagnostics
            .iter()
            .any(|d| matches!(d.kind, FrontmatterDiagnosticKind::DuplicateKey)));
    }

    #[test]
    fn malformed_value_diagnostic() {
        let m = model("---\nbad: [unclosed\n---\nbody");
        assert!(m
            .diagnostics
            .iter()
            .any(|d| matches!(d.kind, FrontmatterDiagnosticKind::MalformedValue)));
    }

    #[test]
    fn spans_are_utf16_and_valid() {
        let src = "---\ntitle: Héllo\n---\nbody";
        let m = model(src);
        let e = &m.entries[0];
        assert!(e.key_span.start < e.key_span.end);
        assert!(e.value_span.start < e.value_span.end);
        assert!(e.value_span.end > e.key_span.end);
    }

    #[test]
    fn no_frontmatter_returns_empty() {
        let m = model("just body text");
        assert!(m.entries.is_empty());
    }

    #[test]
    fn crlf_safe() {
        let m = model("---\r\ntitle: Hi\r\n---\r\nbody");
        assert_eq!(m.entries.len(), 1);
        assert_eq!(m.entries[0].value, FrontmatterValue::Text("Hi".into()));
    }
}
