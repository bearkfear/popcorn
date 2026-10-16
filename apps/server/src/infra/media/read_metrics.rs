//! Records bytes, pending-read stalls and reader teardown without sampling media contents.

use popcorn_diagnostics::ProcessContext;
use serde_json::json;
use std::{io, task::Poll, time::Instant};

pub(super) struct ReadMetrics {
    context: ProcessContext,
    transport: &'static str,
    started: Instant,
    logged: Instant,
    pending: Option<Instant>,
    bytes: u64,
    eof: bool,
    failed: bool,
    max_wait_ms: u128,
}

impl ReadMetrics {
    pub(super) fn new(context: ProcessContext, transport: &'static str) -> Self {
        Self {
            context,
            transport,
            started: Instant::now(),
            logged: Instant::now(),
            pending: None,
            bytes: 0,
            eof: false,
            failed: false,
            max_wait_ms: 0,
        }
    }

    pub(super) fn observe(&mut self, count: usize, result: &Poll<io::Result<()>>) {
        if result.is_pending() {
            self.pending.get_or_insert_with(Instant::now);
            return;
        }
        if let Some(pending) = self.pending.take() {
            let waited = pending.elapsed().as_millis();
            self.max_wait_ms = self.max_wait_ms.max(waited);
            if waited >= 1000 {
                self.record("media.reader.stall_ended");
            }
        }
        match result {
            Poll::Ready(Ok(())) => {
                if count == 0 {
                    self.eof = true;
                } else {
                    self.bytes += count as u64;
                    if self.bytes == count as u64 {
                        self.record("media.reader.first_bytes");
                    }
                }
            }
            Poll::Ready(Err(error)) => {
                self.failed = true;
                self.context.record("media.reader.error", json!({ "transport": self.transport,
                    "kind": format!("{:?}", error.kind()), "message": error.to_string(), "bytes": self.bytes }));
            }
            Poll::Pending => {}
        }
        if self.logged.elapsed().as_secs() >= 5 {
            self.record("media.reader.progress");
            self.logged = Instant::now();
        }
    }

    fn record(&self, event: &str) {
        self.context.record(event, json!({ "transport": self.transport, "bytes": self.bytes,
            "elapsed_ms": self.started.elapsed().as_millis(), "eof": self.eof, "failed": self.failed,
            "max_read_wait_ms": self.max_wait_ms, "pending_ms": self.pending.map(|p| p.elapsed().as_millis()) }));
    }
}

impl Drop for ReadMetrics {
    fn drop(&mut self) {
        self.record("media.reader.closed");
    }
}
