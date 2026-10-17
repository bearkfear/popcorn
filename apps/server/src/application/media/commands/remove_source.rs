//! Removes a source after checking whether a playback is using it.

use crate::application::media::{Cache, MediaError, Sources, Transfers, context::MediaContext};

pub(crate) struct RemoveSource<'a> {
    pub(crate) source_id: &'a str,
}

pub(crate) async fn handle<R: Sources, T: Transfers, C: Cache>(
    context: &MediaContext<R, T, C>,
    request: RemoveSource<'_>,
) -> Result<(), MediaError> {
    if context.transfers.in_use(Some(request.source_id)).await {
        return Err(MediaError::InUse);
    }
    context.sources.remove(request.source_id).await
}
