use basalt_types::Span;

/// Kind of a frontmatter property value. Mirrors the property types Basalt
/// presents to the user; used for typed editing and serialization.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PropertyKind {
    Text,
    Number,
    Boolean,
    Date,
    Tag,
    List,
    Todo,
}

/// A parsed, type-aware property value.
#[derive(Debug, Clone, PartialEq)]
pub enum PropertyValue {
    String(String),
    Number(f64),
    Boolean(bool),
    /// A flat list of scalar strings (used for `tags`, generic lists, `aliases`).
    List(Vec<String>),
    /// A to-do list of item text + checked state (`- [ ]` / `- [x]`).
    Todo(Vec<TodoItem>),
    Null,
}

#[derive(Debug, Clone, PartialEq)]
pub struct TodoItem {
    pub text: String,
    pub checked: bool,
}

/// A single top-level property, with spans **relative to `raw`** (byte offsets).
///
/// - `key_span`: the key text bytes (e.g. `tags`).
/// - `value_span`: from the colon (`:`) through the end of the property block —
///   for a list this spans every indented list line. Replacing only this
///   region leaves every sibling/key byte untouched.
#[derive(Debug, Clone, PartialEq)]
pub struct FrontmatterProperty {
    pub key: String,
    pub kind: PropertyKind,
    pub value: Option<PropertyValue>,
    pub key_span: Span,
    pub value_span: Span,
}

/// A lossless view of a leading `---` frontmatter block.
///
/// `raw` preserves the *exact* original bytes of the block (fences included),
/// so an unmodified block serializes back byte-identically (comments, ordering,
/// quoting, blank lines survive). Edits replace only a target property's value
/// region.
#[derive(Debug, Clone, PartialEq)]
pub struct FrontmatterBlock {
    /// The entire `---\n...\n---` block verbatim, including both fences.
    pub raw: String,
    /// Ordered top-level properties.
    pub props: Vec<FrontmatterProperty>,
}

impl FrontmatterBlock {
    /// Rebuild the block source. Lossless when nothing changed.
    pub fn to_source(&self) -> String {
        self.raw.clone()
    }

    pub fn get(&self, key: &str) -> Option<&FrontmatterProperty> {
        self.props.iter().find(|p| p.key == key)
    }

    pub fn contains(&self, key: &str) -> bool {
        self.props.iter().any(|p| p.key == key)
    }

    pub fn keys(&self) -> impl Iterator<Item = &str> {
        self.props.iter().map(|p| p.key.as_str())
    }

    /// Set (or append) a property's value, replacing ONLY its value region.
    pub fn set(
        mut self,
        key: &str,
        kind: PropertyKind,
        value: PropertyValue,
    ) -> FrontmatterBlock {
        let insertion = value_insertion(&kind, &value);

        if let Some(prop) = self.props.iter().find(|p| p.key == key) {
            let mut raw = std::mem::take(&mut self.raw);
            raw.replace_range(prop.value_span.start..prop.value_span.end, &insertion);
            self.raw = raw;
        } else {
            self.raw = append_property(&self.raw, key, &insertion);
        }
        reparse(self)
    }

    /// Remove a property's full line(s). Returns the new block.
    pub fn remove(mut self, key: &str) -> FrontmatterBlock {
        if let Some(prop) = self.props.iter().find(|p| p.key == key) {
            self.raw = remove_region(&self.raw, prop.key_span.start, prop.value_span.end);
        }
        reparse(self)
    }
}

fn reparse(mut block: FrontmatterBlock) -> FrontmatterBlock {
    let raw = block.raw.clone();
    let (base, body) = inner_of(&raw);
    block.props = parse_props(&raw, base, &body);
    block
}

/// Parse a full source string that begins with a `---` frontmatter block.
/// Returns None when there is no opening/closing fence.
pub fn parse_frontmatter_block(src: &str) -> Option<FrontmatterBlock> {
    let raw = extract_block(src)?;
    let (base, body) = inner_of(&raw);
    let props = parse_props(&raw, base, &body);
    Some(FrontmatterBlock { raw, props })
}

