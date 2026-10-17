//! Reads cache location, quota and current disk usage.

use crate::application::media::{Cache, MediaError, Sources, Transfers, context::MediaContext};

pub(crate) struct GetCacheSettings;

#[derive(Debug)]
pub(crate) struct CacheSettings {
    pub(crate) directory: String,
    pub(crate) limit_bytes: u64,
    pub(crate) used_bytes: u64,
}

pub(crate) async fn handle<R: Sources, T: Transfers, C: Cache>(
    context: &MediaContext<R, T, C>,
    _query: GetCacheSettings,
) -> Result<CacheSettings, MediaError> {
    context.cache.settings().await
}
