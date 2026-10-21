//! Serves the packaged web interface and validates asset paths.

use super::browser::Browser;
use axum::{
    body::Body,
    extract::{Path as RoutePath, State},
    http::{HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};
use std::{path::Path, sync::Arc};

pub(super) async fn index(State(state): State<Arc<Browser>>) -> Result<Response, StatusCode> {
    file(&state.root, "index.html").await
}

pub(super) async fn asset(
    State(state): State<Arc<Browser>>,
    RoutePath(path): RoutePath<String>,
) -> Result<Response, StatusCode> {
    file(&state.root, &format!("assets/{path}")).await
}

async fn file(root: &Path, relative: &str) -> Result<Response, StatusCode> {
    let root = tokio::fs::canonicalize(root)
        .await
        .map_err(|_| StatusCode::NOT_FOUND)?;
    let path = tokio::fs::canonicalize(root.join(relative))
        .await
        .map_err(|_| StatusCode::NOT_FOUND)?;
    if !path.starts_with(&root) {
        return Err(StatusCode::FORBIDDEN);
    }
    let content_type = match path.extension().and_then(|e| e.to_str()).unwrap_or("") {
        "html" => "text/html; charset=utf-8",
        "js" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "ttf" => "font/ttf",
        "woff2" => "font/woff2",
        _ => "application/octet-stream",
    };
    let mut bytes = tokio::fs::read(path)
        .await
        .map_err(|_| StatusCode::NOT_FOUND)?;
    if relative == "index.html" {
        let html = String::from_utf8(bytes).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        bytes = html
            .replacen(
                "<head>",
                "<head><meta name=\"popcorn-server\" content=\"local\">",
                1,
            )
            .into_bytes();
    }
    let mut response = Body::from(bytes).into_response();
    let headers = response.headers_mut();
    headers.insert(header::CONTENT_TYPE, HeaderValue::from_static(content_type));
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    headers.insert(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
    headers.insert(
        header::REFERRER_POLICY,
        HeaderValue::from_static("no-referrer"),
    );
    headers.insert(header::CONTENT_SECURITY_POLICY, HeaderValue::from_static("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://image.tmdb.org; connect-src 'self'; media-src 'self' blob:; frame-src https://www.youtube-nocookie.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"));
    Ok(response)
}
