//! Delivers time-addressed fMP4 without pretending its bytes match the source file.

use axum::{
    body::Body,
    extract::{Path, Query, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};
use serde::Deserialize;
use tokio_util::io::ReaderStream;
use uuid::Uuid;

use crate::application::media::{AccessError, Cache, Sources, Transfers};

use super::MediaState;

#[derive(Deserialize)]
pub(super) struct StreamQuery {
    token: String,
    #[serde(default)]
    start: f64,
    generation: u64,
}

pub(super) async fn media<R: Sources + 'static, T: Transfers + 'static, C: Cache + 'static>(
    State(state): State<std::sync::Arc<MediaState<R, T, C>>>,
    Path(id): Path<Uuid>,
    Query(query): Query<StreamQuery>,
    headers: HeaderMap,
) -> Result<Response, StatusCode> {
    if headers
        .get(header::ORIGIN)
        .is_some_and(|origin| Some(origin.as_bytes()) != state.origin.as_deref().map(str::as_bytes))
    {
        return Err(StatusCode::FORBIDDEN);
    }
    let access = state
        .service
        .converted_media(id, &query.token, query.start, query.generation)
        .await
        .map_err(|error| match error {
            AccessError::Gone => StatusCode::GONE,
            AccessError::Forbidden => StatusCode::FORBIDDEN,
            AccessError::Unavailable => StatusCode::SERVICE_UNAVAILABLE,
            AccessError::InvalidPosition => StatusCode::BAD_REQUEST,
        })?;
    let mut response = Body::from_stream(ReaderStream::new(access.reader)).into_response();
    let response_headers = response.headers_mut();
    response_headers.insert(header::CONTENT_TYPE, HeaderValue::from_static("video/mp4"));
    response_headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    response_headers.insert(header::ACCEPT_RANGES, HeaderValue::from_static("none"));
    response_headers.insert(header::VARY, HeaderValue::from_static("Origin"));
    if let Some(origin) = headers.get(header::ORIGIN) {
        response_headers.insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, origin.clone());
    }
    Ok(response)
}
