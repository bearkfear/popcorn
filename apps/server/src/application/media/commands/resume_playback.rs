//! Resumes a playback under command serialization and returns its updated status.

use crate::application::media::queries::get_playback::Playback;
use crate::application::media::{Cache, MediaError, Sources, Transfers, context::MediaContext};
use uuid::Uuid;

pub(crate) struct ResumePlayback {
    pub(crate) id: Uuid,
}

pub(crate) async fn handle<R: Sources, T: Transfers, C: Cache>(
    context: &MediaContext<R, T, C>,
    request: ResumePlayback,
) -> Result<Playback, MediaError> {
    let command = context.command.lock().await;
    context.transfers.resume(request.id).await?;
    drop(command);
    context.transfers.playback(request.id).await
}
