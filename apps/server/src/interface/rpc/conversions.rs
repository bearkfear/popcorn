//! Map catalog domain entities into protobuf responses.
use popcorn_proto::proto::popcorn::v1::{CastMember, ContentRef, Genre, Season, Title, TmdbStatus};

use crate::core::catalog as tmdb;

impl From<tmdb::GenreData> for Genre {
    fn from(value: tmdb::GenreData) -> Self {
        Self {
            id: value.id,
            name: value.name,
            ..Default::default()
        }
    }
}

impl From<tmdb::SeasonData> for Season {
    fn from(value: tmdb::SeasonData) -> Self {
        Self {
            season_number: value.season_number,
            name: value.name,
            overview: value.overview,
            poster_url: value.poster_url,
            episode_count: value.episode_count,
            ..Default::default()
        }
    }
}

impl From<tmdb::TitleData> for Title {
    fn from(value: tmdb::TitleData) -> Self {
        Self {
            content: ContentRef {
                media_type: i32::try_from(value.media_type).unwrap_or_default().into(),
                tmdb_id: value.tmdb_id,
                ..Default::default()
            }
            .into(),
            title: value.title,
            overview: value.overview,
            release_year: value.release_year,
            poster_url: value.poster_url,
            backdrop_url: value.backdrop_url,
            vote_average: value.vote_average,
            genres: value.genres.into_iter().map(Genre::from).collect(),
            cast: value
                .cast
                .into_iter()
                .map(|person| CastMember {
                    name: person.name,
                    character: person.character,
                    profile_url: person.profile_url,
                    ..Default::default()
                })
                .collect(),
            runtime_minutes: value.runtime_minutes,
            seasons: value.seasons.into_iter().map(Season::from).collect(),
            trailer_key: value.trailer_key,
            ..Default::default()
        }
    }
}

impl From<tmdb::ConnectionStatus> for TmdbStatus {
    fn from(value: tmdb::ConnectionStatus) -> Self {
        Self {
            configured: value.configured,
            remembered: value.remembered,
            ..Default::default()
        }
    }
}

pub(super) fn episode(
    value: tmdb::EpisodeData,
    series: u32,
    season: u32,
) -> popcorn_proto::proto::popcorn::v1::Episode {
    popcorn_proto::proto::popcorn::v1::Episode {
        content: ContentRef {
            media_type: 2.into(),
            tmdb_id: series,
            season_number: Some(season),
            episode_number: Some(value.episode_number),
            ..Default::default()
        }
        .into(),
        name: value.name,
        overview: value.overview,
        still_url: value.still_url,
        air_date: value.air_date,
        runtime_minutes: value.runtime_minutes,
        ..Default::default()
    }
}
