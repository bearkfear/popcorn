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

use super::preparation::Preparation;

pub(super) struct ConversionReader {
    reader: DuplexStream,
    cancel: CancellationToken,
    error: Arc<OnceLock<io::Error>>,
}

impl ConversionReader {
    pub(super) const fn new(
        reader: DuplexStream,
        cancel: CancellationToken,
        error: Arc<OnceLock<io::Error>>,
    ) -> Self {
        Self {
            reader,
            cancel,
            error,
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
        let result = Pin::new(&mut self.reader).poll_read(context, buffer);
        if matches!(result, Poll::Ready(Ok(())))
            && buffer.filled().len() == before
            && let Some(error) = self.error.get()
        {
            return Poll::Ready(Err(io::Error::new(error.kind(), error.to_string())));
        }
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
}

impl ConversionJob {
    pub(super) async fn run(mut self) {
        let outcome = tokio::select! {
            () = self.cancel.cancelled() => None,
            () = self.playback.cancelled() => None,
            result = copy_output(&mut self.child, &mut self.writer) => Some(result),
        };
        match outcome {
            Some(Ok(())) => {}
            Some(Err(error)) => {
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
    }
}

async fn copy_output(child: &mut Child, writer: &mut DuplexStream) -> io::Result<()> {
    let mut stdout = child
        .stdout
        .take()
        .ok_or_else(|| io::Error::other("converter stdout unavailable"))?;
    tokio::io::copy(&mut stdout, writer).await?;
    if !child.wait().await?.success() {
        return Err(io::Error::other("media converter exited unsuccessfully"));
    }
    Ok(())
}
