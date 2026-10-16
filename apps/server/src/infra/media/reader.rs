//! Revokes outstanding torrent readers when their owning playback stops.
use popcorn_diagnostics::ProcessContext;

use std::{
    future::Future,
    io,
    pin::Pin,
    task::{Context, Poll},
};

use super::read_metrics::ReadMetrics;
use tokio::io::{AsyncRead, AsyncSeek, ReadBuf};
use tokio_util::sync::CancellationToken;

pub(super) struct PlaybackReader<R> {
    reader: R,
    cancelled: Pin<Box<dyn Future<Output = ()> + Send>>,
    metrics: ReadMetrics,
}

impl<R> PlaybackReader<R> {
    pub(super) fn new(reader: R, cancel: CancellationToken, id: uuid::Uuid) -> Self {
        Self {
            reader,
            cancelled: Box::pin(cancel.cancelled_owned()),
            metrics: ReadMetrics::new(
                ProcessContext {
                    playback_id: id,
                    generation: None,
                    tool: "source_reader",
                },
                "torrent_source",
            ),
        }
    }
}

impl<R: AsyncRead + Unpin> AsyncRead for PlaybackReader<R> {
    fn poll_read(
        mut self: Pin<&mut Self>,
        context: &mut Context<'_>,
        buffer: &mut ReadBuf<'_>,
    ) -> Poll<io::Result<()>> {
        let before = buffer.filled().len();
        let result = if self.cancelled.as_mut().poll(context).is_ready() {
            Poll::Ready(Err(io::Error::new(
                io::ErrorKind::Interrupted,
                "playback stopped",
            )))
        } else {
            Pin::new(&mut self.reader).poll_read(context, buffer)
        };
        self.metrics
            .observe(buffer.filled().len() - before, &result);
        result
    }
}

impl<R: AsyncSeek + Unpin> AsyncSeek for PlaybackReader<R> {
    fn start_seek(mut self: Pin<&mut Self>, position: io::SeekFrom) -> io::Result<()> {
        Pin::new(&mut self.reader).start_seek(position)
    }

    fn poll_complete(mut self: Pin<&mut Self>, context: &mut Context<'_>) -> Poll<io::Result<u64>> {
        Pin::new(&mut self.reader).poll_complete(context)
    }
}
