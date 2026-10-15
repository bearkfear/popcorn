//! TMDB mapping adapter.
use serde::Deserialize;

use super::{CastData, EpisodeData, GenreData, SeasonData, TitleData, TitlePage, TmdbError};

pub(super) fn image(path: Option<&str>, size: &str) -> String {
    match path.and_then(|path| path.strip_prefix('/')) {
        Some(name)
            if !name.is_empty()
                && !name.starts_with('.')
                && name
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'_' | b'-' | b'.')) =>
        {
            format!("https://image.tmdb.org/t/p/{size}/{name}")
        }
        _ => String::new(),
    }
}

#[derive(Deserialize)]
pub(super) struct Configuration {
    images: ImageConfiguration,
}

#[derive(Deserialize)]
struct ImageConfiguration {
    secure_base_url: String,
    poster_sizes: Vec<String>,
    backdrop_sizes: Vec<String>,
    profile_sizes: Vec<String>,
}

impl Configuration {
    pub(super) fn validate(&self) -> Result<(), TmdbError> {
        if self.images.secure_base_url != "https://image.tmdb.org/t/p/"
            || !self.images.poster_sizes.iter().any(|s| s == "w500")
            || !self.images.backdrop_sizes.iter().any(|s| s == "w780")
            || !self.images.profile_sizes.iter().any(|s| s == "w185")
        {
            return Err(TmdbError::InvalidResponse);
        }
        Ok(())
    }
}

#[derive(Deserialize)]
pub(super) struct RawPage {
    results: Vec<RawTitle>,
    page: u32,
    total_pages: u32,
}

impl RawPage {
    pub(super) fn into_page(self, media_type: u32) -> TitlePage {
        TitlePage {
            titles: self
                .results
                .into_iter()
                .map(|title| title.into_title(media_type))
                .collect(),
            page: self.page,
            total_pages: self.total_pages.min(500),
        }
    }
}

#[derive(Deserialize)]
pub(super) struct RawTitle {
    id: u32,
    title: Option<String>,
    name: Option<String>,
    overview: Option<String>,
    release_date: Option<String>,
    first_air_date: Option<String>,
    poster_path: Option<String>,
    backdrop_path: Option<String>,
    vote_average: Option<f64>,
    genres: Option<Vec<GenreData>>,
    genre_ids: Option<Vec<u32>>,
    credits: Option<RawCredits>,
    runtime: Option<u32>,
    episode_run_time: Option<Vec<u32>>,
    seasons: Option<Vec<RawSeason>>,
}

#[derive(Deserialize)]
struct RawCredits {
    cast: Option<Vec<RawCast>>,
}

#[derive(Deserialize)]
struct RawCast {
    name: Option<String>,
    character: Option<String>,
    profile_path: Option<String>,
}

impl RawCredits {
    fn into_cast(self) -> Vec<CastData> {
        self.cast
            .unwrap_or_default()
            .into_iter()
            .take(12)
            .map(|cast| CastData {
                name: cast.name.unwrap_or_default(),
                character: cast.character.unwrap_or_default(),
                profile_url: image(cast.profile_path.as_deref(), "w185"),
            })
            .collect()
    }
}

impl RawTitle {
    pub(super) fn into_title(self, media_type: u32) -> TitleData {
        let (title, date) = if media_type == 1 {
            (self.title, self.release_date)
        } else {
            (self.name, self.first_air_date)
        };
        TitleData {
            media_type,
            tmdb_id: self.id,
            title: title.unwrap_or_default(),
            overview: self.overview.unwrap_or_default(),
            release_year: date
                .as_deref()
                .and_then(|d| d.get(..4))
                .and_then(|year| year.parse().ok())
                .unwrap_or_default(),
            poster_url: image(self.poster_path.as_deref(), "w500"),
            backdrop_url: image(self.backdrop_path.as_deref(), "w780"),
            vote_average: self.vote_average.unwrap_or_default(),
            genres: self.genres.unwrap_or_else(|| {
                self.genre_ids
                    .unwrap_or_default()
                    .into_iter()
                    .map(|id| GenreData {
                        id,
                        name: String::new(),
                    })
                    .collect()
            }),
            cast: self.credits.map(RawCredits::into_cast).unwrap_or_default(),
            runtime_minutes: self
                .runtime
                .or_else(|| {
                    self.episode_run_time
                        .and_then(|times| times.first().copied())
                })
                .unwrap_or_default(),
            seasons: self
                .seasons
                .unwrap_or_default()
                .into_iter()
                .map(RawSeason::into_season)
                .collect(),
        }
    }
}

#[derive(Deserialize)]
pub(super) struct RawGenres {
    pub(super) genres: Vec<GenreData>,
}

#[derive(Deserialize)]
struct RawSeason {
    season_number: u32,
    name: Option<String>,
    overview: Option<String>,
    poster_path: Option<String>,
    episode_count: Option<u32>,
}

impl RawSeason {
    fn into_season(self) -> SeasonData {
        SeasonData {
            season_number: self.season_number,
            name: self.name.unwrap_or_default(),
            overview: self.overview.unwrap_or_default(),
            poster_url: image(self.poster_path.as_deref(), "w500"),
            episode_count: self.episode_count.unwrap_or_default(),
        }
    }
}

#[derive(Deserialize)]
pub(super) struct RawEpisodes {
    pub(super) episodes: Vec<RawEpisode>,
}

#[derive(Deserialize)]
pub(super) struct RawEpisode {
    episode_number: u32,
    name: Option<String>,
    overview: Option<String>,
    still_path: Option<String>,
    air_date: Option<String>,
    runtime: Option<u32>,
}

impl RawEpisode {
    pub(super) fn into_episode(self) -> EpisodeData {
        EpisodeData {
            episode_number: self.episode_number,
            name: self.name.unwrap_or_default(),
            overview: self.overview.unwrap_or_default(),
            still_url: image(self.still_path.as_deref(), "w500"),
            air_date: self.air_date.unwrap_or_default(),
            runtime_minutes: self.runtime.unwrap_or_default(),
        }
    }
}
