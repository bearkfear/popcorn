//! `SQLite` snapshot and TMDB metadata adapters.
pub mod lifecycle;
pub mod snapshot;
pub mod tmdb;
pub use lifecycle::create_catalog;
pub(crate) use lifecycle::open;
pub(crate) use snapshot::SqliteSnapshot;
impl From<sqlx::Error> for crate::core::catalog::CatalogError {
    fn from(error: sqlx::Error) -> Self {
        tracing::error!(%error, "catalog query failed");
        Self::Database
    }
}

impl From<std::io::Error> for crate::core::catalog::CatalogError {
    fn from(error: std::io::Error) -> Self {
        tracing::error!(%error, "catalog credential file failed");
        Self::Io
    }
}
