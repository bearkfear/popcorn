//! Translates SQL and credential file failures into catalog domain errors.

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