/// Extract the entire `---\n...\n---` block (fences included) or None.
fn extract_block(src: &str) -> Option<String> {
    if !src.starts_with("---\r\n") && !src.starts_with("---\n") {
        return None;
    }
    let close = find_closing_fence(src)?;
    Some(src[..close + 3].to_string())
}

/// Byte offset within `src` of the `-` that starts the closing `---` line.
fn find_closing_fence(src: &str) -> Option<usize> {
    let mut search = 4usize; // skip "---\n"
    loop {
        let rel = src[search..].find("\n---")?;
        let abs = search + rel + 1; // position of the '-'
        let after = &src[abs + 3..];
        let tail_ok = after.is_empty() || after.starts_with('\n') || after.starts_with("\r\n");
        if tail_ok {
            return Some(abs);
        }
        search = abs + 3;
    }
}

/// Return (body_start_byte_in_raw, body_without_fences_or_trailing_newline).
fn inner_of(raw: &str) -> (usize, String) {
    let body_start = if raw.starts_with("---\r\n") { 5 } else { 4 };
    let body_end = raw.len() - 3; // strip trailing "---"
    let mut body = raw[body_start..body_end].to_string();
    if body.ends_with("\r\n") {
        body.truncate(body.len() - 2);
    } else if body.ends_with('\n') {
        body.pop();
    }
    (body_start, body)
}

/// Parse `body` (fence-free content) into ordered properties. All produced
/// spans are absolute byte offsets within `raw`; `base` is `body`'s offset in
/// `raw`.
fn parse_props(raw: &str, base: usize, body: &str) -> Vec<FrontmatterProperty> {
    let mut props = Vec::new();

    // Collect lines with their byte ranges (relative to body start).
    let mut lines: Vec<(usize, String)> = Vec::new();
    let mut off = 0usize;
    for ln in body.split_inclusive('\n') {
        let mut text = ln.strip_suffix('\n').unwrap_or(ln).to_string();
        if text.ends_with('\r') {
            text.pop();
        }
        lines.push((off, text));
        off += ln.len();
    }

    let mut i = 0;
    while i < lines.len() {
        let (line_start, text) = &lines[i];
        let trimmed = text.trim_start();
        let indent = text.len() - trimmed.len();

        if indent != 0 {
            i += 1;
            continue;
        }

        if let Some((key, key_len)) = parse_key(trimmed) {
            let key_start = base + line_start + indent;
            let key_end = key_start + key_len;

            // value_span starts at the colon (end of key).
            let mut value_span = Span {
                start: key_end,
                end: base + line_start + text.len(),
            };
            // Extend through following indented continuation lines.
            let mut j = i + 1;
            while j < lines.len() {
                let (lstart, ltext) = &lines[j];
                if ltext.len() - ltext.trim_start().len() == 0 {
                    break;
                }
                value_span.end = base + lstart + ltext.len();
                j += 1;
            }

            let value_text = raw[value_span.start..value_span.end].to_string();
            let kind = infer_kind(&key, &value_text);
            let value = parse_value(&key, &value_text);
            props.push(FrontmatterProperty {
                key,
                kind,
                value,
                key_span: Span {
                    start: key_start,
                    end: key_end,
                },
                value_span,
            });
            i = j;
        } else {
            i += 1;
        }
    }
    props
}

/// Parse `key:` from a trimmed top-level line. Returns key and its byte length.
fn parse_key(trimmed: &str) -> Option<(String, usize)> {
    if trimmed.starts_with('-') || trimmed.starts_with('#') {
        return None;
    }
    let colon = trimmed.find(':')?;
    let key_part = &trimmed[..colon];
    let key = key_part.trim();
    if key.is_empty() || key.contains(' ') {
        return None;
    }
    Some((key.to_string(), key.len()))
}

