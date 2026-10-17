//! Owns media ports and the shared mutex for conflicting playback and cache commands.

use tokio::sync::Mutex;

#[derive(Debug)]
pub(crate) struct MediaContext<R, T, C> {
    pub(super) sources: R,
    pub(super) transfers: T,
    pub(super) cache: C,
    pub(super) command: Mutex<()>,
}

impl<R, T, C> MediaContext<R, T, C> {
    pub(crate) fn new(sources: R, transfers: T, cache: C) -> Self {
        Self {
            sources,
            transfers,
            cache,
            command: Mutex::new(()),
        }
    }
}
