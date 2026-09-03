use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SearchResult {
    pub id: String,
    pub score: i32,
}

/// Simple fuzzy matching algorithm inspired by sub-string scoring.
/// Higher score means better match.
pub fn fuzzy_match(query: &str, text: &str) -> Option<i32> {
    if query.is_empty() {
        return Some(0);
    }

    let query = query.to_lowercase();
    let text = text.to_lowercase();

    if let Some(idx) = text.find(&query) {
        // Perfect substring match gets a base score
        let mut score = 100;
        // Bonus for matching at start of string
        if idx == 0 {
            score += 50;
        }
        return Some(score);
    }

    // Fallback to a simple character-by-character check for true "fuzzy" matching
    let mut score = 0;
    let mut current_pos = 0;

    for q_char in query.chars() {
        let pos = text[current_pos..].find(q_char)?;
        score += 10;
        // Bonus for consecutive characters
        if pos == 0 {
            score += 5;
        }
        current_pos += pos + q_char.len_utf8();
    }

    Some(score)
}

pub fn search_commands(query: &str, candidates: Vec<(String, String)>) -> Vec<SearchResult> {
    let mut results: Vec<SearchResult> = candidates
        .into_iter()
        .filter_map(|(id, name)| fuzzy_match(query, &name).map(|score| SearchResult { id, score }))
        .collect();

    results.sort_by_key(|a| std::cmp::Reverse(a.score));
    results
}
