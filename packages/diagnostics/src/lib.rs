//! Bounded local JSONL diagnostics shared by the backend and native desktop shell.

mod process;
mod redact;
mod store;
mod trace;

pub use process::{ProcessContext, ProcessLog, spawn};
pub use redact::{sanitize, sanitize_value};
use serde_json::{Value, json};
use std::{io, path::Path, sync::OnceLock};
pub use store::DiagnosticLog;
pub use trace::{TraceWriter, trace_writer};

static LOG: OnceLock<DiagnosticLog> = OnceLock::new();

/// Opens this process's persistent log, retaining at most four files of 5 MiB each.
///
/// # Errors
/// Returns filesystem failures; callers must surface initialization failures.
pub fn init(directory: &Path, component: &str) -> io::Result<()> {
    if LOG.get().is_some() {
        return Ok(());
    }
    let log = DiagnosticLog::open(directory, component)?;
    if LOG.set(log).is_err() {
        return Ok(());
    }
    record(
        "diagnostics.started",
        json!({
            "app_version": env!("CARGO_PKG_VERSION"), "os": std::env::consts::OS,
            "arch": std::env::consts::ARCH, "max_file_bytes": 5 * 1024 * 1024,
            "retained_files": 4,
        }),
    );
    eprintln!("Popcorn diagnostics: {}", directory.display());
    Ok(())
}

/// Appends a redacted event immediately, without placing anything on bootstrap stdout.
pub fn record(event: &str, data: Value) {
    if let Some(log) = LOG.get()
        && let Err(error) = log.record(event, data)
    {
        // Avoid recursion through tracing if disk writes fail.
        eprintln!("Popcorn diagnostic write failed: {:?}", error.kind());
    }
}

/// Persists an event and reports write failures to callers such as desktop IPC.
///
/// # Errors
/// Returns an error if logging was not initialized or the file cannot be written.
pub fn try_record(event: &str, data: Value) -> io::Result<()> {
    LOG.get()
        .ok_or_else(|| io::Error::new(io::ErrorKind::NotConnected, "diagnostics not initialized"))?
        .record(event, data)
}

#[cfg(test)]
mod tests;
