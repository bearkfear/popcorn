//! Serves packaged web assets and exchanges a private launch ticket for a browser session.

#![expect(
    clippy::redundant_pub_crate,
    reason = "HTTP browser adapters are internal to the server"
)]

use crate::core::auth::SessionToken;
use axum::{
    Json, Router,
    body::Body,
    extract::{Path as RoutePath, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use serde::Deserialize;
use std::{
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};
use uuid::Uuid;

pub(crate) struct Browser {
    root: PathBuf,
    ticket: Mutex<Option<SessionToken>>,
    cookie: String,
}

impl std::fmt::Debug for Browser {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Browser")
            .field("root", &self.root)
            .finish_non_exhaustive()
    }
}

impl Browser {
    pub(crate) fn new(root: PathBuf, ticket: SessionToken) -> Self {
        Self {
            root,
            ticket: Mutex::new(Some(ticket)),
            cookie: format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple()),
        }
    }

    pub(crate) fn authorized(&self, headers: &HeaderMap) -> bool {
        use subtle::ConstantTimeEq;
        headers
            .get_all(header::COOKIE)
            .iter()
            .filter_map(|h| h.to_str().ok())
            .flat_map(|h| h.split(';'))
            .any(|c| {
                c.trim()
                    .strip_prefix("popcorn_session=")
                    .is_some_and(|v| bool::from(self.cookie.as_bytes().ct_eq(v.as_bytes())))
            })
    }
}

pub(crate) fn router(state: Arc<Browser>) -> Router {
    Router::new()
        .route("/", get(index))
        .route("/assets/{*path}", get(asset))
        .route("/browser/session", post(session))
        .route("/browser/launch", post(launch))
        .route(
            "/browser/diagnostic",
            post(super::browser_diagnostics::receive),
        )
        .with_state(state)
}

#[derive(Deserialize)]
struct Launch {
    ticket: String,
}

async fn session(
    State(state): State<Arc<Browser>>,
    headers: HeaderMap,
    Json(launch): Json<Launch>,
) -> Result<Response, StatusCode> {
    if !state.authorized(&headers) {
        let mut ticket = state
            .ticket
            .lock()
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        if !ticket
            .as_ref()
            .is_some_and(|t| t.accepts(launch.ticket.as_bytes()))
        {
            return Err(StatusCode::UNAUTHORIZED);
        }
        *ticket = None;
    }
    let mut response = StatusCode::NO_CONTENT.into_response();
    response.headers_mut().insert(
        header::SET_COOKIE,
        HeaderValue::from_str(&format!(
            "popcorn_session={}; HttpOnly; SameSite=Strict; Path=/",
            state.cookie
        ))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?,
    );
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    Ok(response)
}

async fn index(State(state): State<Arc<Browser>>) -> Result<Response, StatusCode> {
    file(&state.root, "index.html").await
}

async fn asset(
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

async fn launch(State(state): State<Arc<Browser>>) -> Result<Response, StatusCode> {
    let ticket = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
    *state
        .ticket
        .lock()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)? = Some(
        SessionToken::parse(ticket.as_bytes()).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?,
    );
    let mut response = Json(serde_json::json!({ "ticket": ticket })).into_response();
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    Ok(response)
}

pub(crate) fn access(
    token: SessionToken,
    address: std::net::SocketAddr,
    origin: Option<String>,
    browser: Option<(PathBuf, SessionToken)>,
) -> Arc<super::AccessPolicy> {
    let browser = browser.map(|(root, ticket)| Arc::new(Browser::new(root, ticket)));
    let origin = if browser.is_some() {
        Some(format!("http://{address}"))
    } else {
        origin
    };
    Arc::new(super::AccessPolicy {
        token,
        host: address.to_string(),
        origin,
        browser,
    })
}
