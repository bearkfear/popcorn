//! Serves packaged web assets and exchanges a private launch ticket for a browser session.

#![expect(
    clippy::redundant_pub_crate,
    reason = "HTTP browser adapters are internal to the server"
)]

use crate::core::auth::SessionToken;
use axum::{
    Json, Router,
    extract::State,
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use serde::Deserialize;
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};
use uuid::Uuid;

pub(crate) struct Browser {
    pub(super) root: PathBuf,
    ticket: Mutex<Option<SessionToken>>,
    cookie: String,
    pub(super) network: Vec<String>,
    pub(super) players: Mutex<super::browser_player::PlayerSessions>,
    pub(super) pairing: Mutex<crate::core::auth::pairing::PairingCode>,
}

impl std::fmt::Debug for Browser {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Browser")
            .field("root", &self.root)
            .finish_non_exhaustive()
    }
}

impl Browser {
    pub(crate) fn new(root: PathBuf, ticket: SessionToken, network: Vec<String>) -> Self {
        Self {
            root,
            network,
            players: Mutex::new(super::browser_player::PlayerSessions::new()),
            pairing: Mutex::new(super::browser_pairing::new_code()),
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
        .route("/", get(super::browser_assets::index))
        .route("/assets/{*path}", get(super::browser_assets::asset))
        .merge(super::browser_player::router())
        .route("/browser/session", post(session))
        .route("/browser/launch", post(launch))
        .route("/browser/network", get(super::browser_pairing::network))
        .route("/browser/pair", post(super::browser_pairing::pair))
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
    session_response(&state)
}

pub(super) fn session_response(state: &Browser) -> Result<Response, StatusCode> {
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
    mut network: Vec<String>,
) -> Arc<super::AccessPolicy> {
    if browser.is_none() {
        network.clear();
    }
    let browser =
        browser.map(|(root, ticket)| Arc::new(Browser::new(root, ticket, network.clone())));
    let origin = if browser.is_some() {
        Some(format!("http://{address}"))
    } else {
        origin
    };
    Arc::new(super::AccessPolicy {
        token,
        host: address.to_string(),
        lan_hosts: network,
        origin,
        browser,
    })
}
