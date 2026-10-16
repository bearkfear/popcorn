//! Serializes complete events and rotates files under one process-local lock.

use serde_json::{Value, json};
use std::{
    fs::{self, File, OpenOptions},
    io::{self, Write},
    path::{Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use uuid::Uuid;

const MAX_BYTES: u64 = 5 * 1024 * 1024;
const MAX_EVENT_BYTES: usize = 64 * 1024;

/// A process-specific, size-bounded diagnostic sink with immediate append/flush.
#[derive(Debug)]
pub struct DiagnosticLog {
    component: String,
    run_id: Uuid,
    state: Mutex<Files>,
}

#[derive(Debug)]
struct Files {
    path: PathBuf,
    file: File,
    length: u64,
    max_bytes: u64,
}

impl DiagnosticLog {
    /// Opens `<component>.jsonl` in a private directory.
    ///
    /// # Errors
    /// Returns invalid component names or filesystem errors.
    pub fn open(directory: &Path, component: &str) -> io::Result<Self> {
        if component.is_empty()
            || !component
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-')
        {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "invalid diagnostic component",
            ));
        }
        fs::create_dir_all(directory)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt as _;
            fs::set_permissions(directory, fs::Permissions::from_mode(0o700))?;
        }
        let path = directory.join(format!("{component}.jsonl"));
        let file = open(&path)?;
        let length = file.metadata()?.len();
        Ok(Self {
            component: component.into(),
            run_id: Uuid::new_v4(),
            state: Mutex::new(Files {
                path,
                file,
                length,
                max_bytes: MAX_BYTES,
            }),
        })
    }

    /// Writes one versioned JSON object per line, redacting all nested text.
    ///
    /// # Errors
    /// Returns serialization or local write/rotation failures.
    pub fn record(&self, event: &str, mut data: Value) -> io::Result<()> {
        super::redact::sanitize_value(&mut data);
        let timestamp_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();
        let entry = json!({ "schema": "popcorn.diagnostics.v1", "timestamp_ms": timestamp_ms,
            "component": self.component, "pid": std::process::id(), "run_id": self.run_id,
            "event": super::sanitize(event), "data": data });
        let mut bytes = serde_json::to_vec(&entry)?;
        if bytes.len() > MAX_EVENT_BYTES {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "diagnostic event too large",
            ));
        }
        bytes.push(b'\n');
        let mut state = self
            .state
            .lock()
            .map_err(|_| io::Error::other("diagnostic lock poisoned"))?;
        if state.length + bytes.len() as u64 > state.max_bytes {
            state.rotate()?;
        }
        state.file.write_all(&bytes)?;
        state.file.flush()?;
        state.length += bytes.len() as u64;
        drop(state);
        Ok(())
    }
}

impl Files {
    fn rotate(&mut self) -> io::Result<()> {
        // Close the current file before renaming so rotation also works on Windows.
        let temporary = self.path.with_extension("next");
        let next = open(&temporary)?;
        let previous = std::mem::replace(&mut self.file, next);
        drop(previous);
        for index in (1..=3).rev() {
            let destination = self.path.with_extension(format!("jsonl.{index}"));
            let source = if index == 1 {
                self.path.clone()
            } else {
                self.path.with_extension(format!("jsonl.{}", index - 1))
            };
            match fs::remove_file(&destination) {
                Ok(()) => {}
                Err(e) if e.kind() == io::ErrorKind::NotFound => {}
                Err(e) => return Err(e),
            }
            match fs::rename(source, destination) {
                Ok(()) => {}
                Err(e) if e.kind() == io::ErrorKind::NotFound => {}
                Err(e) => return Err(e),
            }
        }
        self.file = open(&self.path)?;
        self.length = 0;
        // The temporary placeholder is never a diagnostic artifact.
        fs::remove_file(temporary)?;
        Ok(())
    }
}

fn open(path: &Path) -> io::Result<File> {
    let mut options = OpenOptions::new();
    options.create(true).append(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt as _;
        options.mode(0o600);
    }
    options.open(path)
}

#[cfg(test)]
impl DiagnosticLog {
    pub(super) fn limit_for_test(&self, max_bytes: u64) {
        if let Ok(mut state) = self.state.lock() {
            state.max_bytes = max_bytes;
        }
    }
}
