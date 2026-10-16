//! Resolves packaged media executables without relying on installed codecs or PATH.

use std::{path::PathBuf, process::Stdio};

use tokio::process::Command;

#[derive(Debug, Clone)]
pub(super) struct MediaTools {
    directory: PathBuf,
}

impl MediaTools {
    pub(super) fn discover() -> std::io::Result<Self> {
        let directory = match std::env::var_os("POPCORN_MEDIA_BIN_DIR") {
            Some(directory) => PathBuf::from(directory),
            None => std::env::current_exe()?
                .parent()
                .ok_or_else(|| std::io::Error::other("backend executable has no parent"))?
                .to_path_buf(),
        };
        Ok(Self { directory })
    }

    pub(super) fn command(&self, probe: bool) -> Command {
        let name = if probe {
            "popcorn-ffprobe"
        } else {
            "popcorn-ffmpeg"
        };
        let mut command = Command::new(
            self.directory
                .join(format!("{name}{}", std::env::consts::EXE_SUFFIX)),
        );
        command
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            // Drained continuously by process diagnostics; never inherited without redaction.
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        #[cfg(windows)]
        command.creation_flags(0x0800_0000);
        command
    }
}
