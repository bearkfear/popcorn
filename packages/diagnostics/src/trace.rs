//! Buffers a tracing event before redacting it for stderr and the persistent sink.

use std::io::{self, Write};

/// A complete tracing-event buffer, preventing partial credentials from bypassing redaction.
#[derive(Debug, Default)]
pub struct TraceWriter {
    bytes: Vec<u8>,
}

/// Writer factory accepted by `tracing_subscriber::fmt().with_writer(...)`.
#[must_use]
pub fn trace_writer() -> TraceWriter {
    TraceWriter::default()
}

impl Write for TraceWriter {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        if self.bytes.len() + bytes.len() <= 64 * 1024 {
            self.bytes.extend_from_slice(bytes);
        }
        Ok(bytes.len())
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

impl Drop for TraceWriter {
    fn drop(&mut self) {
        let text = String::from_utf8_lossy(&self.bytes);
        for line in text.lines() {
            let safe = super::sanitize(line);
            let mut data = serde_json::from_str(line)
                .unwrap_or_else(|_| serde_json::json!({ "message": safe }));
            super::redact::sanitize_value(&mut data);
            if let Ok(serialized) = serde_json::to_string(&data) {
                let _ = writeln!(io::stderr().lock(), "{serialized}");
            }
            super::record("server.tracing", data);
        }
    }
}
