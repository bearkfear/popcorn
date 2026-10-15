//! Revokes outstanding torrent readers when their owning playback stops.

use std::{
    future::Future,
    io,
    pin::Pin,
    task::{Context, Poll},
};

use tokio::io::{AsyncRead, AsyncSeek, ReadBuf};
use tokio_util::sync::CancellationToken;

pub(super) struct PlaybackReader<R> {
    reader: R,
    cancelled: Pin<Box<dyn Future<Output = ()> + Send>>,
}

impl<R> PlaybackReader<R> {
    pub(super) fn new(reader: R, cancel: CancellationToken) -> Self {
        Self {
            reader,
            cancelled: Box::pin(cancel.cancelled_owned()),
        }
    }
}

impl<R: AsyncRead + Unpin> AsyncRead for PlaybackReader<R> {
    fn poll_read(
        mut self: Pin<&mut Self>,
        context: &mut Context<'_>,
        buffer: &mut ReadBuf<'_>,
    ) -> Poll<io::Result<()>> {
        if self.cancelled.as_mut().poll(context).is_ready() {
            return Poll::Ready(Err(io::Error::new(
                io::ErrorKind::Interrupted,
                "playback stopped",
            )));
        }
        Pin::new(&mut self.reader).poll_read(context, buffer)
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
