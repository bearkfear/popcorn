//! Releases playback tasks and the torrent session during backend shutdown.

use crate::application::media::{Cache, Sources, Transfers, context::MediaContext};

pub(crate) struct ShutdownMedia;

pub(crate) async fn handle<R: Sources, T: Transfers, C: Cache>(
    context: &MediaContext<R, T, C>,
    _command: ShutdownMedia,
) {
    context.transfers.shutdown().await;
}
