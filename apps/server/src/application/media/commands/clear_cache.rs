//! Clears unused cached files under command serialization and returns cache settings.

use crate::application::media::queries::get_cache_settings::CacheSettings;
use crate::application::media::{Cache, MediaError, Sources, Transfers, context::MediaContext};

pub(crate) struct ClearCache;

pub(crate) async fn handle<R: Sources, T: Transfers, C: Cache>(
    context: &MediaContext<R, T, C>,
    _request: ClearCache,
) -> Result<CacheSettings, MediaError> {
    let command = context.command.lock().await;
    if context.transfers.in_use(None).await {
        return Err(MediaError::InUse);
    }
    context.transfers.shutdown().await;
    context.cache.clear().await?;
    drop(command);
    context.cache.settings().await
}
