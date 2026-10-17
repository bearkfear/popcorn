//! Validates and persists the cache quota, evicting unused files when necessary.

use crate::application::media::queries::get_cache_settings::CacheSettings;
use crate::application::media::{Cache, MediaError, Sources, Transfers, context::MediaContext};
use crate::core::media::validate_cache_limit;

pub(crate) struct SetCacheLimit {
    pub(crate) bytes: u64,
}

pub(crate) async fn handle<R: Sources, T: Transfers, C: Cache>(
    context: &MediaContext<R, T, C>,
    request: SetCacheLimit,
) -> Result<CacheSettings, MediaError> {
    let bytes = request.bytes;
    validate_cache_limit(bytes)?;
    let command = context.command.lock().await;
    if context.cache.settings().await?.used_bytes > bytes {
        if context.transfers.in_use(None).await {
            return Err(MediaError::InUse);
        }
        // Release paused torrent handles before deleting their cached files.
        context.transfers.shutdown().await;
        context.cache.trim(bytes).await?;
    }
    context.cache.set_limit(bytes).await?;
    let settings = context.cache.settings().await?;
    drop(command);
    Ok(settings)
}
