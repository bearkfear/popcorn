//! Defines the playback states exposed by media status projections.

#[derive(Debug, Clone, Copy)]
pub(crate) enum PlaybackState {
    Preparing,
    Ready,
    Failed,
    Paused,
}
