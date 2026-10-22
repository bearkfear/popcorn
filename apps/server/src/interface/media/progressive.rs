//! HTTP byte-range delivery through the application media reader contract.

use super::{converted, hls};
use crate::application::media::queries::OpenMedia;
use crate::application::media::queries::open_media;
use std::sync::Arc;

use axum::{
    Router,
    body::Body,
    extract::{Path, Query, State},
    http::{HeaderMap, HeaderValue, Method, StatusCode, header},
    response::{IntoResponse, Response},
    routing::get,
};
use serde::Deserialize;
use tokio::io::{AsyncReadExt as _, AsyncSeekExt as _};
use tokio_util::io::ReaderStream;
use uuid::Uuid;

use crate::{
    application::media::{AccessError, Cache, MediaAccess, MediaContext, Sources, Transfers},
    core::media::{RangeError, parse_range},
};

pub(super) struct MediaState<R, T, C> {
    pub(super) context: Arc<MediaContext<R, T, C>>,
    pub(super) access: Arc<crate::interface::AccessPolicy>,
}

pub(crate) fn router<R: Sources + 'static, T: Transfers + 'static, C: Cache + 'static>(
    context: Arc<MediaContext<R, T, C>>,
    access: Arc<crate::interface::AccessPolicy>,
) -> Router {
    Router::new()
        .route("/media/{playback_id}", get(media::<R, T, C>))
        .route(
            "/media/{playback_id}/stream",
            get(converted::media::<R, T, C>),
        )
        .route(
            "/media/{playback_id}/hls.m3u8",
            get(hls::playlist::<R, T, C>),
        )
        .route(
            "/media/{playback_id}/hls/{index}",
            get(hls::media::<R, T, C>),
        )
        .with_state(Arc::new(MediaState { context, access }))
}

#[derive(Deserialize)]
struct MediaQuery {
    token: String,
}

async fn media<R: Sources + 'static, T: Transfers + 'static, C: Cache + 'static>(
    State(state): State<Arc<MediaState<R, T, C>>>,
    Path(id): Path<Uuid>,
    Query(query): Query<MediaQuery>,
    method: Method,
    headers: HeaderMap,
) -> Response {
    match media_response(&state, id, &query.token, &method, &headers).await {
        Ok(response) => response,
        Err(MediaFailure::Status(status)) => status.into_response(),
        Err(MediaFailure::RangeNotSatisfiable(size)) => {
            let mut response = StatusCode::RANGE_NOT_SATISFIABLE.into_response();
            if let Ok(value) = HeaderValue::from_str(&format!("bytes */{size}")) {
                response.headers_mut().insert(header::CONTENT_RANGE, value);
            }
            response
        }
    }
}

enum MediaFailure {
    Status(StatusCode),
    RangeNotSatisfiable(u64),
}

impl From<StatusCode> for MediaFailure {
    fn from(status: StatusCode) -> Self {
        Self::Status(status)
    }
}

async fn media_response<R: Sources + 'static, T: Transfers + 'static, C: Cache + 'static>(
    state: &MediaState<R, T, C>,
    id: Uuid,
    credential: &str,
    method: &Method,
    headers: &HeaderMap,
) -> Result<Response, MediaFailure> {
    if !matches!(*method, Method::GET | Method::HEAD) {
        return Err(StatusCode::METHOD_NOT_ALLOWED.into());
    }
    state.access.validate_origin(headers)?;
    let access = open_media::handle(state.context.as_ref(), OpenMedia { id, credential })
        .await
        .map_err(|error| match error {
            AccessError::Gone => StatusCode::GONE,
            AccessError::Forbidden => StatusCode::FORBIDDEN,
            AccessError::Unavailable => StatusCode::SERVICE_UNAVAILABLE,
            AccessError::InvalidPosition => StatusCode::BAD_REQUEST,
        })?;
    stream_response(access, method, headers).await
}

async fn stream_response(
    mut access: MediaAccess,
    method: &Method,
    headers: &HeaderMap,
) -> Result<Response, MediaFailure> {
    let value = headers
        .get(header::RANGE)
        .map(HeaderValue::to_str)
        .transpose()
        .map_err(|_| StatusCode::BAD_REQUEST)?;
    let range = parse_range(value, access.size).map_err(|error| match error {
        RangeError::Malformed => MediaFailure::Status(StatusCode::BAD_REQUEST),
        RangeError::Unsatisfiable => MediaFailure::RangeNotSatisfiable(access.size),
    })?;
    let (status, start, length, content_range) = match range {
        Some((start, end)) => (
            StatusCode::PARTIAL_CONTENT,
            start,
            end - start + 1,
            Some(format!("bytes {start}-{end}/{}", access.size)),
        ),
        None => (StatusCode::OK, 0, access.size, None),
    };
    access
        .reader
        .seek(std::io::SeekFrom::Start(start))
        .await
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    let mut response = if *method == Method::HEAD {
        Body::empty().into_response()
    } else {
        Body::from_stream(ReaderStream::new(access.reader.take(length))).into_response()
    };
    *response.status_mut() = status;
    response_headers(response.headers_mut(), length, access.mime_type)?;
    if let Some(value) = content_range {
        response.headers_mut().insert(
            header::CONTENT_RANGE,
            HeaderValue::from_str(&value).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?,
        );
    }
    if let Some(origin) = headers.get(header::ORIGIN).cloned() {
        response
            .headers_mut()
            .insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, origin);
    }
    Ok(response)
}

fn response_headers(
    headers: &mut HeaderMap,
    length: u64,
    mime_type: &'static str,
) -> Result<(), MediaFailure> {
    headers.insert(header::ACCEPT_RANGES, HeaderValue::from_static("bytes"));
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    headers.insert(
        header::CONTENT_LENGTH,
        HeaderValue::from_str(&length.to_string())
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?,
    );
    headers.insert(header::CONTENT_TYPE, HeaderValue::from_static(mime_type));
    Ok(())
}
