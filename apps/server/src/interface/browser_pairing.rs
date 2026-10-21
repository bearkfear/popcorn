//! Authorizes a TV with a short-lived code and publishes network addresses to authenticated clients.

use super::browser::{Browser, session_response};
use crate::core::auth::pairing::{PairingCode, PairingResult};
use axum::{
    Json,
    extract::State,
    http::{HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};
use serde::Deserialize;
use std::{sync::Arc, time::Instant};
use uuid::Uuid;

pub(super) fn new_code() -> PairingCode {
    let [a, b, c, d, ..] = Uuid::new_v4().into_bytes();
    PairingCode::new(u32::from_le_bytes([a, b, c, d]), Instant::now())
}

pub(super) async fn network(State(state): State<Arc<Browser>>) -> Result<Response, StatusCode> {
    let mut pairing = state
        .pairing
        .lock()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    if pairing.expired(Instant::now()) {
        *pairing = new_code();
    }
    let data = serde_json::json!({
        "addresses": state.network.iter().map(|host| format!("http://{host}")).collect::<Vec<_>>(),
        "pairingCode": pairing.text(),
    });
    drop(pairing);
    let mut response = Json(data).into_response();
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    Ok(response)
}

#[derive(Deserialize)]
pub(super) struct Pair {
    code: String,
}

pub(super) async fn pair(
    State(state): State<Arc<Browser>>,
    Json(request): Json<Pair>,
) -> Result<Response, StatusCode> {
    let result = state
        .pairing
        .lock()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .verify(request.code.trim(), Instant::now());
    match result {
        PairingResult::Accepted => session_response(&state),
        PairingResult::Rejected => Err(StatusCode::UNAUTHORIZED),
        PairingResult::Expired => Err(StatusCode::GONE),
        PairingResult::Limited => Err(StatusCode::TOO_MANY_REQUESTS),
    }
}
