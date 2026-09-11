//! Task management domain layer (ADR-048, roadmap §3).
//!
//! Holds the task *grammar* — checkbox-char ↔ status, priority emoji ↔
//! level, the status cycle, signifier parsing, and lossless line
//! serialization. The ADR-041 fused scanner stays in `basalt-parser`
//! (it scans whole files during indexing); this crate parses/serializes
//! individual *lines* and (from phase 2) executes task queries.
//!
//! Dependency chain: `basalt-tables → basalt-task → basalt-vault →
//! basalt-parser → basalt-types`. No cycles.

pub mod line;
pub mod serializer;
pub mod signifiers;

pub use line::{parse_task_line, TaskLineRef};
pub use serializer::{build_task_line, TaskLineParts};
pub use signifiers::{
    is_signifier_token, next_in_cycle, parse_signifiers, priority_emoji, priority_from_emoji,
    priority_from_name, status_from_name, status_from_symbol, status_symbol, DEFAULT_STATUS_CYCLE,
    Signifiers,
};