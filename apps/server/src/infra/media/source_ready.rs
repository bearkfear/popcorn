//! Waits for local torrent verification before exposing a source to media tools.

use std::time::{Duration, Instant};

use librqbit::ManagedTorrent;
use serde_json::json;
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

use crate::application::media::AccessError;

pub(super) async fn wait(
    handle: &ManagedTorrent,
    cancel: &CancellationToken,
    id: Uuid,
) -> Result<(), AccessError> {
    let started = Instant::now();
    popcorn_diagnostics::record(
        "media.source.initializing",
        json!({ "playback_id": id, "state": format!("{:?}", handle.stats().state) }),
    );
    let result = tokio::select! {
        biased;
        () = cancel.cancelled() => {
            popcorn_diagnostics::record("media.source.cancelled", json!({ "playback_id": id }));
            return Err(AccessError::Gone);
        }
        result = tokio::time::timeout(Duration::from_secs(80), handle.wait_until_initialized()) => result,
    };
    let (event, error) = match result {
        Ok(Ok(())) => ("media.source.ready", None),
        Ok(Err(error)) => (
            "media.source.initialization_failed",
            Some(error.to_string()),
        ),
        Err(_) => (
            "media.source.initialization_timeout",
            Some("local file verification timed out".to_owned()),
        ),
    };
    popcorn_diagnostics::record(
        event,
        json!({ "playback_id": id,
        "elapsed_ms": started.elapsed().as_millis(), "state": format!("{:?}", handle.stats().state),
        "error": error }),
    );
    if error.is_some() {
        return Err(AccessError::Unavailable);
    }
    Ok(())
}
