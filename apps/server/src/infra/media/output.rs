//! Measures converter stdout and client backpressure, including cancellation during a pending write.

use popcorn_diagnostics::ProcessContext;
use serde_json::json;
use std::{io, time::Instant};
use tokio::{
    io::{AsyncReadExt as _, AsyncWriteExt as _, DuplexStream},
    process::Child,
};

struct Metrics {
    context: ProcessContext,
    started: Instant,
    logged: Instant,
    received: u64,
    delivered: u64,
    max_read_wait_ms: u128,
    max_write_wait_ms: u128,
    reading_since: Option<Instant>,
    writing_since: Option<Instant>,
    complete: bool,
}

impl Metrics {
    fn new(context: ProcessContext) -> Self {
        Self {
            context,
            started: Instant::now(),
            logged: Instant::now(),
            received: 0,
            delivered: 0,
            max_read_wait_ms: 0,
            max_write_wait_ms: 0,
            reading_since: None,
            writing_since: None,
            complete: false,
        }
    }

    fn record(&self, event: &str) {
        self.context.record(
            event,
            json!({ "elapsed_ms": self.started.elapsed().as_millis(),
            "stdout_bytes": self.received, "pipe_bytes": self.delivered,
            "max_read_wait_ms": self.max_read_wait_ms, "max_write_wait_ms": self.max_write_wait_ms,
            "pending_read_ms": self.reading_since.map(|time| time.elapsed().as_millis()),
            "pending_write_ms": self.writing_since.map(|time| time.elapsed().as_millis()),
            "complete": self.complete }),
        );
    }
}

impl Drop for Metrics {
    fn drop(&mut self) {
        self.record("media.converter.output_end");
    }
}

pub(super) async fn copy_output(
    child: &mut Child,
    writer: &mut DuplexStream,
    context: ProcessContext,
) -> io::Result<()> {
    let mut stdout = child
        .stdout
        .take()
        .ok_or_else(|| io::Error::other("converter stdout unavailable"))?;
    let mut metrics = Metrics::new(context);
    let mut bytes = vec![0; 64 * 1024];
    loop {
        let reading = Instant::now();
        metrics.reading_since = Some(reading);
        let count = stdout.read(&mut bytes).await?;
        metrics.reading_since = None;
        metrics.max_read_wait_ms = metrics.max_read_wait_ms.max(reading.elapsed().as_millis());
        if count == 0 {
            break;
        }
        let first_output = metrics.received == 0;
        metrics.received += count as u64;
        if first_output {
            metrics.record("media.converter.first_output");
        }
        write_chunk(writer, &bytes[..count], &mut metrics).await?;
        if metrics.logged.elapsed().as_secs() >= 2 {
            metrics.record("media.converter.progress");
            metrics.logged = Instant::now();
        }
    }
    let status = child.wait().await?;
    metrics.complete = status.success();
    if !status.success() {
        return Err(io::Error::other("media converter exited unsuccessfully"));
    }
    Ok(())
}

async fn write_chunk(
    writer: &mut DuplexStream,
    mut bytes: &[u8],
    metrics: &mut Metrics,
) -> io::Result<()> {
    while !bytes.is_empty() {
        let writing = Instant::now();
        metrics.writing_since = Some(writing);
        let count = writer.write(bytes).await?;
        metrics.writing_since = None;
        if count == 0 {
            return Err(io::Error::new(
                io::ErrorKind::WriteZero,
                "converter output closed",
            ));
        }
        metrics.delivered += count as u64;
        metrics.max_write_wait_ms = metrics.max_write_wait_ms.max(writing.elapsed().as_millis());
        bytes = &bytes[count..];
    }
    Ok(())
}
