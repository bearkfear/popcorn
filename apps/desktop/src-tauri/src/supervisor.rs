use std::{
    fmt,
    net::{Ipv4Addr, SocketAddr},
    path::Path,
    process::Stdio,
    time::Duration,
};

use serde::{Deserialize, Serialize};
use tokio::{
    io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader},
    process::{Child, ChildStdin, ChildStdout, Command},
    time::timeout,
};
use uuid::Uuid;

const START_TIMEOUT: Duration = Duration::from_secs(15);
const STOP_TIMEOUT: Duration = Duration::from_secs(8);

/// Ephemeral connection information returned only through the desktop IPC.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Bootstrap {
    /// Loopback socket address, without a URL scheme.
    pub address: SocketAddr,
    /// Session credential; never persist, log or put it in a URL.
    pub token: String,
    /// Private bootstrap protocol version.
    pub protocol_version: String,
    /// Unique identifier of the running backend.
    pub instance_id: Uuid,
    /// Validated installed snapshot version.
    pub catalog_version: String,
}

impl fmt::Debug for Bootstrap {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Bootstrap")
            .field("address", &self.address)
            .field("instance_id", &self.instance_id)
            .finish_non_exhaustive()
    }
}

/// Failures of private process startup or shutdown; never include control input.
#[derive(Debug, thiserror::Error)]
#[non_exhaustive]
pub enum SupervisorError {
    /// A pipe or process operation failed.
    #[error("could not communicate with the local backend")]
    Io(#[from] std::io::Error),
    /// Backend readiness was absent, malformed or incompatible.
    #[error("backend did not announce valid readiness")]
    InvalidReadiness,
    /// A previous attempt has not been confirmed stopped.
    #[error("backend shutdown must complete before another startup")]
    PendingProcess,
    /// Startup exceeded its bounded deadline.
    #[error("backend startup exceeded its deadline")]
    StartupTimeout,
    /// Process termination could not be confirmed within its deadline.
    #[error("could not confirm backend termination")]
    ShutdownTimeout,
    /// The backend exited unsuccessfully after a shutdown request.
    #[error("backend reported an unsuccessful shutdown")]
    UnsuccessfulShutdown,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Ready {
    event: String,
    address: SocketAddr,
    protocol_version: String,
    instance_id: Uuid,
    catalog_version: String,
}

#[derive(Serialize)]
struct Initialize<'a> {
    event: &'static str,
    catalog: &'a Path,
    data_dir: &'a Path,
    token: &'a str,
    origin: &'a str,
}

struct Process {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
}

/// Owns exactly one child and retains it until process exit has been confirmed.
///
/// Serialize calls with the desktop state's async mutex. An interrupted startup
/// remains owned and must be stopped before another process can be started.
#[derive(Default)]
pub struct Supervisor {
    process: Option<Process>,
    bootstrap: Option<Bootstrap>,
}

impl fmt::Debug for Supervisor {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Supervisor")
            .field("pid", &self.process.as_ref().and_then(|p| p.child.id()))
            .finish_non_exhaustive()
    }
}

impl Supervisor {
    /// Starts the packaged backend, or returns the same live connection.
    ///
    /// # Errors
    ///
    /// Returns an error for startup failure, invalid readiness or unconfirmed
    /// termination. Failed attempts are stopped before a retry is permitted.
    pub async fn start(
        &mut self,
        executable: &Path,
        catalog: &Path,
        data_dir: &Path,
        origin: &str,
    ) -> Result<Bootstrap, SupervisorError> {
        if let Some(process) = &mut self.process {
            if process.child.try_wait()?.is_none() {
                return self
                    .bootstrap
                    .clone()
                    .ok_or(SupervisorError::PendingProcess);
            }
            self.process = None;
            self.bootstrap = None;
        }
        let mut command = Command::new(executable);
        command
            .arg("sidecar")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .kill_on_drop(true);
        #[cfg(windows)]
        command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
        let mut child = command.spawn()?;
        let stdin = child
            .stdin
            .take()
            .ok_or(SupervisorError::InvalidReadiness)?;
        let stdout = child
            .stdout
            .take()
            .ok_or(SupervisorError::InvalidReadiness)?;
        self.process = Some(Process {
            child,
            stdin,
            stdout: BufReader::new(stdout),
        });
        // Two independently generated UUIDs provide a 244-bit ephemeral secret.
        let token = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
        let result = timeout(
            START_TIMEOUT,
            self.initialize(catalog, data_dir, origin, &token),
        )
        .await
        .map_err(|_| SupervisorError::StartupTimeout)
        .and_then(|result| result);
        match result {
            Ok(ready) => {
                self.bootstrap = Some(ready.clone());
                Ok(ready)
            }
            Err(error) => {
                self.stop().await?;
                Err(error)
            }
        }
    }

    async fn initialize(
        &mut self,
        catalog: &Path,
        data_dir: &Path,
        origin: &str,
        token: &str,
    ) -> Result<Bootstrap, SupervisorError> {
        let process = self
            .process
            .as_mut()
            .ok_or(SupervisorError::PendingProcess)?;
        let mut frame = serde_json::to_vec(&Initialize {
            event: "initialize",
            catalog,
            data_dir,
            token,
            origin,
        })
        .map_err(|_| SupervisorError::InvalidReadiness)?;
        frame.push(b'\n');
        process.stdin.write_all(&frame).await?;
        process.stdin.flush().await?;
        let mut line = Vec::new();
        let length = (&mut process.stdout)
            .take(4097)
            .read_until(b'\n', &mut line)
            .await?;
        if length > 4096 || !line.ends_with(b"\n") {
            return Err(SupervisorError::InvalidReadiness);
        }
        let ready: Ready =
            serde_json::from_slice(&line).map_err(|_| SupervisorError::InvalidReadiness)?;
        if ready.event != "ready"
            || ready.protocol_version != "bootstrap.v1"
            || ready.address.ip() != Ipv4Addr::LOCALHOST
            || ready.address.port() == 0
            || ready.catalog_version.is_empty()
            || process.child.try_wait()?.is_some()
        {
            return Err(SupervisorError::InvalidReadiness);
        }
        Ok(Bootstrap {
            address: ready.address,
            token: token.to_owned(),
            protocol_version: ready.protocol_version,
            instance_id: ready.instance_id,
            catalog_version: ready.catalog_version,
        })
    }

    /// Requests graceful shutdown, escalates only for this child, and reaps it.
    ///
    /// # Errors
    ///
    /// Retains ownership and refuses another startup if process exit cannot be
    /// confirmed. A completed but unsuccessful shutdown is reported separately.
    pub async fn stop(&mut self) -> Result<(), SupervisorError> {
        self.bootstrap = None;
        let Some(process) = self.process.as_mut() else {
            return Ok(());
        };
        let write = timeout(
            Duration::from_secs(1),
            process.stdin.write_all(b"{\"event\":\"shutdown\"}\n"),
        )
        .await;
        // A closed control pipe is expected if startup failed or the child exited.
        if !matches!(write, Ok(Ok(()))) {
            eprintln!("backend control pipe unavailable; waiting for process exit");
        }
        let status = if let Ok(status) = timeout(STOP_TIMEOUT, process.child.wait()).await {
            status?
        } else {
            process.child.start_kill()?;
            timeout(STOP_TIMEOUT, process.child.wait())
                .await
                .map_err(|_| SupervisorError::ShutdownTimeout)??
        };
        self.process = None;
        if !status.success() {
            return Err(SupervisorError::UnsuccessfulShutdown);
        }
        Ok(())
    }
}
