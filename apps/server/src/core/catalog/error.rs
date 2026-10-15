//! Catalog failures independent of persistence and transport libraries.
#[derive(Debug, Clone, Copy, thiserror::Error)]
pub(crate) enum CatalogError {
    #[error("invalid TMDB configuration")]
    Configuration,
    #[error("invalid TMDB credential")]
    InvalidCredential,
    #[error("TMDB is not configured")]
    NotConfigured,
    #[error("TMDB is unavailable")]
    Unavailable,
    #[error("TMDB title not found")]
    NotFound,
    #[error("TMDB rate limited")]
    RateLimited { retry_after_seconds: u32 },
    #[error("catalog cache database error")]
    Database,
    #[error("credential file I/O error")]
    Io,
    #[error("invalid TMDB response")]
    InvalidResponse,
    #[error("{0}")]
    Invalid(&'static str),
    #[error("title not found")]
    SnapshotNotFound,
}
