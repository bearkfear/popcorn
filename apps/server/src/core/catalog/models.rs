//! Catalog metadata and snapshot result entities.
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub(crate) struct ConnectionStatus {
    pub(crate) configured: bool,
    pub(crate) remembered: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub(crate) struct Cached<T> {
    pub(crate) data: T,
    pub(crate) stale: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub(crate) struct TitlePage {
    pub(crate) titles: Vec<TitleData>,
    pub(crate) page: u32,
    pub(crate) total_pages: u32,
}

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
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub(crate) struct GenreData {
    pub(crate) id: u32,
    pub(crate) name: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub(crate) struct CastData {
    pub(crate) name: String,
    pub(crate) character: String,
    pub(crate) profile_url: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub(crate) struct SeasonData {
    pub(crate) season_number: u32,
    pub(crate) name: String,
    pub(crate) overview: String,
    pub(crate) poster_url: String,
    pub(crate) episode_count: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub(crate) struct EpisodeData {
    pub(crate) episode_number: u32,
    pub(crate) name: String,
    pub(crate) overview: String,
    pub(crate) still_url: String,
    pub(crate) air_date: String,
    pub(crate) runtime_minutes: u32,
}
