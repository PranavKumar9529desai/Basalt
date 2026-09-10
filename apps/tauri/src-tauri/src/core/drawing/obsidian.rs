//! Obsidian Excalidraw plugin compatibility (`.excalidraw.md`).
//!
//! The plugin persists hybrid markdown: `# Excalidraw Data` with a `## Text
//! Elements` bullet section, `## Element Links`, `## Embedded Files`, and a
//! fenced `## Drawing` scene block whose body is either raw `json` or
//! LZString `compressed-json` (base64, chunked into 256-char lines).

/// Byte span `(start, end)` of the `# Drawing`/`## Drawing` heading line.
fn drawing_heading_span(content: &str) -> Option<(usize, usize)> {
    let mut offset = 0;
    for line in content.split('\n') {
        let t = line.trim();
        if t == "# Drawing" || t == "## Drawing" {
            return Some((offset, offset + line.len()));
        }
        offset += line.len() + 1; // +1 for the '\n' separator (harmless past EOF)
    }
    None
}

/// True when content uses the Obsidian Excalidraw plugin's hybrid layout:
/// `# Excalidraw Data` header, a Drawing section, or plugin frontmatter.
pub(crate) fn is_obsidian_excalidraw_format(content: &str) -> bool {
    content.contains("# Excalidraw Data")
        || content.contains("excalidraw-plugin: parsed")
        || content.contains("```compressed-json")
        || drawing_heading_span(content).is_some()
}

#[derive(Debug, Default)]
pub(crate) struct ParsedObsidianDrawing {
    /// Scene JSON (raw or decompressed). `None` when no parseable scene exists.
    pub data_json: Option<String>,
    /// Plain-text lines from the `## Text Elements` section (block refs stripped).
    pub text_elements: Vec<String>,
}

/// Parse an Obsidian-format drawing file.
pub(crate) fn parse_obsidian_excalidraw(content: &str) -> ParsedObsidianDrawing {
    ParsedObsidianDrawing {
        data_json: extract_scene_json(content),
        text_elements: extract_text_elements(content),
    }
}

/// Extract the scene JSON from the Drawing section: a fenced `json` or
/// `compressed-json` block, or legacy unfenced JSON directly under the heading.
fn extract_scene_json(content: &str) -> Option<String> {
    let (_, heading_end) = drawing_heading_span(content)?;
    let rest = &content[heading_end + 1..];
    let mut lines = rest.lines();

    for line in lines.by_ref() {
        let t = line.trim();
        // Skip blanks and the "%%" comment that may follow the heading.
        if t.is_empty() || t.starts_with("%%") {
            continue;
        }
        if let Some(kind) = t.strip_prefix("```") {
            // Fenced block: ```json or ```compressed-json
            let kind = kind.trim();
            let mut buf = String::new();
            for inner in lines.by_ref() {
                if inner.trim() == "```" {
                    return decode_fenced_scene(&buf, kind);
                }
                buf.push_str(inner);
                buf.push('\n');
            }
            return None; // unterminated fence
        }
        if t.starts_with('{') {
            // Legacy layout: raw JSON lines directly under the heading.
            let mut buf = String::new();
            buf.push_str(line);
            buf.push('\n');
            for inner in lines.by_ref() {
                let it = inner.trim();
                if it.is_empty() || it.starts_with("%%") || it.starts_with('#') {
                    break;
                }
                buf.push_str(inner);
                buf.push('\n');
            }
            // Trim to the last '}' — mirrors the plugin's sync-merge workaround.
            let trimmed = buf.trim();
            let end = trimmed.rfind('}').unwrap_or(trimmed.len());
            return Some(trimmed[..=end].to_string());
        }
        if t.starts_with('#') {
            return None; // next section without a scene block
        }
    }
    None
}

fn decode_fenced_scene(buf: &str, kind: &str) -> Option<String> {
    if kind == "compressed-json" {
        let cleaned: String = buf
            .chars()
            .filter(|c| *c != '\n' && *c != '\r')
            .collect();
        let json = decompress_from_base64(&cleaned)?;
        // Validate — a corrupted payload must degrade to the empty scene, not
        // garbage text.
        return serde_json::from_str::<serde_json::Value>(&json)
            .ok()
            .map(|_| json);
    }
    let s = buf.trim();
    if s.starts_with('{') {
        Some(s.to_string())
    } else {
        None
    }
}

