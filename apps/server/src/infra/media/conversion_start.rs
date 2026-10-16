//! Acquires the conversion slot and starts a measured, cancellable child generation.

use super::{
    conversion_reader::ConversionJob,
    preparation::{PreparedMedia, Processing},
    tools::MediaTools,
};
use crate::application::media::AccessError;
use popcorn_diagnostics::{ProcessContext, spawn};
use serde_json::json;
use std::{
    sync::{Arc, OnceLock},
    time::Instant,
};
use tokio::io::DuplexStream;
use tokio_util::sync::CancellationToken;

type Output = (DuplexStream, Arc<OnceLock<std::io::Error>>);

pub(super) async fn start(
    processing: &Arc<Processing>,
    media: &PreparedMedia,
    url: &str,
    start: f64,
    cancel: &CancellationToken,
    context: ProcessContext,
) -> Result<Output, AccessError> {
    let requested = Instant::now();
    let permit = tokio::select! {
        () = cancel.cancelled() => return Err(AccessError::Gone),
        permit = processing.slot.clone().acquire_owned() => permit.map_err(|_| AccessError::Gone)?,
    };
    let mut tasks = processing.tasks.lock().await;
    if cancel.is_cancelled() {
        return Err(AccessError::Gone);
    }
    let command = MediaTools::discover()
        .map_err(|_| AccessError::Unavailable)?
        .conversion(media, url, start);
    let (child, process_log) = spawn(command, context).map_err(|_| AccessError::Unavailable)?;
    context.record(
        "media.stream.started",
        json!({ "wait_ms": requested.elapsed().as_millis(), "start_seconds": start }),
    );
    let (reader, writer) = tokio::io::duplex(256 * 1024);
    let error = Arc::new(OnceLock::new());
    while let Some(result) = tasks.try_join_next() {
        if let Err(error) = result {
            tracing::warn!(%error, "media worker failed");
        }
    }
    tasks.spawn(
        ConversionJob {
            child,
            writer,
            cancel: cancel.clone(),
            playback: processing.cancel.clone(),
            error: error.clone(),
            state: processing.state.clone(),
            _permit: permit,
            context,
            process_log,
        }
        .run(),
    );
    drop(tasks);
    Ok((reader, error))
}
