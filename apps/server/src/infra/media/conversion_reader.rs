//! Bounds conversion buffering and propagates cancellation and process failure to HTTP.

use std::{
    io,
    pin::Pin,
    sync::{Arc, OnceLock},
    task::{Context, Poll},
};

use tokio::{
    io::{AsyncRead, DuplexStream, ReadBuf},
    process::Child,
    sync::{OwnedSemaphorePermit, watch},
};
use tokio_util::sync::CancellationToken;

use super::output::copy_output;
use super::preparation::Preparation;
use super::read_metrics::ReadMetrics;
use popcorn_diagnostics::{ProcessContext, ProcessLog};
use serde_json::json;

pub(super) struct ConversionReader {
    reader: DuplexStream,
    cancel: CancellationToken,
    error: Arc<OnceLock<io::Error>>,
    metrics: ReadMetrics,
}

impl ConversionReader {
    pub(super) fn new(
        reader: DuplexStream,
        cancel: CancellationToken,
        error: Arc<OnceLock<io::Error>>,
        context: ProcessContext,
    ) -> Self {
        Self {
            reader,
            cancel,
            error,
            metrics: ReadMetrics::new(context, "converted_http"),
        }
    }
}

impl AsyncRead for ConversionReader {
    fn poll_read(
        mut self: Pin<&mut Self>,
        context: &mut Context<'_>,
        buffer: &mut ReadBuf<'_>,
    ) -> Poll<io::Result<()>> {
        let before = buffer.filled().len();
        let mut result = Pin::new(&mut self.reader).poll_read(context, buffer);
        if matches!(result, Poll::Ready(Ok(())))
            && buffer.filled().len() == before
            && let Some(error) = self.error.get()
        {
            result = Poll::Ready(Err(io::Error::new(error.kind(), error.to_string())));
        }
        self.metrics
            .observe(buffer.filled().len() - before, &result);
        result
    }
}

impl Drop for ConversionReader {
    fn drop(&mut self) {
        self.cancel.cancel();
    }
}

pub(super) struct ConversionJob {
    pub(super) child: Child,
    pub(super) writer: DuplexStream,
    pub(super) cancel: CancellationToken,
    pub(super) playback: CancellationToken,
    pub(super) error: Arc<OnceLock<io::Error>>,
    pub(super) state: watch::Sender<Preparation>,
    pub(super) _permit: OwnedSemaphorePermit,
    pub(super) context: ProcessContext,
    pub(super) process_log: ProcessLog,
}

impl ConversionJob {
    pub(super) async fn run(mut self) {
        let outcome = tokio::select! {
            () = self.cancel.cancelled() => None,
            () = self.playback.cancelled() => None,
            result = copy_output(&mut self.child, &mut self.writer, self.context) => Some(result),
        };
        match outcome {
            Some(Ok(())) => {}
            Some(Err(error)) => {
                self.context.record("media.converter.failed", json!({ "kind": format!("{:?}", error.kind()),
                    "message": error.to_string(), "cancelled": self.cancel.is_cancelled() || self.playback.is_cancelled() }));
                if error.kind() != io::ErrorKind::BrokenPipe
                    && !self.cancel.is_cancelled()
                    && !self.playback.is_cancelled()
                {
                    self.state.send_replace(Preparation::Failed(
                        "Não foi possível converter este vídeo.",
                    ));
                }
                if self.error.set(error).is_err() {
                    tracing::debug!("conversion error was already recorded");
                }
            }
            None => {
                self.context.record("media.converter.cancelled", json!({
                    "reason": if self.playback.is_cancelled() { "playback_stopped" } else { "stream_replaced_or_client_closed" } }));
                if self
                    .error
                    .set(io::Error::new(
                        io::ErrorKind::Interrupted,
                        "conversion cancelled",
                    ))
                    .is_err()
                {
                    tracing::debug!("conversion cancellation was already recorded");
                }
            }
        }
        if self.child.id().is_some()
            && let Err(error) = self.child.kill().await
        {
            tracing::warn!(kind = ?error.kind(), "could not reap media converter");
        }
        if let Ok(status) = self.child.wait().await {
            self.process_log.finish(status).await;
        }
    }
}
