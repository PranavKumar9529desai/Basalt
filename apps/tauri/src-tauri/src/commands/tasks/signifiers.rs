//! Task signifier parsing: priority emoji, dates, recurrence, tags (ADR-048 §2).

/// The default status cycle: `todo → done → cancelled → todo`.
/// This matches Obsidian Tasks semantics.
pub(crate) const DEFAULT_STATUS_CYCLE: &[&str] = &["todo", "done", "cancelled"];

/// Parsed signifier references (borrows from the source line).
pub(super) struct ParsedSignifiers<'a> {
    pub priority: Option<&'a str>,
    pub due: Option<&'a str>,
    pub scheduled: Option<&'a str>,
    pub start: Option<&'a str>,
    pub created: Option<&'a str>,
    pub recurrence: Option<&'a str>,
    pub tags: Vec<&'a str>,
}

/// A token that begins a signifier — bounds recurrence absorption and
/// description stripping ("every week on Monday" stays one rule; "#tag"
/// after it does not).
pub(super) fn is_signifier_token(t: &str) -> bool {
    t.starts_with("📅")
        || t.starts_with("🛫")
        || t.starts_with("⏳")
        || t.starts_with("➕")
        || t.starts_with("🔁")
        || t.starts_with("🔺")
        || t.starts_with("⏫")
        || t.starts_with("🔴")
        || t.starts_with("🔼")
        || t.starts_with("🟡")
        || t.starts_with("🔽")
        || t.starts_with("🔵")
        || t.starts_with("⏬")
        || t.starts_with("最低")
        || t.starts_with('#')
        || t == "p0"
        || t == "p1"
        || t == "p2"
        || t == "p3"
        || t == "p4"
}

/// Parse signifiers from the description text.
pub(super) fn parse_signifiers_from_desc(desc: &str) -> ParsedSignifiers<'_> {
    let mut priority = None;
    let mut due = None;
    let mut scheduled = None;
    let mut start = None;
    let mut created = None;
    let mut recurrence = None;
    let mut tags: Vec<&str> = Vec::new();

    let tokens: Vec<&str> = desc.split_whitespace().collect();
    // True byte offsets of each token (whitespace runs are collapsed by
    // split_whitespace but still exist in `desc`).
    let mut offsets = Vec::with_capacity(tokens.len());
    let mut pos = 0;
    for t in &tokens {
        let rel = desc[pos..].find(t).expect("token must exist in desc");
        offsets.push(pos + rel);
        pos += rel + t.len();
    }
    let mut i = 0;
    while i < tokens.len() {
        let token = tokens[i];
        // Priority — ADR-048 §2.3 canonical emoji plus legacy Obsidian v7
        // emoji / p0-p4 tokens read for backward compatibility.
        if token.starts_with("🔺") || token == "p0" {
            priority = Some("highest");
        } else if token.starts_with("⏫") || token.starts_with("🔴") || token == "p1" {
            priority = Some("high");
        } else if token.starts_with("🔼") || token.starts_with("🟡") || token == "p2" {
            priority = Some("medium");
        } else if token.starts_with("🔽") || token.starts_with("🔵") || token == "p3" {
            priority = Some("low");
        } else if token.starts_with("⏬") || token.starts_with("最低") || token == "p4" {
            priority = Some("lowest");
        } else if let Some(date) = token.strip_prefix("📅") {
            due = Some(date);
        } else if let Some(date) = token.strip_prefix("🛫") {
            start = Some(date);
        } else if let Some(date) = token.strip_prefix("⏳") {
            scheduled = Some(date);
        } else if let Some(date) = token.strip_prefix("➕") {
            created = Some(date);
        } else if let Some(rule) = token.strip_prefix("🔁") {
            // Recurrence absorbs following plain tokens until the next
            // signifier: "🔁every 2 weeks on Friday" -> "every 2 weeks on Friday".
            let rule_start = offsets[i] + (token.len() - rule.len());
            let mut end = offsets[i] + token.len();
            let mut j = i + 1;
            while j < tokens.len() && !is_signifier_token(tokens[j]) {
                end = offsets[j] + tokens[j].len();
                j += 1;
            }
            recurrence = Some(&desc[rule_start..end]);
            i = j; // resume after the absorbed tokens
            continue;
        } else if token.starts_with('#') {
            tags.push(token);
        }
        i += 1;
    }

    ParsedSignifiers {
        priority,
        due,
        scheduled,
        start,
        created,
        recurrence,
        tags,
    }
}

/// Map checkbox character to status name.
pub(super) fn checkbox_char_to_status(c: char) -> String {
    match c {
        'x' | 'X' => "done".to_string(),
        ' ' => "todo".to_string(),
        '-' => "cancelled".to_string(),
        '/' => "in_progress".to_string(),
        '?' => "on_hold".to_string(),
        '>' => "deferred".to_string(),
        _ => "todo".to_string(),
    }
}

/// Map status name to checkbox character.
pub(super) fn status_to_checkbox_char(status: &str) -> char {
    match status {
        "done" => 'x',
        "todo" => ' ',
        "cancelled" => '-',
        "in_progress" => '/',
        "on_hold" => '?',
        "deferred" => '>',
        _ => ' ',
    }
}

/// Cycle to next status in the default cycle.
pub(super) fn cycle_status(current: &str) -> String {
    let idx = DEFAULT_STATUS_CYCLE
        .iter()
        .position(|s| *s == current)
        .unwrap_or(0);
    let next = (idx + 1) % DEFAULT_STATUS_CYCLE.len();
    DEFAULT_STATUS_CYCLE[next].to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn priority_to_name_maps_canonical_emoji() {
        let sigs = parse_signifiers_from_desc("a 🔺 b ⏫ c 🔼 d 🔽 e ⏬");
        assert_eq!(sigs.priority, Some("lowest")); // last token wins
    }

    #[test]
    fn parses_canonical_signifiers_with_multi_token_recurrence() {
        let sigs = parse_signifiers_from_desc(
            "Fix bug ⏫ 📅2024-01-07 ⏳2024-01-05 🛫2024-01-01 🔁every 2 weeks on Friday #work",
        );
        assert_eq!(sigs.priority, Some("high"));
        assert_eq!(sigs.due, Some("2024-01-07"));
        assert_eq!(sigs.scheduled, Some("2024-01-05"));
        assert_eq!(sigs.start, Some("2024-01-01"));
        assert_eq!(sigs.recurrence, Some("every 2 weeks on Friday"));
        assert_eq!(sigs.tags, vec!["#work"]);
    }

    #[test]
    fn reads_legacy_emoji_and_p_tokens() {
        assert_eq!(parse_signifiers_from_desc("p0").priority, Some("highest"));
        assert_eq!(parse_signifiers_from_desc("🔴").priority, Some("high"));
        assert_eq!(parse_signifiers_from_desc("🟡").priority, Some("medium"));
        assert_eq!(parse_signifiers_from_desc("🔵").priority, Some("low"));
        assert_eq!(parse_signifiers_from_desc("最低").priority, Some("lowest"));
        assert_eq!(parse_signifiers_from_desc("p4").priority, Some("lowest"));
    }

    #[test]
    fn on_hold_status_round_trips() {
        assert_eq!(checkbox_char_to_status('?'), "on_hold");
        assert_eq!(status_to_checkbox_char("on_hold"), '?');
    }

    #[test]
    fn cycle_follows_default_sequence() {
        assert_eq!(cycle_status("todo"), "done");
        assert_eq!(cycle_status("done"), "cancelled");
        assert_eq!(cycle_status("cancelled"), "todo");
    }
}
