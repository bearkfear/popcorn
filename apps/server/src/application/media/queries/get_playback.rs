//! Reads the current status and progress of a requested playback.

use crate::application::media::{Cache, MediaError, Sources, Transfers, context::MediaContext};
use crate::core::media::{PlaybackAudioTrack, PlaybackState};
use uuid::Uuid;

pub(crate) struct GetPlayback {
    pub(crate) id: Uuid,
}

#[derive(Debug)]
pub(crate) struct Playback {
    pub(crate) id: String,
    pub(crate) state: PlaybackState,
    pub(crate) media_url: String,
    pub(crate) size_bytes: u64,
    pub(crate) mime_type: &'static str,
    pub(crate) downloaded_bytes: u64,
    pub(crate) total_bytes: u64,
    pub(crate) download_bytes_per_second: u64,
    pub(crate) peers: u32,
    pub(crate) duration_seconds: f64,
    pub(crate) delivery: &'static str,
    pub(crate) conversion: &'static str,
    pub(crate) stream_type: &'static str,
    pub(crate) error: &'static str,
    pub(crate) timestamp_offset_seconds: f64,
    pub(crate) audio_tracks: Vec<PlaybackAudioTrack>,
    pub(crate) audio_stream_index: Option<u32>,
    pub(crate) downloaded_ranges: Vec<std::ops::Range<u64>>,
}

pub(crate) async fn handle<R: Sources, T: Transfers, C: Cache>(
    context: &MediaContext<R, T, C>,
    query: GetPlayback,
) -> Result<Playback, MediaError> {
    context.transfers.playback(query.id).await
}
