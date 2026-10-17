//! Reads cache location, quota and current disk usage.

use crate::application::media::{Cache, MediaError, Sources, Transfers, context::MediaContext};
use crate::core::media::CacheSettings;

pub(crate) struct GetCacheSettings;

pub(crate) async fn handle<R: Sources, T: Transfers, C: Cache>(
    context: &MediaContext<R, T, C>,
    _query: GetCacheSettings,
) -> Result<CacheSettings, MediaError> {
    context.cache.settings().await
}