/// Infer the property kind from key hints + the value text's shape.
fn infer_kind(key: &str, value: &str) -> PropertyKind {
    match key {
        "tags" | "aliases" | "cssclasses" => PropertyKind::Tag,
        _ => {
            let v = strip_colon(value).trim();
            if v.starts_with("- [x]") || v.starts_with("- [ ]") {
                PropertyKind::Todo
            } else if v.starts_with('-') || v.starts_with('[') {
                PropertyKind::List
            } else if v.eq_ignore_ascii_case("true") || v.eq_ignore_ascii_case("false") {
                PropertyKind::Boolean
            } else if v.parse::<f64>().is_ok() {
                PropertyKind::Number
            } else {
                PropertyKind::Text
            }
        }
    }
}

/// Strip a leading `: ` (colon included) from a value region.
fn strip_colon(text: &str) -> &str {
    let t = text.trim_start();
    let t = t.strip_prefix(':').unwrap_or(t);
    t.trim_start()
}

/// Parse the value text (after the colon, including continuation lines).
fn parse_value(key: &str, text: &str) -> Option<PropertyValue> {
    let raw_value = strip_colon(text);
    let kind = infer_kind(key, text);
    match kind {
        PropertyKind::Todo => {
            let mut items = Vec::new();
            for line in raw_value.lines() {
                let l = line.trim();
                if let Some(body) = l.strip_prefix("- [x] ") {
                    items.push(TodoItem {
                        text: body.to_string(),
                        checked: true,
                    });
                } else if let Some(body) = l.strip_prefix("- [ ] ") {
                    items.push(TodoItem {
                        text: body.to_string(),
                        checked: false,
                    });
                }
            }
            if items.is_empty() {
                None
            } else {
                Some(PropertyValue::Todo(items))
            }
        }
        PropertyKind::Tag | PropertyKind::List => {
            let items = parse_list(raw_value);
            if items.is_empty() {
                None
            } else {
                Some(PropertyValue::List(items))
            }
        }
        PropertyKind::Boolean => raw_value
            .parse::<bool>()
            .ok()
            .map(PropertyValue::Boolean),
        PropertyKind::Number => raw_value
            .parse::<f64>()
            .ok()
            .map(PropertyValue::Number),
        _ => {
            if raw_value.trim().is_empty() {
                Some(PropertyValue::Null)
            } else {
                Some(PropertyValue::String(unquote(raw_value).to_string()))
            }
        }
    }
}

