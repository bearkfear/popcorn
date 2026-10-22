//! Records HTTP outcomes using route classes and numeric query fields, never raw URIs or headers.

use axum::{
    extract::Request,
    http::{Uri, header},
    middleware::Next,
    response::Response,
};
use serde_json::json;
use std::time::Instant;
use uuid::Uuid;

pub(super) async fn request(request: Request, next: Next) -> Response {
    let started = Instant::now();
    let request_id = Uuid::new_v4();
    let (route, playback_id) = classify(request.uri());
    let generation = query(request.uri(), "generation").and_then(|value| value.parse::<u64>().ok());
    let start = query(request.uri(), "start")
        .and_then(|value| value.parse::<f64>().ok())
        .filter(|value| value.is_finite());
    let range = request
        .headers()
        .get(header::RANGE)
        .and_then(|value| value.to_str().ok())
        .filter(|value| {
            value.len() <= 100
                && value
                    .bytes()
                    .all(|b| b.is_ascii_digit() || b"bytes=-, ".contains(&b))
        })
        .map(str::to_owned);
    let method = match request.method().as_str() {
        "GET" => "GET",
        "HEAD" => "HEAD",
        "POST" => "POST",
        "OPTIONS" => "OPTIONS",
        _ => "other",
    };
    popcorn_diagnostics::record(
        "http.request",
        json!({ "request_id": request_id, "route": route,
        "playback_id": playback_id, "stream_generation": generation, "start_seconds": start, "method": method, "range": range }),
    );
    let response = next.run(request).await;
    popcorn_diagnostics::record(
        "http.response",
        json!({ "request_id": request_id, "route": route,
            "playback_id": playback_id, "stream_generation": generation, "status": response.status().as_u16(),
            "headers_elapsed_ms": started.elapsed().as_millis(),
            "content_length": response.headers().get(header::CONTENT_LENGTH).and_then(|value| value.to_str().ok()).and_then(|value| value.parse::<u64>().ok()),
        }),
    );
    response
}

fn classify(uri: &Uri) -> (&'static str, Option<Uuid>) {
    if let Some(path) = uri.path().strip_prefix("/media/") {
        let id = path
            .split('/')
            .next()
            .and_then(|value| Uuid::parse_str(value).ok());
        return (
            if path.ends_with("/hls.m3u8") {
                "media.hls_playlist"
            } else if path.contains("/hls/") {
                "media.hls_segment"
            } else if path.ends_with("/stream") {
                "media.stream"
            } else {
                "media.source"
            },
            id,
        );
    }
    let method = uri.path().rsplit('/').next().unwrap_or_default();
    let name = [
        "StartPlayback",
        "GetPlayback",
        "StopPlayback",
        "PausePlayback",
        "ResumePlayback",
        "GetTitle",
        "SearchTitles",
        "BrowseTitles",
        "ListSources",
        "AddSource",
        "RemoveSource",
        "GetTmdbStatus",
        "ConfigureTmdb",
        "ClearTmdbConfiguration",
        "GetCacheSettings",
        "SetCacheLimit",
        "ClearCache",
        "ListGenres",
        "ListSeasons",
        "ListEpisodes",
        "health",
    ]
    .into_iter()
    .find(|name| *name == method)
    .unwrap_or("other");
    (name, None)
}

fn query<'a>(uri: &'a Uri, key: &str) -> Option<&'a str> {
    uri.query()?
        .split('&')
        .filter_map(|part| part.split_once('='))
        .find_map(|(name, value)| (name == key).then_some(value))
}
