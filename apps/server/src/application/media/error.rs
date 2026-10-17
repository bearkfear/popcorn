//! Defines media application failures and translates invalid domain input.

use crate::core::media::InvalidMedia;

#[derive(Debug, thiserror::Error)]
pub(crate) enum MediaError {
    #[error("invalid source request")]
    Invalid,
    #[error("source catalog changed since preview")]
    CatalogChanged,
    #[error("source not found")]
    NotFound,
    #[error("source is in use")]
    InUse,
    #[error("torrent engine unavailable")]
    Unavailable,
    #[error("cache capacity exceeded")]
    Capacity,
    #[error("source database error")]
    Database(#[source] Box<dyn std::error::Error + Send + Sync>),
}

impl From<InvalidMedia> for MediaError {
    fn from(_: InvalidMedia) -> Self {
        Self::Invalid
    }
}
