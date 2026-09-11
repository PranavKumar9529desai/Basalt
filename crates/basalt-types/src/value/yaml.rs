//! YAML-to-TypedValue conversion. The single converter shared by the frontmatter
//! engine and DQL.

use super::{is_iso_date_string, is_iso_datetime_string, TypedValue};

/// Extract the first `[[Target]]` target from a string (ignoring alias/`#`).
fn first_wikilink_target(s: &str) -> Option<String> {
    let open = s.find("[[")?;
    let rest = &s[open + 2..];
    let close = rest.find("]]")?;
    let inner = &rest[..close];
    let target = inner.split(['|', '#']).next().unwrap_or("").trim();
    if target.is_empty() {
        None
    } else {
        Some(target.to_string())
    }
}

/// Convert a `serde_yaml_ng::Value` to a `TypedValue`.
///
/// Booleans/numbers/null/lists map directly; quoted strings are classified as
/// a wikilink (`[[Target]]` → `Link`), an ISO date-time (`DateTime`), an ISO
/// date (`Date`), or plain `Text`.
pub fn yaml_to_typed(val: &serde_yaml_ng::Value) -> TypedValue {
    match val {
        serde_yaml_ng::Value::Null => TypedValue::Null,
        serde_yaml_ng::Value::Bool(b) => TypedValue::Checkbox { value: *b },
        serde_yaml_ng::Value::Number(n) => TypedValue::Number {
            value: n.as_f64().unwrap_or(0.0),
        },
        serde_yaml_ng::Value::String(s) => {
            if let Some(target) = first_wikilink_target(s) {
                TypedValue::Link {
                    name: target.clone(),
                    path: target,
                }
            } else if is_iso_datetime_string(s) {
                TypedValue::DateTime { value: s.clone() }
            } else if is_iso_date_string(s) {
                TypedValue::Date { value: s.clone() }
            } else {
                TypedValue::Text { value: s.clone() }
            }
        }
        serde_yaml_ng::Value::Sequence(seq) => TypedValue::List {
            items: seq.iter().map(yaml_to_typed).collect(),
        },
        serde_yaml_ng::Value::Mapping(_) | serde_yaml_ng::Value::Tagged(_) => TypedValue::Text {
            value: serde_yaml_ng::to_string(val).unwrap_or_default(),
        },
    }
}

/// Convert a YAML mapping to `(key, TypedValue)` pairs.
pub fn yaml_to_typed_pairs(val: &serde_yaml_ng::Value) -> Vec<(String, TypedValue)> {
    match val {
        serde_yaml_ng::Value::Mapping(map) => map
            .iter()
            .filter_map(|(k, v)| {
                let key = k.as_str()?.to_string();
                let typed = yaml_to_typed(v);
                Some((key, typed))
            })
            .collect(),
        _ => vec![],
    }
}
