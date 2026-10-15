//! Describes failures while composing, starting and stopping the local backend.

use std::io;

/// Failures encountered while preparing or running the local backend.
#[derive(Debug, thiserror::Error)]
#[non_exhaustive]
pub enum Error {
    /// Local TMDB configuration or HTTP client initialization failed.
    #[error("could not initialize TMDB configuration")]
    TmdbConfiguration,
    /// A filesystem, listener or signal operation failed.
    #[error("local I/O failed")]
    Io(#[from] io::Error),
    /// A `SQLite` operation failed.
    #[error("database operation failed")]
    Database(#[from] sqlx::Error),
    /// A local migration could not be applied.
    #[error("local database migration failed")]
    Migration(#[from] sqlx::migrate::MigrateError),
    /// Another process owns the selected data directory.
    #[error("data directory is already in use")]
    DataDirectoryBusy,
    /// The catalog must be kept outside the writable data directory.
    #[error("catalog must be outside the user data directory")]
    CatalogInDataDirectory,
    /// Writable storage is a symbolic link or aliases the installed snapshot.
    #[error("user database must be a distinct regular file")]
    InvalidUserDatabase,
    /// The published schema is not understood by this binary.
    #[error("unsupported catalog schema version: {0}")]
    UnsupportedCatalogSchema(i64),
    /// The catalog's metadata is absent or inconsistent.
    #[error("invalid catalog metadata")]
    InvalidCatalogMetadata,
    /// A database integrity check failed.
    #[error("catalog integrity check failed")]
    InvalidCatalog,
    /// The token file does not contain a 64-character hexadecimal secret.
    #[error("token file must contain 64 hexadecimal characters")]
    InvalidToken,
    /// The private sidecar pipe contains an invalid or oversized message.
    #[error("invalid sidecar control message")]
    InvalidControlMessage,
    /// The shell did not initialize the sidecar before its deadline.
    #[error("sidecar initialization exceeded its deadline")]
    InitializationTimeout,
    /// The shutdown deadline elapsed while draining HTTP connections.
    #[error("backend shutdown exceeded its deadline")]
    ShutdownTimeout,
    /// A blocking bootstrap task failed to complete.
    #[error("bootstrap task failed")]
    Task(#[from] tokio::task::JoinError),
    /// A catalog snapshot could not be published without overwriting a file.
    #[error("cannot publish catalog snapshot")]
    PublishCatalog(#[from] tempfile::PersistError),
    /// Writing the bootstrap event failed.
    #[error("cannot serialize bootstrap event")]
    Serialization(#[from] serde_json::Error),
}
