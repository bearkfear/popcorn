//! Serves authenticated native HLS playlists and independently seekable MPEG-TS segments.

use super::MediaState;
use crate::application::media::{
    AccessError, Cache, Sources, Transfers, commands::start_converted_stream, queries::hls_playlist,
};
use crate::core::media::rules::hls::{SEGMENT_SECONDS, segment};
use axum::{
    body::Body,
    extract::{Path, Query, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};
use serde::Deserialize;
use std::{fmt::Write as _, sync::Arc};
use tokio_util::io::ReaderStream;
use uuid::Uuid;

#[derive(Deserialize)]
pub(super) struct HlsQuery {
    token: String,
}

pub(super) async fn playlist<R: Sources + 'static, T: Transfers + 'static, C: Cache + 'static>(
    State(state): State<Arc<MediaState<R, T, C>>>,
    Path(id): Path<Uuid>,
    Query(query): Query<HlsQuery>,
    headers: HeaderMap,
) -> Result<Response, StatusCode> {
    state.access.validate_origin(&headers)?;
    let (duration, count) = hls_playlist::handle(state.context.as_ref(), id, &query.token)
        .await
        .map_err(status)?;
    let mut text = format!(
        "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-PLAYLIST-TYPE:VOD\n#EXT-X-TARGETDURATION:{SEGMENT_SECONDS:.0}\n#EXT-X-MEDIA-SEQUENCE:0\n#EXT-X-INDEPENDENT-SEGMENTS\n"
    );
    for index in 0..count {
        let range = segment(duration, index).ok_or(StatusCode::SERVICE_UNAVAILABLE)?;
        if index > 0 {
            // Each segment has a fresh encoder, with its own audio priming.
            text.push_str("#EXT-X-DISCONTINUITY\n");
        }
        write!(
            text,
            "#EXTINF:{:.6},\nhls/{index}?token={}\n",
            range.end - range.start,
            query.token
        )
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }
    text.push_str("#EXT-X-ENDLIST\n");
    Ok(response(
        text.into_response(),
        "application/vnd.apple.mpegurl",
    ))
}

pub(super) async fn media<R: Sources + 'static, T: Transfers + 'static, C: Cache + 'static>(
    State(state): State<Arc<MediaState<R, T, C>>>,
    Path((id, index)): Path<(Uuid, u32)>,
    Query(query): Query<HlsQuery>,
    headers: HeaderMap,
) -> Result<Response, StatusCode> {
    state.access.validate_origin(&headers)?;
    let access = start_converted_stream::segment(state.context.as_ref(), id, &query.token, index)
        .await
        .map_err(status)?;
    Ok(response(
        Body::from_stream(ReaderStream::new(access.reader)).into_response(),
        "video/mp2t",
    ))
}

fn response(mut response: Response, content_type: &'static str) -> Response {
    let headers = response.headers_mut();
    headers.insert(header::CONTENT_TYPE, HeaderValue::from_static(content_type));
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    headers.insert(header::VARY, HeaderValue::from_static("Origin"));
    response
}

const fn status(error: AccessError) -> StatusCode {
    match error {
        AccessError::Gone => StatusCode::GONE,
        AccessError::Forbidden => StatusCode::FORBIDDEN,
        AccessError::Unavailable => StatusCode::SERVICE_UNAVAILABLE,
        AccessError::InvalidPosition => StatusCode::BAD_REQUEST,
    }
}
