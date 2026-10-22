//! Authorizes a native playlist and reads its complete, seekable timeline.

use crate::application::media::{AccessError, Cache, MediaContext, Sources, Transfers};
use crate::core::media::rules::hls::segment_count;
use uuid::Uuid;

pub(crate) async fn handle<R: Sources, T: Transfers, C: Cache>(
    context: &MediaContext<R, T, C>,
    id: Uuid,
    credential: &str,
) -> Result<(f64, u32), AccessError> {
    // The credential must be checked before returning any playback metadata.
    drop(context.transfers.open(id, credential).await?);
    let playback = context
        .transfers
        .playback(id)
        .await
        .map_err(|_| AccessError::Gone)?;
    let count = segment_count(playback.duration_seconds).ok_or(AccessError::Unavailable)?;
    Ok((playback.duration_seconds, count))
}
