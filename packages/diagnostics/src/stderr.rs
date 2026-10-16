//! Drains stderr without backpressure, retaining only complete redacted lines in a bounded tail.

use super::ProcessContext;
use serde_json::json;
use std::collections::VecDeque;
use tokio::{io::AsyncReadExt as _, process::ChildStderr};

#[derive(Default)]
struct Tail {
    lines: VecDeque<String>,
    line: Vec<u8>,
    dropping_line: bool,
    discarded: u64,
    bytes: u64,
    retained_bytes: usize,
}

impl Tail {
    fn accept(&mut self, bytes: &[u8]) {
        self.bytes += bytes.len() as u64;
        for &byte in bytes {
            if byte == b'\n' {
                self.finish_line();
            } else if !self.dropping_line {
                if self.line.len() >= 8192 {
                    self.line.clear();
                    self.dropping_line = true;
                } else {
                    self.line.push(byte);
                }
            }
        }
    }

    fn finish_line(&mut self) {
        if self.dropping_line {
            self.discarded += 1;
        } else if !self.line.is_empty() {
            let safe = crate::sanitize(&String::from_utf8_lossy(&self.line));
            self.retained_bytes += safe.len();
            self.lines.push_back(safe);
            while self.retained_bytes > 16_384 || self.lines.len() > 64 {
                if let Some(line) = self.lines.pop_front() {
                    self.retained_bytes -= line.len();
                    self.discarded += 1;
                }
            }
        }
        self.line.clear();
        self.dropping_line = false;
    }
}

pub(super) async fn capture(mut stderr: ChildStderr, context: ProcessContext) {
    let mut tail = Tail::default();
    let mut buffer = [0; 2048];
    let mut logged: Option<std::time::Instant> = None;
    let error = loop {
        match stderr.read(&mut buffer).await {
            Ok(0) => break None,
            Ok(count) => {
                tail.accept(&buffer[..count]);
                if !tail.lines.is_empty() && logged.is_none_or(|time| time.elapsed().as_secs() >= 2)
                {
                    context.record(
                        "media.process.stderr_progress",
                        json!({ "tail": tail.lines,
                        "stderr_bytes": tail.bytes, "discarded_lines": tail.discarded }),
                    );
                    logged = Some(std::time::Instant::now());
                }
            }
            Err(error) => break Some(format!("{:?}", error.kind())),
        }
    };
    tail.finish_line();
    context.record(
        "media.process.stderr",
        json!({ "stderr_bytes": tail.bytes,
        "discarded_lines": tail.discarded, "tail": tail.lines, "read_error": error }),
    );
}