fn parse_list(text: &str) -> Vec<String> {
    let t = text.trim();
    if t.starts_with('[') {
        let inner = t
            .trim_start_matches('[')
            .trim_end_matches(']');
        return inner
            .split(',')
            .map(|s| unquote(s.trim()).to_string())
            .filter(|s| !s.is_empty())
            .collect();
    }
    t.lines()
        .map(|l| unquote(l.trim().trim_start_matches('-').trim()).to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

fn unquote(s: &str) -> &str {
    let s = s.trim();
    if s.len() >= 2
        && ((s.starts_with('"') && s.ends_with('"'))
            || (s.starts_with('\'') && s.ends_with('\'')))
    {
        &s[1..s.len() - 1]
    } else {
        s
    }
}

/// Serialize a value into the text that goes in the `value_span` region
/// (which starts at the colon), so every variant begins with `:`.
fn value_insertion(_kind: &PropertyKind, value: &PropertyValue) -> String {
    match value {
        PropertyValue::String(s) => format!(": {}", scalar_yaml(s)),
        PropertyValue::Number(n) => {
            if n.fract() == 0.0 && n.abs() < 1e15 {
                format!(": {}", *n as i64)
            } else {
                format!(": {}", n)
            }
        }
        PropertyValue::Boolean(b) => format!(": {}", b),
        PropertyValue::List(items) => {
            if items.is_empty() {
                ": []".to_string()
            } else {
                let mut s = String::new();
                for it in items {
                    s.push_str(&format!("\n  - {}", scalar_yaml(it)));
                }
                format!(":{}", s)
            }
        }
        PropertyValue::Todo(items) => {
            let mut s = String::new();
            for it in items {
                let boxc = if it.checked { "x" } else { " " };
                s.push_str(&format!("\n  - [{}] {}", boxc, it.text));
            }
            format!(":{}", s)
        }
        PropertyValue::Null => ":".to_string(),
    }
}

/// Quote a scalar only when needed to keep it round-trippable / unambiguous.
fn scalar_yaml(s: &str) -> String {
    let s = s.trim();
    let needs_quote = s.is_empty()
        || s.starts_with('#')
        || s.starts_with(['-', '[', ']', '{', '}', '"', '\''])
        || s.parse::<bool>().is_ok()
        || s.parse::<f64>().is_ok()
        || s.eq_ignore_ascii_case("null")
        || s.eq_ignore_ascii_case("~")
        || s.contains(':')
        || s.contains('\n');
    if needs_quote {
        format!("\"{}\"", s.replace('"', "\\\""))
    } else {
        s.to_string()
    }
}

/// Append a new top-level property before the closing fence.
fn append_property(raw: &str, key: &str, insertion: &str) -> String {
    let marker = "\n---";
    let pos = raw.rfind(marker).expect("raw must end with a closing fence");
    let key_text = scalar_yaml(key);
    // insertion already begins with `:`
    let add = format!("\n{}{}", key_text, insertion);
    let mut s = raw.to_string();
    s.insert_str(pos, &add);
    s
}

/// Remove a byte region [start, end) plus surrounding newlines, without
/// ever consuming the closing fence.
fn remove_region(raw: &str, start: usize, end: usize) -> String {
    let mut begin = start;
    if begin > 0 && raw.as_bytes()[begin - 1] == b'\n' {
        begin -= 1;
    }
    let mut finish = end;
    while finish < raw.len() && (raw.as_bytes()[finish] == b'\n' || raw.as_bytes()[finish] == b'\r')
    {
        finish += 1;
        if finish < raw.len() && raw.as_bytes()[finish] == b'\n' {
            finish += 1;
        }
    }

    let prefix = raw[..begin].trim_end().to_string();
    let suffix = raw[finish..].to_string();
    if suffix.starts_with("---") {
        format!("{}\n{}", prefix, suffix)
    } else if prefix.is_empty() {
        suffix
    } else if suffix.is_empty() {
        prefix
    } else {
        format!("{}\n{}", prefix, suffix)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const BASIC: &str = "---\ntitle: My Note\ntags:\n  - food\n  - computer\nstatus: reading\n---\nBody text\n";

    fn block() -> FrontmatterBlock {
        parse_frontmatter_block(BASIC).expect("parse")
    }

    #[test]
    fn parses_properties_and_ordering() {
        let b = block();
        let keys: Vec<&str> = b.keys().collect();
        assert_eq!(keys, ["title", "tags", "status"]);
    }

    #[test]
    fn lossless_roundtrip_unchanged() {
        let b = block();
        assert_eq!(
            b.to_source(),
            "---\ntitle: My Note\ntags:\n  - food\n  - computer\nstatus: reading\n---"
        );
    }

    #[test]
    fn parses_scalar_and_spans() {
        let b = block();
        let title = b.get("title").unwrap();
        assert_eq!(title.kind, PropertyKind::Text);
        assert_eq!(title.value, Some(PropertyValue::String("My Note".into())));
        assert_eq!(title.key_span.start, 4);
        assert_eq!(title.key_span.end, 9); // "title"
        // value_span covers `: My Note`
        assert_eq!(&b.raw[title.value_span.start..title.value_span.end], ": My Note");
    }

    #[test]
    fn parses_tag_list_across_lines() {
        let b = block();
        let tags = b.get("tags").unwrap();
        assert_eq!(tags.kind, PropertyKind::Tag);
        assert_eq!(
            tags.value,
            Some(PropertyValue::List(vec!["food".into(), "computer".into()]))
        );
        assert_eq!(
            &b.raw[tags.value_span.start..tags.value_span.end],
            ":\n  - food\n  - computer"
        );
    }

    #[test]
    fn set_replaces_only_value_region() {
        let mut b = block();
        let before = b.raw.clone();
        let status_before = b.get("status").unwrap().value_span.clone();
        b = b.set("status", PropertyKind::Text, PropertyValue::String("done".into()));
        let p = b.get("status").unwrap();
        assert_eq!(p.value, Some(PropertyValue::String("done".into())));
        // bytes before/after the value region are byte-identical
        assert_eq!(&b.raw[..p.value_span.start], &before[..status_before.start]);
        assert_eq!(&b.raw[p.value_span.end..], &before[status_before.end..]);
        // key bytes unchanged
        assert_eq!(&b.raw[p.key_span.start..p.key_span.end], "status");
    }

    #[test]
    fn set_preserves_sibling_key_bytes() {
        let b0 = block();
        let ts = b0.get("tags").unwrap().value_span.clone();
        let tags_before = b0.raw[ts.start..ts.end].to_string();
        let b1 = b0.set("status", PropertyKind::Text, PropertyValue::String("done".into()));
        let ts1 = b1.get("tags").unwrap().value_span.clone();
        let tags_after = b1.raw[ts1.start..ts1.end].to_string();
        assert_eq!(tags_before, tags_after);
    }

    #[test]
    fn set_appends_new_property_before_close() {
        let b = block()
            .set("date", PropertyKind::Date, PropertyValue::String("2026-08-07".into()));
        assert_eq!(b.get("date").unwrap().value, Some(PropertyValue::String("2026-08-07".into())));
        let src = b.to_source();
        assert!(src.ends_with("date: 2026-08-07\n---"));
    }

    #[test]
    fn set_converts_scalar_to_list() {
        let b = block()
            .set("tags", PropertyKind::List, PropertyValue::List(vec!["a".into(), "b".into()]));
        let tags = b.get("tags").unwrap();
        // key "tags" re-infers kind on reparse
        assert_eq!(tags.kind, PropertyKind::Tag);
        assert_eq!(tags.value, Some(PropertyValue::List(vec!["a".into(), "b".into()])));
        assert!(b.raw.contains("- a\n  - b"));
    }

    #[test]
    fn remove_removes_key_and_leaves_clean_block() {
        let b = block().remove("tags");
        assert!(!b.contains("tags"));
        assert_eq!(b.to_source(), "---\ntitle: My Note\nstatus: reading\n---");
    }

    #[test]
    fn remove_last_property_keeps_fence() {
        let src = "---\ntitle: x\n---\nBody\n";
        let b = parse_frontmatter_block(src).unwrap().remove("title");
        assert!(!b.contains("title"));
        assert_eq!(b.to_source(), "---\n---");
    }

    #[test]
    fn remove_middle_property_preserves_others() {
        let src = "---\na: 1\nb: 2\nc: 3\n---\nBody\n";
        let b = parse_frontmatter_block(src).unwrap().remove("b");
        assert!(!b.contains("b"));
        assert_eq!(b.to_source(), "---\na: 1\nc: 3\n---");
    }

    #[test]
    fn quotes_ambiguous_scalars() {
        let b = block()
            .set("draft", PropertyKind::Boolean, PropertyValue::Boolean(false))
            .set("note", PropertyKind::Text, PropertyValue::String("a: b".into()));
        assert!(b.raw.contains("draft: false"));
        assert!(b.raw.contains(r#"note: "a: b""#));
    }

    #[test]
    fn handles_crlf() {
        let src = "---\r\ntitle: CRLF Note\r\ntags:\r\n  - x\r\n---\r\nBody\r\n";
        let b = parse_frontmatter_block(src).unwrap();
        assert_eq!(b.get("title").unwrap().value, Some(PropertyValue::String("CRLF Note".into())));
        assert_eq!(b.get("tags").unwrap().value, Some(PropertyValue::List(vec!["x".into()])));
    }

    #[test]
    fn no_frontmatter_returns_none() {
        assert!(parse_frontmatter_block("# Just a heading\nbody\n").is_none());
        assert!(parse_frontmatter_block("--- not a fence\nbody\n").is_none());
    }

    #[test]
    fn block_span_is_prefix_only() {
        // A `---` later in the document is not the frontmatter.
        let src = "---\ntitle: Hi\n---\n\nbody\n---\nnot frontmatter\n";
        let b = parse_frontmatter_block(src).unwrap();
        assert_eq!(b.keys().collect::<Vec<_>>(), ["title"]);
        assert_eq!(b.to_source(), "---\ntitle: Hi\n---");
    }
}