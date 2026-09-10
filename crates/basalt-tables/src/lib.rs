mod engine;
pub mod expr;
mod grouping;
mod output;
pub mod page_row;
mod urgency;

pub use engine::{execute_query, DqlError};

// Re-export key types for convenience
pub use basalt_types::{QueryColumn, QueryColumnType, QueryResult, TypedValue};

// Task query entry point (ADR-048)
pub use output::execute_task_query;

// Re-export task query types for Tauri commands
pub use output::{TaskFilter, TaskQuery, TaskSort};
pub use urgency::calculate_urgency;