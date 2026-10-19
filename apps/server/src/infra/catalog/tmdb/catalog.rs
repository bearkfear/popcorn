//! Builds TMDB catalog requests and maps cached title, genre, season and episode responses.
use super::mapping::{RawEpisode, RawEpisodes, RawGenres, RawPage, RawTitle};
use super::{Cached, EpisodeData, GenreData, SeasonData, TitleData, TitlePage, Tmdb, TmdbError};
use chrono::{Duration, Utc};

pub(super) const SHORT_TTL: i64 = 3_600;
pub(super) const DETAIL_TTL: i64 = 86_400;

impl Tmdb {
    pub(crate) async fn list(
        &self,
        media_type: u32,
        category: &str,
        page: u32,
        genre_id: u32,
    ) -> Result<Cached<TitlePage>, TmdbError> {
        let kind = media_path(media_type)?;
        let mut params = vec![("page", page.to_string())];
        if media_type == 1 {
            params.push(("region", "BR".into()));
        }
        let path = if genre_id > 0 {
            params.extend([
                ("with_genres", genre_id.to_string()),
                ("include_adult", "false".into()),
            ]);
            match category {
                "popular" => params.push(("sort_by", "popularity.desc".into())),
                "top_rated" => params.extend([
                    ("sort_by", "vote_average.desc".into()),
                    ("vote_count.gte", "200".into()),
                ]),
                "upcoming" => {
                    let today = Utc::now().date_naive();
                    let until = today + Duration::days(if media_type == 1 { 30 } else { 7 });
                    let (from_key, until_key) = if media_type == 1 {
                        params.push(("with_release_type", "2|3".into()));
                        ("release_date.gte", "release_date.lte")
                    } else {
                        ("air_date.gte", "air_date.lte")
                    };
                    params.extend([
                        ("sort_by", "popularity.desc".into()),
                        (from_key, today.to_string()),
                        (until_key, until.to_string()),
                    ]);
                }
                _ => return Err(TmdbError::Configuration),
            }
            format!("discover/{kind}")
        } else {
            let category = match (category, media_type) {
                ("upcoming", 2) => "on_the_air",
                ("popular" | "upcoming" | "top_rated", _) => category,
                _ => return Err(TmdbError::Configuration),
            };
            format!("{kind}/{category}")
        };
        self.cached::<RawPage, _, _>(&path, params, SHORT_TTL, |raw| raw.into_page(media_type))
            .await
    }

    pub(crate) async fn search(
        &self,
        media_type: u32,
        query: &str,
        page: u32,
    ) -> Result<Cached<TitlePage>, TmdbError> {
        let path = format!("search/{}", media_path(media_type)?);
        self.cached::<RawPage, _, _>(
            &path,
            vec![
                ("query", query.into()),
                ("page", page.to_string()),
                ("include_adult", "false".into()),
            ],
            SHORT_TTL,
            |raw| raw.into_page(media_type),
        )
        .await
    }

    pub(crate) async fn title(
        &self,
        media_type: u32,
        id: u32,
    ) -> Result<Cached<TitleData>, TmdbError> {
        let path = format!("{}/{id}", media_path(media_type)?);
        self.cached::<RawTitle, _, _>(
            &path,
            vec![("append_to_response", "credits,videos".into())],
            DETAIL_TTL,
            |raw| raw.into_title(media_type),
        )
        .await
    }

    pub(crate) async fn genres(
        &self,
        media_type: u32,
    ) -> Result<Cached<Vec<GenreData>>, TmdbError> {
        let path = format!("genre/{}/list", media_path(media_type)?);
        self.cached::<RawGenres, _, _>(&path, vec![], SHORT_TTL, |raw| raw.genres)
            .await
    }

    pub(crate) async fn seasons(
        &self,
        series_id: u32,
    ) -> Result<Cached<Vec<SeasonData>>, TmdbError> {
        let details = self.title(2, series_id).await?;
        Ok(Cached {
            data: details.data.seasons,
            stale: details.stale,
        })
    }

    pub(crate) async fn episodes(
        &self,
        series_id: u32,
        season: u32,
    ) -> Result<Cached<Vec<EpisodeData>>, TmdbError> {
        let path = format!("tv/{series_id}/season/{season}");
        self.cached::<RawEpisodes, _, _>(&path, vec![], DETAIL_TTL, |raw| {
            raw.episodes
                .into_iter()
                .map(RawEpisode::into_episode)
                .collect()
        })
        .await
    }
}

pub(super) const fn media_path(media_type: u32) -> Result<&'static str, TmdbError> {
    match media_type {
        1 => Ok("movie"),
        2 => Ok("tv"),
        _ => Err(TmdbError::Configuration),
    }
}
