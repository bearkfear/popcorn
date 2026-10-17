//! User library state and pure progress, completion and resume policies.

use crate::core::history::WatchStatus;
use crate::core::{
    catalog::TitleData,
    media::{Content, Coordinates, MediaKind},
};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub(crate) struct WatchEntry {
    pub(crate) content: Content,
    pub(crate) title: TitleData,
    pub(crate) status: WatchStatus,
    pub(crate) position: f64,
    pub(crate) duration: f64,
    pub(crate) updated_at: f64,
    pub(crate) source_id: Option<String>,
    pub(crate) file_index: Option<u32>,
    pub(crate) audio_stream_index: Option<u32>,
    pub(crate) quality: i32,
}

impl WatchEntry {
    pub(crate) fn key(&self) -> String {
        let kind = match self.content.kind() {
            MediaKind::Movie => 1,
            MediaKind::Tv => 2,
        };
        let coordinates = match self.content.coordinates() {
            Coordinates::Title => ":".to_owned(),
            Coordinates::Episode { season, episode } => format!("{season}:{episode}"),
        };
        format!("{kind}:{}:{coordinates}", self.content.tmdb_id())
    }

    pub(crate) fn validate(&self) -> bool {
        let kind = match self.content.kind() {
            MediaKind::Movie => 1,
            MediaKind::Tv => 2,
        };
        self.content.tmdb_id() > 0
            && self.title.tmdb_id == self.content.tmdb_id()
            && self.title.media_type == kind
            && !self.title.title.trim().is_empty()
            && self.position.is_finite()
            && self.position >= 0.0
            && self.duration.is_finite()
            && self.duration >= 0.0
            && self.updated_at.is_finite()
            && self.updated_at >= 0.0
            && (1..=3).contains(&self.quality)
    }

    pub(crate) fn resume_seconds(&self) -> f64 {
        if self.status == WatchStatus::Watching && self.position >= 5.0 {
            self.position
        } else {
            0.0
        }
    }

    pub(crate) fn progress(mut self, old: Option<&Self>, ended: bool) -> Option<Self> {
        if !self.validate() || self.duration <= 0.0 {
            return None;
        }
        if !ended && self.position < 1.0 && old.is_some_and(|entry| entry.position > 5.0) {
            return None;
        }
        self.position = self.position.min(self.duration);
        self.status = if ended || self.position / self.duration >= 0.95 {
            WatchStatus::Watched
        } else {
            WatchStatus::Watching
        };
        Some(self)
    }
}

#[cfg(test)]
#[path = "watch_entry_tests.rs"]
mod tests;
