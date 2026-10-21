//! Accepts bounded `WebView` samples and persists them with backend-compatible correlation IDs.

use serde::Deserialize;
use serde_json::{Value, json};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct MediaSample {
    event: String,
    playback_id: Option<uuid::Uuid>,
    generation: Option<u64>,
    client_time_ms: u64,
    data: Value,
}

fn record(sample: MediaSample) -> Result<(), String> {
    if sample.event.len() > 80
        || !sample
            .event
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_'))
        || !["media.", "mse.", "playback."]
            .iter()
            .any(|prefix| sample.event.starts_with(prefix))
    {
        return Err("invalid diagnostic event".into());
    }
    if serde_json::to_vec(&sample.data)
        .map_err(|_| "invalid diagnostic sample")?
        .len()
        > 48 * 1024
    {
        return Err("diagnostic sample too large".into());
    }
    let mut data = json!({
        "playback_id": sample.playback_id, "stream_generation": sample.generation,
        "client_time_ms": sample.client_time_ms,
    });
    data["details"] = sample.data;
    popcorn_diagnostics::try_record(&sample.event, data)
        .map_err(|_| "Não foi possível gravar o diagnóstico local.".into())
}

pub(super) async fn receive(
    axum::Json(sample): axum::Json<MediaSample>,
) -> Result<axum::http::StatusCode, axum::http::StatusCode> {
    record(sample).map_err(|_| axum::http::StatusCode::BAD_REQUEST)?;
    Ok(axum::http::StatusCode::NO_CONTENT)
}
