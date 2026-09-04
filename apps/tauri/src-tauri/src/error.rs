//! Typed error type for the Tauri command layer.
//!
//! Commands return `Result<T, AppError>` instead of `Result<T, String>` so
//! every failure mode is explicit and matchable. On the wire, `AppError`
//! serializes to its human-readable `Display` string — preserving the exact
//! shape the frontend already consumes via `catch (err) { String(err) }` — so
//! switching from `String` errors to this type is a zero-change upgrade for
//! the frontend (see the official Tauri error-handling pattern).

use serde::ser::Serializer;
use serde::Serialize;

/// All errors a Tauri command can return.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    /// The vault has not been configured/opened yet.
    #[error("no vault configured")]
    NoVault,
    /// A shared-state lock was poisoned by a panic in another thread.
    #[error("{0} lock poisoned")]
    LockPoisoned(&'static str),
    /// The configured vault path could not be canonicalized.
    #[error("invalid vault path: {0}")]
    InvalidVaultPath(#[source] std::io::Error),
    /// A path or name failed validation.
    #[error("{0}")]
    Validation(String),
    /// A DQL query could not be parsed or executed.
    #[error("{0}")]
    Query(String),
    /// A search operation failed.
    #[error("{0}")]
    Search(String),
    /// A filesystem operation failed.
    #[error("{0}")]
    Io(String),
    /// Any other operational failure carrying a human-readable message.
    #[error("{0}")]
    Other(String),
}

impl From<String> for AppError {
    fn from(s: String) -> Self {
        AppError::Other(s)
    }
}

impl From<&str> for AppError {
    fn from(s: &str) -> Self {
        AppError::Other(s.to_string())
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::Io(e.to_string())
    }
}

impl From<basalt_vault::path_utils::PathError> for AppError {
    fn from(e: basalt_vault::path_utils::PathError) -> Self {
        AppError::Validation(e.to_string())
    }
}

impl From<basalt_parser::ParseError> for AppError {
    fn from(e: basalt_parser::ParseError) -> Self {
        AppError::Query(e.to_string())
    }
}

// The frontend consumes command errors as strings (`catch (err) => String(err)`).
// Serialize as a plain string so the wire contract is unchanged.
impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

/// Convenience alias for command results.
pub type AppResult<T> = Result<T, AppError>;