/// Extract bullet lines from the `# Text Elements` / `## Text Elements` section.
fn extract_text_elements(content: &str) -> Vec<String> {
    let mut result = Vec::new();
    let mut in_text_section = false;

    for line in content.lines() {
        let t = line.trim();
        if !in_text_section {
            if t == "# Text Elements" || t == "## Text Elements" {
                in_text_section = true;
            }
            continue;
        }
        if t.is_empty() {
            continue;
        }
        if t.starts_with('#') || t.starts_with("%%") {
            break;
        }
        if let Some(item) = t.strip_prefix('-') {
            let val = item.trim();
            if !val.is_empty() {
                result.push(strip_block_ref(val).to_string());
            }
        }
    }

    result
}

/// Strip an Obsidian block-reference suffix (` ^blockid`) from a text bullet.
/// The plugin appends `^<id>` to each element bullet; those ids are file-local
/// link anchors, not searchable text.
fn strip_block_ref(s: &str) -> &str {
    let s = s.trim_end();
    let Some(hat) = s.rfind('^') else {
        return s;
    };
    let id = &s[hat + 1..];
    if id.is_empty() || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return s;
    }
    let before = s[..hat].trim_end();
    if before.len() != hat {
        before
    } else {
        s
    }
}

/// Update the scene in an Obsidian-format file in place: only the `## Drawing`
/// fenced block is replaced, every other section is preserved byte-for-byte.
/// The plugin reads uncompressed `json` fences, so no recompression is needed.
/// When the file has no Drawing section, a fresh one is appended.
pub(crate) fn serialize_obsidian_markdown(data_json: &str, existing: &str) -> String {
    let lines: Vec<&str> = existing.split('\n').collect();
    let mut out = String::with_capacity(existing.len() + data_json.len());
    let mut replaced = false;

    let mut i = 0;
    while i < lines.len() {
        let t = lines[i].trim();
        if t != "# Drawing" && t != "## Drawing" {
            out.push_str(lines[i]);
            out.push('\n');
            i += 1;
            continue;
        }

        // Scan ahead for the fenced scene block under this heading.
        let mut fence_open = None;
        let mut j = i + 1;
        while j < lines.len() {
            let tj = lines[j].trim();
            if tj.is_empty() || tj.starts_with("%%") {
                j += 1;
                continue;
            }
            if tj.starts_with("```") {
                fence_open = Some(j);
                break;
            }
            break; // heading not followed by a fence — leave untouched
        }

        let fence_close = fence_open.and_then(|open| {
            (open + 1..lines.len()).find(|&k| lines[k].trim() == "```")
        });

        if let (Some(_), Some(close)) = (fence_open, fence_close) {
            out.push_str(lines[i]);
            out.push('\n');
            out.push_str("```json\n");
            out.push_str(data_json.trim());
            out.push_str("\n```\n");
            i = close + 1;
            replaced = true;
            continue;
        }

        // No parseable fence — keep the heading verbatim.
        out.push_str(lines[i]);
        out.push('\n');
        i += 1;
    }

    if !replaced {
        out.push_str("\n## Drawing\n```json\n");
        out.push_str(data_json.trim());
        out.push_str("\n```\n");
    }

    out
}

// ---------------------------------------------------------------------------
// LZString `decompressFromBase64` — a faithful port of the reference
// implementation (pieroxy/lz-string), re-licensed here under this project's
// terms at the author's explicit request.
// ---------------------------------------------------------------------------

const KEY_STR_BASE64: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";

struct Base64BitReader<'a> {
    input: &'a [u8],
    val: i64,
    position: i64,
    index: usize,
}

impl<'a> Base64BitReader<'a> {
    fn new(input: &'a [u8]) -> Self {
        Self {
            input,
            val: value_at(input, 0),
            position: 32,
            index: 1,
        }
    }

