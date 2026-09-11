mod engine;
pub mod expr;
mod grouping;
mod output;
pub mod page_row;

pub use engine::{execute_query, DqlError};

// Re-export key types for convenience
pub use basalt_types::{QueryColumn, QueryColumnType, QueryResult, TypedValue};

// Task query entry point + wire types (ADR-048) — hosted in `basalt-task`,
// re-exported here so the DQL `TASK` branch and the `get_tasks` IPC keep
// their existing import paths.
pub use basalt_task::{
    calculate_urgency, execute_task_query, TaskFilter, TaskQuery, TaskSort,
};
