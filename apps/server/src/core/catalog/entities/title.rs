//! Defines catalog title metadata identified by media type and TMDB ID.

use super::{GenreData, SeasonData};
use crate::core::catalog::value_objects::CastData;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub(crate) struct TitleData {
    pub(crate) media_type: u32,
    pub(crate) tmdb_id: u32,
    pub(crate) title: String,
    pub(crate) overview: String,
    pub(crate) release_year: u32,
    pub(crate) poster_url: String,
    pub(crate) backdrop_url: String,
    pub(crate) vote_average: f64,
    pub(crate) genres: Vec<GenreData>,
    pub(crate) cast: Vec<CastData>,
    pub(crate) runtime_minutes: u32,
    pub(crate) seasons: Vec<SeasonData>,
    #[serde(default)]
    pub(crate) trailer_key: String,
}

impl TitleData {
    /// Requires the metadata used to identify and present a title in catalog results.
    pub(crate) fn has_catalog_metadata(&self) -> bool {
        self.tmdb_id > 0
            && matches!(self.media_type, 1 | 2)
            && !self.title.trim().is_empty()
            && !self.overview.trim().is_empty()
            && (1000..=9999).contains(&self.release_year)
            && !self.poster_url.trim().is_empty()
    }
}
