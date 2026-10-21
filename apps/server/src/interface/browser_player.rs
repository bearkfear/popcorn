//! Holds bounded, short-lived playback intents for browsers that isolate new tabs.

use super::browser::Browser;
use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, Path, State},
    http::{HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
    routing::get,
};
use serde_json::Value;
use std::{
    collections::HashMap,
    sync::Arc,
    time::{Duration, Instant},
};
use uuid::Uuid;

pub(super) type PlayerSessions = HashMap<Uuid, (Instant, Value)>;

pub(super) fn router() -> Router<Arc<Browser>> {
    Router::new()
        .route("/browser/player/{id}", get(read).post(store))
        .layer(DefaultBodyLimit::max(64 * 1024))
}

async fn store(
    State(state): State<Arc<Browser>>,
    Path(id): Path<Uuid>,
    Json(session): Json<Value>,
) -> Result<StatusCode, StatusCode> {
    if !session.get("context").is_some_and(Value::is_object)
        || !session
            .get("position")
            .and_then(Value::as_f64)
            .is_some_and(|position| position.is_finite() && position >= 0.0)
    {
        return Err(StatusCode::BAD_REQUEST);
    }
    let mut sessions = state
        .players
        .lock()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    sessions.retain(|_, (issued, _)| issued.elapsed() < Duration::from_mins(5));
    if sessions.len() >= 32
        && let Some(oldest) = sessions
            .iter()
            .min_by_key(|(_, (issued, _))| *issued)
            .map(|(id, _)| *id)
    {
        sessions.remove(&oldest);
    }
    sessions.insert(id, (Instant::now(), session));
    drop(sessions);
    Ok(StatusCode::NO_CONTENT)
}

async fn read(
    State(state): State<Arc<Browser>>,
    Path(id): Path<Uuid>,
) -> Result<Response, StatusCode> {
    let session = {
        let mut sessions = state
            .players
            .lock()
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        sessions.retain(|_, (issued, _)| issued.elapsed() < Duration::from_mins(5));
        sessions
            .get(&id)
            .map(|(_, session)| session.clone())
            .ok_or(StatusCode::NOT_FOUND)?
    };
    let mut response = Json(session).into_response();
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    Ok(response)
}
