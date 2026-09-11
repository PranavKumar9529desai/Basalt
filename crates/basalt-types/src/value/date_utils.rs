//! ISO-8601 date and datetime string parsing.

use chrono::{DateTime, NaiveDate};

/// Parse a `YYYY-MM-DD` date string to a UNIX timestamp.
pub fn parse_date_ts(s: &str) -> Option<i64> {
    let nd = NaiveDate::parse_from_str(s, "%Y-%m-%d").ok()?;
    Some(nd.and_hms_opt(0, 0, 0)?.and_utc().timestamp())
}

/// Parse an ISO-8601 datetime string (RFC-3339 or bare `YYYY-MM-DD`) to a UNIX timestamp.
pub fn parse_datetime_ts(s: &str) -> Option<i64> {
    if let Ok(dt) = DateTime::parse_from_rfc3339(s) {
        Some(dt.timestamp())
    } else if let Ok(nd) = NaiveDate::parse_from_str(s, "%Y-%m-%d") {
        Some(nd.and_hms_opt(0, 0, 0)?.and_utc().timestamp())
    } else {
        None
    }
}
