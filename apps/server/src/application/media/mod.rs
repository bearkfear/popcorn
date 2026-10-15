//! Media application service composed from persistence and transfer ports.

pub mod commands;
pub mod ports;
pub mod queries;

pub(crate) use commands::{AddSource, StartPlayback};
pub(crate) use ports::{
    AccessError, Cache, MediaAccess, PlaybackFile, ResolvedSource, Sources, Transfers,
};

use tokio::sync::Mutex;

use crate::core::media::InvalidMedia;

#[derive(Debug, thiserror::Error)]
pub(crate) enum MediaError {
    #[error("invalid source request")]
    Invalid,
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

#[derive(Debug)]
pub(crate) struct MediaService<R, T, C> {
    sources: R,
    transfers: T,
    cache: C,
    command: Mutex<()>,
}

impl<R: Sources, T: Transfers, C: Cache> MediaService<R, T, C> {
    pub(crate) fn new(sources: R, transfers: T, cache: C) -> Self {
        Self {
            sources,
            transfers,
            cache,
            command: Mutex::new(()),
        }
    }
}
