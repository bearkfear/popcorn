//! Stops a playback under command serialization.

use crate::application::media::{Cache, MediaError, Sources, Transfers, context::MediaContext};
use uuid::Uuid;

pub(crate) struct StopPlayback {
    pub(crate) id: Uuid,
}

pub(crate) async fn handle<R: Sources, T: Transfers, C: Cache>(
    context: &MediaContext<R, T, C>,
    request: StopPlayback,
) -> Result<(), MediaError> {
    let command = context.command.lock().await;
    context.transfers.stop(request.id).await?;
    drop(command);
    Ok(())
}
