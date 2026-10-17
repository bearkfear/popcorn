//! Describes the identity, language and codec attributes of a selectable playback audio track.

#[derive(Debug, Clone)]
pub(crate) struct PlaybackAudioTrack {
    pub(crate) stream_index: u32,
    pub(crate) language: String,
    pub(crate) title: String,
    pub(crate) channels: u32,
    pub(crate) codec: String,
    pub(crate) is_default: bool,
}
