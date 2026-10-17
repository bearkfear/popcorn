//! Protobuf mapping and delegation for source commands and queries.

use crate::application::media::commands::{add_source, remove_source};
use crate::application::media::queries::list_sources;
use std::sync::Arc;

use connectrpc::{Encodable, RequestContext, Response, ServiceRequest, ServiceResult};
use popcorn_proto::{
    catalog::popcorn::v1::SourceService,
    proto::popcorn::v1::{
        self as proto, AddSourceRequest, AddSourceResponse, ListSourcesRequest,
        ListSourcesResponse, RemoveSourceRequest, RemoveSourceResponse, add_source_request::Input,
    },
};

use crate::{
    application::media::{AddSource, Cache, MediaContext, MediaError, Sources, Transfers},
    core::media::{Content, Coordinates, MediaKind, Source, SourceInput},
};

use crate::application::media::{commands::RemoveSource, queries::ListSources};

use super::errors::{invalid, source_error};

#[derive(Debug)]
pub(super) struct MediaRpc<R, T, C> {
    pub(super) context: Arc<MediaContext<R, T, C>>,
}

impl<R, T, C> MediaRpc<R, T, C> {
    pub(super) const fn new(context: Arc<MediaContext<R, T, C>>) -> Self {
        Self { context }
    }
}

impl<R: Sources + 'static, T: Transfers + 'static, C: Cache + 'static> SourceService
    for MediaRpc<R, T, C>
{
    async fn add_source<'a>(
        &'a self,
        _context: RequestContext,
        request: ServiceRequest<'_, AddSourceRequest>,
    ) -> ServiceResult<impl Encodable<AddSourceResponse> + Send + use<'a, R, T, C>> {
        let request = request.to_owned_message();
        let content = request
            .content
            .as_option()
            .ok_or_else(|| invalid("content is required"))?;
        let input = match request
            .input
            .ok_or_else(|| invalid("magnet or torrent file is required"))?
        {
            Input::Magnet(magnet) => SourceInput::Magnet(magnet),
            Input::TorrentFile(bytes) => SourceInput::TorrentFile(bytes),
        };
        let content = decode_content(content).map_err(source_error)?;
        let source = add_source::handle(self.context.as_ref(), AddSource { content, input })
            .await
            .map_err(source_error)?;
        Response::ok(AddSourceResponse {
            source: encode_source(source).into(),
            ..Default::default()
        })
    }

    async fn list_sources<'a>(
        &'a self,
        _context: RequestContext,
        request: ServiceRequest<'_, ListSourcesRequest>,
    ) -> ServiceResult<impl Encodable<ListSourcesResponse> + Send + use<'a, R, T, C>> {
        let request = request.to_owned_message();
        let content = request
            .content
            .as_option()
            .ok_or_else(|| invalid("content is required"))?;
        let content = decode_content(content).map_err(source_error)?;
        let sources =
            list_sources::handle(self.context.as_ref(), ListSources { content: &content })
                .await
                .map_err(source_error)?;
        Response::ok(ListSourcesResponse {
            sources: sources.into_iter().map(encode_source).collect(),
            ..Default::default()
        })
    }

    async fn remove_source<'a>(
        &'a self,
        _context: RequestContext,
        request: ServiceRequest<'_, RemoveSourceRequest>,
    ) -> ServiceResult<impl Encodable<RemoveSourceResponse> + Send + use<'a, R, T, C>> {
        if request.source_id.is_empty() {
            return Err(invalid("source ID is required"));
        }
        remove_source::handle(
            self.context.as_ref(),
            RemoveSource {
                source_id: request.source_id,
            },
        )
        .await
        .map_err(source_error)?;
        Response::ok(RemoveSourceResponse::default())
    }
}

pub(super) fn decode_content(value: &proto::ContentRef) -> Result<Content, MediaError> {
    let kind = match value.media_type.to_i32() {
        1 => MediaKind::Movie,
        2 => MediaKind::Tv,
        _ => return Err(MediaError::Invalid),
    };
    let coordinates = match (value.season_number, value.episode_number) {
        (None, None) => Coordinates::Title,
        (Some(season), Some(episode)) => Coordinates::Episode { season, episode },
        (None, Some(_)) | (Some(_), None) => return Err(MediaError::Invalid),
    };
    Ok(Content::new(kind, value.tmdb_id, coordinates)?)
}

fn encode_source(value: Source) -> proto::Source {
    let recommended_file_index = crate::core::media::rules::selection::recommend(&value.files);
    let media_type = match value.content.kind() {
        MediaKind::Movie => proto::MediaType::Movie,
        MediaKind::Tv => proto::MediaType::Tv,
    };
    let (season_number, episode_number) = match value.content.coordinates() {
        Coordinates::Title => (None, None),
        Coordinates::Episode { season, episode } => (Some(season), Some(episode)),
    };
    let content = proto::ContentRef {
        media_type: media_type.into(),
        tmdb_id: value.content.tmdb_id(),
        season_number,
        episode_number,
        ..Default::default()
    };
    proto::Source {
        recommended_file_index,
        source_id: value.id,
        content: content.into(),
        state: proto::SourceState::Ready.into(),
        files: value
            .files
            .into_iter()
            .map(|file| proto::SourceFile {
                file_index: file.file_index,
                name: file.name,
                size_bytes: file.size_bytes,
                likely_media: file.likely_media,
                ..Default::default()
            })
            .collect(),
        ..Default::default()
    }
}
