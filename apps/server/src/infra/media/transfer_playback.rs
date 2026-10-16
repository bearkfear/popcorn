//! Projects transfer progress and asynchronous media preparation into playback state.

use librqbit::TorrentStatsState;
use uuid::Uuid;

use crate::{
    application::media::MediaError,
    core::media::{Playback, PlaybackState, mime_type},
};

use super::{TorrentEngine, preparation::Preparation, transfers::ActivePlayback};

impl TorrentEngine {
    pub(super) async fn snapshot(&self, id: Uuid) -> Result<Playback, MediaError> {
        let playbacks = self.playbacks.lock().await;
        let active = playbacks.get(&id).ok_or(MediaError::NotFound)?;
        let mut playback = transfer_snapshot(id, active);
        match &*active.processing.state.borrow() {
            Preparation::Preparing => playback.state = PlaybackState::Preparing,
            Preparation::Failed(message) => {
                playback.state = PlaybackState::Failed;
                playback.error = message;
            }
            Preparation::Ready(prepared) => {
                let direct = prepared.plan.direct;
                let path = if direct { "" } else { "/stream" };
                playback.media_url = format!(
                    "http://{}/media/{id}{path}?token={}",
                    self.address, active.credential
                );
                playback.duration_seconds = prepared.inspected.info.duration;
                playback.delivery = if direct { "direct" } else { "mse" };
                playback.conversion = prepared.plan.description();
                playback.stream_type = prepared.stream_type();
                playback.mime_type = "video/mp4";
                playback
                    .audio_tracks
                    .clone_from(&prepared.inspected.audio_tracks);
                playback.audio_stream_index = prepared.inspected.audio_index;
            }
        }
        drop(playbacks);
        Ok(playback)
    }
}

fn transfer_snapshot(id: Uuid, active: &ActivePlayback) -> Playback {
    let transfer_stats = active.handle.stats();
    let state = match transfer_stats.state {
        TorrentStatsState::Initializing { paused: true } | TorrentStatsState::Paused => {
            PlaybackState::Paused
        }
        TorrentStatsState::Initializing { paused: false } => PlaybackState::Preparing,
        TorrentStatsState::Live => PlaybackState::Ready,
        TorrentStatsState::Error => PlaybackState::Failed,
    };
    let (download_bytes_per_second, peers) = transfer_stats.live.as_ref().map_or((0, 0), |live| {
        (
            live.download_speed.as_bytes(),
            live.snapshot.peer_stats.live,
        )
    });
    Playback {
        id: id.to_string(),
        state,
        media_url: String::new(),
        size_bytes: active.size,
        mime_type: mime_type(&active.file_name),
        downloaded_bytes: transfer_stats.progress_bytes,
        total_bytes: transfer_stats.total_bytes,
        download_bytes_per_second,
        peers,
        duration_seconds: 0.0,
        delivery: "",
        conversion: "",
        stream_type: "",
        error: "",
        timestamp_offset_seconds: -3600.0,
        audio_tracks: Vec::new(),
        audio_stream_index: None,
    }
}
