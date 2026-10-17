//! Reads the current status and progress of a requested playback.

use crate::application::media::{Cache, MediaError, Sources, Transfers, context::MediaContext};
use crate::core::media::Playback;
use uuid::Uuid;

pub(crate) struct GetPlayback {
    pub(crate) id: Uuid,
}

pub(crate) async fn handle<R: Sources, T: Transfers, C: Cache>(
    context: &MediaContext<R, T, C>,
    query: GetPlayback,
) -> Result<Playback, MediaError> {
    context.transfers.playback(query.id).await
}