    /// Read `n` bits from the stream (5 bits per base64 char).
    fn read(&mut self, n: u32) -> i64 {
        let mut bits = 0i64;
        let mut power = 1i64;
        let max_power = 1i64 << n;
        while power != max_power {
            let resb = self.val & self.position;
            self.position >>= 1;
            if self.position == 0 {
                self.position = 32;
                self.val = value_at(self.input, self.index);
                self.index += 1;
            }
            if resb > 0 {
                bits |= power;
            }
            power <<= 1;
        }
        bits
    }
}

fn value_at(input: &[u8], index: usize) -> i64 {
    input
        .get(index)
        .and_then(|b| KEY_STR_BASE64.iter().position(|k| k == b))
        .map(|p| p as i64)
        .unwrap_or(-1)
}

/// LZString `decompressFromBase64`. Returns `None` on malformed input.
pub(crate) fn decompress_from_base64(input: &str) -> Option<String> {
    if input.is_empty() {
        return Some(String::new());
    }

    let bytes = input.as_bytes();
    let mut reader = Base64BitReader::new(bytes);
    let length = bytes.len();

    // Dictionary of code-unit runs, seeded like the reference: 0, 1, 2.
    let mut dictionary: Vec<Vec<u16>> = vec![vec![0], vec![1], vec![2]];
    let mut enlarge_in = 4i64;
    let mut dict_size = 4i64;
    let mut num_bits = 3i64;
    let mut w: Vec<u16>;
    let mut result: Vec<u16> = Vec::new();

    // Initial code: 2 bits → 8-bit or 16-bit first character.
    let c: u16 = match reader.read(2) {
        0 => reader.read(8) as u16,
        1 => reader.read(16) as u16,
        _ => return Some(String::new()),
    };
    dictionary.push(vec![c]);
    w = vec![c];
    result.push(c);

    loop {
        if reader.index > length {
            return None;
        }

        let bits = reader.read(num_bits as u32);
        let c: i64 = if bits == 0 {
            let code = reader.read(8) as u16;
            dictionary.push(vec![code]);
            dict_size += 1;
            enlarge_in -= 1;
            dict_size - 1
        } else if bits == 1 {
            let code = reader.read(16) as u16;
            dictionary.push(vec![code]);
            dict_size += 1;
            enlarge_in -= 1;
            dict_size - 1
        } else {
            bits
        };
        if c == 2 {
            return Some(code_units_to_string(&result));
        }
        if enlarge_in == 0 {
            enlarge_in = 1i64 << num_bits;
            num_bits += 1;
        }

        // LZ77-style dictionary walk.
        let entry: Vec<u16> = if let Some(e) = dictionary.get(c as usize) {
            e.clone()
        } else if c as usize == dict_size as usize {
            // c === dictSize: entry is w + first code unit of w.
            let mut e = w.clone();
            if let Some(&first) = w.first() {
                e.push(first);
            }
            e
        } else {
            return None;
        };
        result.extend_from_slice(&entry);

        let mut next = w.clone();
        if let Some(&first) = entry.first() {
            next.push(first);
        }
        dictionary.push(next);
        dict_size += 1;
        enlarge_in -= 1;
        w = entry;
        if enlarge_in == 0 {
            enlarge_in = 1i64 << num_bits;
            num_bits += 1;
        }
    }
}

