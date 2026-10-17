//! Defines playback lifecycle states, audio tracks and playback status projections.

#[derive(Debug, Clone, Copy)]
pub(crate) enum PlaybackState {
    Preparing,
    Ready,
    Failed,
    Paused,
}

#[derive(Debug, Clone)]
pub(crate) struct PlaybackAudioTrack {
    pub(crate) stream_index: u32,
    pub(crate) language: String,
    pub(crate) title: String,
    pub(crate) channels: u32,
    pub(crate) codec: String,
    pub(crate) is_default: bool,
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
