//! Translates application failures into stable Connect error codes.

use connectrpc::{ConnectError, ErrorCode};

use crate::{application::media::MediaError, core::catalog::CatalogError};

pub(super) fn catalog_error(error: CatalogError) -> ConnectError {
    let (code, reason) = match error {
        CatalogError::NotConfigured => (ErrorCode::FailedPrecondition, "TMDB_NOT_CONFIGURED"),
        CatalogError::InvalidCredential => (ErrorCode::Unauthenticated, "TMDB_INVALID_CREDENTIAL"),
        CatalogError::Unavailable => (ErrorCode::Unavailable, "TMDB_UNAVAILABLE"),
        CatalogError::NotFound => (ErrorCode::NotFound, "TMDB_NOT_FOUND"),
        CatalogError::RateLimited { .. } => (ErrorCode::ResourceExhausted, "TMDB_RATE_LIMITED"),
        CatalogError::InvalidResponse => (ErrorCode::Unavailable, "TMDB_INVALID_RESPONSE"),
        CatalogError::Configuration | CatalogError::Io => {
            (ErrorCode::FailedPrecondition, "TMDB_CONFIGURATION")
        }
        CatalogError::Database => (ErrorCode::Internal, "catalog query failed"),
        CatalogError::Invalid(message) => return invalid(message),
        CatalogError::SnapshotNotFound => (ErrorCode::NotFound, "title not found"),
    };
    ConnectError::new(code, reason)
}

pub(super) fn invalid(message: &str) -> ConnectError {
    ConnectError::new(ErrorCode::InvalidArgument, message)
}

fn database_error(error: &dyn std::error::Error) -> ConnectError {
    tracing::error!(%error, "catalog query failed");
    ConnectError::new(ErrorCode::Internal, "catalog query failed")
}

pub(super) fn source_error(error: MediaError) -> ConnectError {
    let (code, reason) = match error {
        MediaError::CatalogChanged => (ErrorCode::FailedPrecondition, "CATALOG_CHANGED"),
        MediaError::Invalid => (ErrorCode::InvalidArgument, "SOURCE_INVALID"),
        MediaError::NotFound => (ErrorCode::NotFound, "SOURCE_NOT_FOUND"),
        MediaError::InUse => (ErrorCode::FailedPrecondition, "SOURCE_IN_USE"),
        MediaError::Unavailable => (ErrorCode::Unavailable, "SOURCE_UNAVAILABLE"),
        MediaError::Capacity => (ErrorCode::ResourceExhausted, "CACHE_LIMIT"),
        MediaError::Database(error) => return database_error(error.as_ref()),
    };
    ConnectError::new(code, reason)
}