/// Convert UTF-16 code units to a `String`, pairing surrogate halves.
fn code_units_to_string(units: &[u16]) -> String {
    let mut s = String::with_capacity(units.len());
    let mut i = 0;
    while i < units.len() {
        let u = units[i];
        if (0xD800..=0xDBFF).contains(&u)
            && i + 1 < units.len()
            && (0xDC00..=0xDFFF).contains(&units[i + 1])
        {
            let cp = 0x10000 + ((u as u32 - 0xD800) << 10) + (units[i + 1] as u32 - 0xDC00);
            s.push(char::from_u32(cp).unwrap_or('\u{FFFD}'));
            i += 2;
        } else {
            s.push(char::from_u32(u as u32).unwrap_or('\u{FFFD}'));
            i += 1;
        }
    }
    s
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Small scene compressed with the reference `compressToBase64`.
    const COMPRESSED_FIXTURE: &str = "N4IgLgngDgpiBcIYA8DGBDANgSwCYCd0B3EAGhADcZ8BnbAewDsEAmcm+gV31TkXoBGdXNnSMAtCgw4CxcVEycA5tmbkYmGAFsYjMDQQBtUJFgJwKMGRB5zYAIzWwl8wAkNmegAIAZvnpaXgDyQniiajY0ACIaMM64CD5YNDAAvgC65OhQUADKYOjOCMCp5D7YmgbwJalAA=";

    fn obsidian_doc(drawing: &str) -> String {
        format!(
            "---\nexcalidraw-plugin: parsed\ntags: [excalidraw]\n---\n\n==⚠ Switch to EXCALIDRAW VIEW... ⚠==\n\n# Excalidraw Data\n## Text Elements\n- routes ^Jzdcv7eT\n- First item ^abc\n\n## Drawing\n{drawing}\n%%\n"
        )
    }

    #[test]
    fn test_decompress_from_base64_fixture() {
        let json = decompress_from_base64(COMPRESSED_FIXTURE).expect("decompress failed");
        assert!(json.contains("\"type\":\"excalidraw\""));
        assert!(json.contains("Hello from Obsidian"));
    }

    #[test]
    fn test_compressed_scene_round_trip() {
        let content = obsidian_doc(&format!("```compressed-json\n{}\n```", COMPRESSED_FIXTURE));
        let parsed = parse_obsidian_excalidraw(&content);
        let json = parsed.data_json.expect("scene expected");
        assert!(json.contains("Hello from Obsidian"));
        assert_eq!(parsed.text_elements, vec!["routes", "First item"]);
    }

    #[test]
    fn test_json_fence_scene() {
        let content = obsidian_doc(
            "```json\n{\"type\":\"excalidraw\",\"version\":2,\"elements\":[{\"type\":\"text\",\"text\":\"Hello\",\"isDeleted\":false}],\"appState\":{},\"files\":{}}\n```",
        );
        let parsed = parse_obsidian_excalidraw(&content);
        let json = parsed.data_json.expect("scene expected");
        assert!(json.contains("\"Hello\""));
    }

    #[test]
    fn test_legacy_unfenced_json_scene() {
        let content = obsidian_doc(
            "{\"type\":\"excalidraw\",\"version\":2,\"elements\":[],\"appState\":{},\"files\":{}}",
        );
        let parsed = parse_obsidian_excalidraw(&content);
        assert!(parsed.data_json.is_some());
    }

    #[test]
    fn test_missing_drawing_section_yields_none() {
        let content = "---\nexcalidraw-plugin: parsed\n---\n# Excalidraw Data\nNot a drawing\n";
        let parsed = parse_obsidian_excalidraw(content);
        assert!(parsed.data_json.is_none());
    }

    #[test]
    fn test_strip_block_ref() {
        assert_eq!(strip_block_ref("routes ^Jzdcv7eT"), "routes");
        assert_eq!(strip_block_ref("First item ^abc"), "First item");
        assert_eq!(strip_block_ref("2^10 is eight"), "2^10 is eight");
        assert_eq!(strip_block_ref("Plain text"), "Plain text");
        assert_eq!(strip_block_ref("trailing space ^x1 "), "trailing space");
    }

    #[test]
    fn test_serialize_obsidian_replaces_drawing_block_only() {
        let original = obsidian_doc(&format!("```compressed-json\n{}\n```", COMPRESSED_FIXTURE));
        let new_scene =
            "{\"type\":\"excalidraw\",\"version\":2,\"elements\":[{\"type\":\"text\",\"text\":\"Edited\",\"isDeleted\":false}],\"appState\":{},\"files\":{}}";
        let rewritten = serialize_obsidian_markdown(new_scene, &original);

        // Every non-Drawing section is preserved byte-for-byte.
        for section in [
            "excalidraw-plugin: parsed",
            "==⚠ Switch to EXCALIDRAW VIEW... ⚠==",
            "# Excalidraw Data",
            "## Text Elements",
            "- routes ^Jzdcv7eT",
            "- First item ^abc",
            "%%",
        ] {
            assert!(rewritten.contains(section), "lost section: {section}");
        }
        // The Drawing block now carries the fresh scene as an uncompressed json fence.
        assert!(rewritten.contains("```json\n"));
        assert!(rewritten.contains("\"text\":\"Edited\""));
        assert!(!rewritten.contains(COMPRESSED_FIXTURE));
    }
}
