//! Projection of torrent transfer statistics into domain playback snapshots.

use librqbit::TorrentStatsState;
use uuid::Uuid;

use crate::{
    application::media::MediaError,
    core::media::{Playback, PlaybackState, mime_type},
};

use super::TorrentEngine;

impl TorrentEngine {
    pub(super) async fn snapshot(&self, id: Uuid) -> Result<Playback, MediaError> {
        let (handle, credential, file_name, size) = {
            let playbacks = self.playbacks.lock().await;
            let active = playbacks.get(&id).ok_or(MediaError::NotFound)?;
            let values = (
                active.handle.clone(),
                active.credential.clone(),
                active.file_name.clone(),
                active.size,
            );
            drop(playbacks);
            values
        };
        let transfer_stats = handle.stats();
        let state = match transfer_stats.state {
            TorrentStatsState::Initializing { paused: true } | TorrentStatsState::Paused => {
                PlaybackState::Paused
            }
            TorrentStatsState::Initializing { paused: false } => PlaybackState::Preparing,
            TorrentStatsState::Live => PlaybackState::Ready,
            TorrentStatsState::Error => PlaybackState::Failed,
        };
        let (download_bytes_per_second, peers) =
            transfer_stats.live.as_ref().map_or((0, 0), |live| {
                (
                    live.download_speed.as_bytes(),
                    live.snapshot.peer_stats.live,
                )
            });
        Ok(Playback {
            id: id.to_string(),
            state,
            media_url: format!("http://{}/media/{id}?token={credential}", self.address),
            size_bytes: size,
            mime_type: mime_type(&file_name),
            downloaded_bytes: transfer_stats.progress_bytes,
            total_bytes: transfer_stats.total_bytes,
            download_bytes_per_second,
            peers,
        })
    }
}
