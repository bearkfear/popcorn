//! Starts an idempotent playback after validating its file and available cache quota.

use crate::application::media::{Cache, MediaError, Sources, Transfers, context::MediaContext};
use crate::core::media::{Playback, profile::Quality};

pub(crate) struct StartPlayback {
    pub(crate) source_id: String,
    pub(crate) file_index: u32,
    pub(crate) idempotency_key: String,
    pub(crate) quality: Quality,
    pub(crate) audio_stream_index: Option<u32>,
}

pub(crate) async fn handle<R: Sources, T: Transfers, C: Cache>(
    context: &MediaContext<R, T, C>,
    request: StartPlayback,
) -> Result<Playback, MediaError> {
    if request.idempotency_key.is_empty() || request.idempotency_key.len() > 128 {
        return Err(MediaError::Invalid);
    }
    if let Some(id) = context.transfers.previous(&request.idempotency_key).await {
        return context.transfers.playback(id).await;
    }
    let file = context
        .sources
        .playback_file(&request.source_id, request.file_index)
        .await?;
    if file.size == 0 || !crate::core::media::is_media(&file.name) {
        return Err(MediaError::Invalid);
    }
    let command = context.command.lock().await;
    if file.size > context.cache.limit().await? {
        return Err(MediaError::Capacity);
    }
    let prepared = context.transfers.prepare(&file, request.file_index).await?;
    if let Some(id) = context.transfers.previous(&request.idempotency_key).await {
        drop(command);
        return context.transfers.playback(id).await;
    }
    let id = context.transfers.activate(request, file, prepared).await?;
    drop(command);
    context.transfers.playback(id).await
}
