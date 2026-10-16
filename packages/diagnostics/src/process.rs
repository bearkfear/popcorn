//! Correlates process spawn/exit with redacted, bounded stderr collected concurrently.

#[path = "stderr.rs"]
mod stderr;

use serde_json::{Value, json};
use std::{
    io,
    process::ExitStatus,
    time::{Duration, Instant},
};
use tokio::{
    process::{Child, Command},
    task::JoinHandle,
};
use uuid::Uuid;

/// Correlation fields shared by process, HTTP and player diagnostic records.
#[derive(Debug, Clone, Copy)]
pub struct ProcessContext {
    /// Playback session UUID, unrelated to its private access credential.
    pub playback_id: Uuid,
    /// Monotonic stream generation, absent for inspection.
    pub generation: Option<u64>,
    /// Fixed tool name such as ffmpeg or ffprobe.
    pub tool: &'static str,
}

impl ProcessContext {
    /// Adds the context to a structured event before redaction and persistence.
    pub fn record(self, event: &str, mut details: Value) {
        if let Some(fields) = details.as_object_mut() {
            fields.insert("playback_id".into(), json!(self.playback_id));
            fields.insert("stream_generation".into(), json!(self.generation));
            fields.insert("tool".into(), json!(self.tool));
        }
        crate::record(event, details);
    }
}

/// Concurrent stderr capture and timing for one owned child process.
#[derive(Debug)]
pub struct ProcessLog {
    context: ProcessContext,
    started: Instant,
    stderr: Option<JoinHandle<()>>,
    finished: bool,
}

/// Spawns a configured child, forcing redacted stderr capture and kill-on-drop.
///
/// # Errors
/// Returns process creation failures, also recorded without raw source URLs.
pub fn spawn(mut command: Command, context: ProcessContext) -> io::Result<(Child, ProcessLog)> {
    command
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);
    let arguments: Vec<_> = command
        .as_std()
        .get_args()
        .map(|arg| arg.to_string_lossy().into_owned())
        .collect();
    let binary = std::fs::metadata(command.as_std().get_program()).ok();
    let mut child = command.spawn().inspect_err(|error| {
        context.record(
            "media.process.spawn_failed",
            json!({ "kind": format!("{:?}", error.kind()), "os_code": error.raw_os_error() }),
        );
    })?;
    context.record(
        "media.process.spawn",
        json!({ "converter_pid": child.id(), "arguments": arguments,
            "binary_size": binary.as_ref().map(std::fs::Metadata::len),
            "binary_modified_ms": binary.and_then(|file| file.modified().ok())
                .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok()).map(|duration| duration.as_millis()),
        }),
    );
    let stderr = child
        .stderr
        .take()
        .map(|stderr| tokio::spawn(stderr::capture(stderr, context)));
    Ok((
        child,
        ProcessLog {
            context,
            started: Instant::now(),
            stderr,
            finished: false,
        },
    ))
}

impl ProcessLog {
    /// Records exit status and waits at most two seconds for remaining stderr.
    pub async fn finish(&mut self, status: ExitStatus) {
        #[cfg(unix)]
        let signal = {
            use std::os::unix::process::ExitStatusExt as _;
            status.signal()
        };
        #[cfg(not(unix))]
        let signal: Option<i32> = None;
        self.finished = true;
        self.context.record("media.process.exit", json!({ "success": status.success(),
            "exit_code": status.code(), "signal": signal, "elapsed_ms": self.started.elapsed().as_millis() }));
        if let Some(task) = self.stderr.as_mut() {
            match tokio::time::timeout(Duration::from_secs(2), &mut *task).await {
                Ok(Ok(())) => {}
                Ok(Err(error)) => self.context.record(
                    "media.process.stderr_failed",
                    json!({
                        "cancelled": error.is_cancelled(), "panic": error.is_panic(),
                    }),
                ),
                Err(_) => {
                    task.abort();
                    self.context
                        .record("media.process.stderr_timeout", json!({}));
                }
            }
        }
    }
}

impl Drop for ProcessLog {
    fn drop(&mut self) {
        if !self.finished {
            self.context.record(
                "media.process.interrupted",
                json!({ "elapsed_ms": self.started.elapsed().as_millis() }),
            );
        }
    }
}
