//! Pauses a playback under command serialization and returns its updated status.

use crate::application::media::{Cache, MediaError, Sources, Transfers, context::MediaContext};
use crate::core::media::Playback;
use uuid::Uuid;

pub(crate) struct PausePlayback {
    pub(crate) id: Uuid,
}

pub(crate) async fn handle<R: Sources, T: Transfers, C: Cache>(
    context: &MediaContext<R, T, C>,
    request: PausePlayback,
) -> Result<Playback, MediaError> {
    let command = context.command.lock().await;
    context.transfers.pause(request.id).await?;
    drop(command);
    context.transfers.playback(request.id).await
}
