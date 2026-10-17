//! Defines season metadata identified by its number within the owning television series.

use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub(crate) struct SeasonData {
    pub(crate) season_number: u32,
    pub(crate) name: String,
    pub(crate) overview: String,
    pub(crate) poster_url: String,
    pub(crate) episode_count: u32,
}
