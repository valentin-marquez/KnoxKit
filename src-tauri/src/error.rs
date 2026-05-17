//! Crate-wide error type and result alias.
//!
//! keep names path-relative — see docs/conventions.md
//!
//! Callers write `crate::Error` / `crate::Result<T>` (re-exported at the crate
//! root in `lib.rs`). The error serializes over Tauri IPC as its `Display`
//! string so the frontend always receives a plain human-readable message.

use serde::{Serialize, Serializer};

/// Unified error type for every fallible operation in the backend.
#[derive(Debug, thiserror::Error)]
pub enum Error {
    /// Filesystem / IO failure.
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),

    /// JSON (de)serialization failure.
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),

    /// A requested entity (instance, file, ...) does not exist.
    #[error("not found: {0}")]
    NotFound(String),

    /// SteamCMD process / protocol failure.
    #[error("steamcmd error: {0}")]
    Steamcmd(String),

    /// Workshop URL / id parsing failure.
    #[error("workshop error: {0}")]
    Workshop(String),

    /// Modpack build / read failure.
    #[error("modpack error: {0}")]
    Modpack(String),

    /// Domain validation failure (bad manifest, etc.).
    #[error("validation error: {0}")]
    Validation(String),

    /// Zip archive read/write failure.
    #[error("zip error: {0}")]
    Zip(String),
}

impl Serialize for Error {
    /// Serialize the error as its `Display` string so the JS frontend receives
    /// a single readable message rather than a tagged enum.
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

impl From<zip::result::ZipError> for Error {
    /// Map `zip` crate errors into [`Error::Zip`].
    fn from(value: zip::result::ZipError) -> Self {
        Error::Zip(value.to_string())
    }
}

/// Crate-wide result alias.
pub type Result<T> = std::result::Result<T, Error>;

#[cfg(test)]
mod tests {
    use super::*;
    use pretty_assertions::assert_eq;

    #[test]
    fn serializes_to_display_string() {
        let e = Error::NotFound("instance abc".into());
        let json = serde_json::to_string(&e).expect("serialize");
        assert_eq!(json, "\"not found: instance abc\"");
    }

    #[test]
    fn io_error_converts_via_from() {
        let io = std::io::Error::other("boom");
        let e: Error = io.into();
        assert!(matches!(e, Error::Io(_)));
    }
}
