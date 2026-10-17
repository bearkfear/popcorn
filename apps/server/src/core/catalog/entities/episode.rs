//! Defines episode metadata identified by its number within the owning season.

use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub(crate) struct EpisodeData {
    pub(crate) episode_number: u32,
    pub(crate) name: String,
    pub(crate) overview: String,
    pub(crate) still_url: String,
    pub(crate) air_date: String,
    pub(crate) runtime_minutes: u32,
}
