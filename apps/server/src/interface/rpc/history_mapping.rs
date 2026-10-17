//! Converts history wire messages to validated domain inputs and server-derived resume outputs.

use super::{errors::invalid, source::decode_content};
use crate::core::{
    catalog::{CastData, GenreData, SeasonData, TitleData},
    history::{WatchEntry, WatchStatus},
};
use connectrpc::ConnectError;
use popcorn_proto::proto::popcorn::v1 as proto;

pub(super) fn status(value: &str) -> Result<WatchStatus, ConnectError> {
    match value {
        "want" => Ok(WatchStatus::Want),
        "watched" => Ok(WatchStatus::Watched),
        "watching" => Ok(WatchStatus::Watching),
        _ => Err(invalid("invalid watch status")),
    }
}

pub(super) fn decode(value: proto::WatchEntry) -> Result<WatchEntry, ConnectError> {
    let content = value
        .content
        .as_option()
        .ok_or_else(|| invalid("content is required"))?;
    let title = value
        .title
        .as_option()
        .ok_or_else(|| invalid("title is required"))?;
    let identity = title
        .content
        .as_option()
        .ok_or_else(|| invalid("title identity is required"))?;
    let entry = WatchEntry {
        content: decode_content(content).map_err(|_| invalid("invalid content"))?,
        title: decode_title(title, identity),
        status: status(&value.status)?,
        position: value.position,
        duration: value.duration,
        updated_at: value.updated_at,
        source_id: value.source_id,
        file_index: value.file_index,
        audio_stream_index: value.audio_stream_index,
        quality: value.quality.to_i32(),
    };
    if !entry.validate() {
        return Err(invalid("invalid history entry"));
    }
    Ok(entry)
}

fn decode_title(title: &proto::Title, identity: &proto::ContentRef) -> TitleData {
    TitleData {
        media_type: u32::try_from(identity.media_type.to_i32()).unwrap_or_default(),
        tmdb_id: identity.tmdb_id,
        title: title.title.clone(),
        overview: title.overview.clone(),
        release_year: title.release_year,
        poster_url: title.poster_url.clone(),
        backdrop_url: title.backdrop_url.clone(),
        vote_average: title.vote_average,
        runtime_minutes: title.runtime_minutes,
        trailer_key: title.trailer_key.clone(),
        genres: title
            .genres
            .iter()
            .map(|g| GenreData {
                id: g.id,
                name: g.name.clone(),
            })
            .collect(),
        cast: title
            .cast
            .iter()
            .map(|c| CastData {
                name: c.name.clone(),
                character: c.character.clone(),
                profile_url: c.profile_url.clone(),
            })
            .collect(),
        seasons: title
            .seasons
            .iter()
            .map(|s| SeasonData {
                season_number: s.season_number,
                name: s.name.clone(),
                overview: s.overview.clone(),
                poster_url: s.poster_url.clone(),
                episode_count: s.episode_count,
            })
            .collect(),
    }
}

pub(super) fn encode(value: WatchEntry) -> proto::WatchEntry {
    use crate::core::media::{Coordinates, MediaKind};
    let resume_seconds = value.resume_seconds();
    let (season_number, episode_number) = match value.content.coordinates() {
        Coordinates::Title => (None, None),
        Coordinates::Episode { season, episode } => (Some(season), Some(episode)),
    };
    proto::WatchEntry {
        content: proto::ContentRef {
            media_type: match value.content.kind() {
                MediaKind::Movie => 1,
                MediaKind::Tv => 2,
            }
            .into(),
            tmdb_id: value.content.tmdb_id(),
            season_number,
            episode_number,
            ..Default::default()
        }
        .into(),
        title: proto::Title::from(value.title).into(),
        status: match value.status {
            WatchStatus::Watching => "watching",
            WatchStatus::Watched => "watched",
            WatchStatus::Want => "want",
        }
        .into(),
        position: value.position,
        duration: value.duration,
        updated_at: value.updated_at,
        source_id: value.source_id,
        file_index: value.file_index,
        audio_stream_index: value.audio_stream_index,
        quality: value.quality.into(),
        resume_seconds,
        ..Default::default()
    }
}
