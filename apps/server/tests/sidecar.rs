//! Real private-pipe lifecycle checks, including the desktop process supervisor.

use std::{path::PathBuf, process::Stdio, time::Duration};

use popcorn_desktop::Supervisor;
use popcorn_server::create_catalog;
use serde_json::{Value, json};
use tokio::{
    io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader},
    net::TcpStream,
    process::{Child, Command},
    time::timeout,
};

type TestResult = Result<(), Box<dyn std::error::Error + Send + Sync>>;
const TOKEN: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const ORIGIN: &str = "http://localhost:1420";

struct Fixture {
    root: tempfile::TempDir,
    catalog: PathBuf,
    data: PathBuf,
}

impl Fixture {
    async fn new() -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let root = tempfile::tempdir()?;
        let catalog = root.path().join("resources/catalog.sqlite");
        create_catalog(&catalog).await?;
        Ok(Self {
            data: root.path().join("local"),
            catalog,
            root,
        })
    }

    async fn start(
        &self,
        supervisor: &mut Supervisor,
    ) -> Result<popcorn_desktop::Bootstrap, popcorn_desktop::SupervisorError> {
        supervisor
            .start(
                std::path::Path::new(env!("CARGO_BIN_EXE_popcorn-server")),
                &self.catalog,
                &self.data,
                ORIGIN,
            )
            .await
    }
}

#[tokio::test]
async fn supervisor_reuses_live_process_and_authenticates_with_private_credential() -> TestResult {
    // Given
    let fixture = Fixture::new().await?;
    let mut supervisor = Supervisor::default();
    let first = fixture.start(&mut supervisor).await?;

    // When
    let second = fixture.start(&mut supervisor).await?;
    let response = timeout(Duration::from_secs(3), async {
        let mut socket = TcpStream::connect(first.address).await?;
        socket
            .write_all(
                format!(
                    "GET /health HTTP/1.1\r\nHost: {}\r\nOrigin: {ORIGIN}\r\nAuthorization: Bearer {}\r\nConnection: close\r\n\r\n",
                    first.address, first.token
                )
                .as_bytes(),
            )
            .await?;
        let mut response = String::new();
        socket.read_to_string(&mut response).await?;
        Ok::<_, std::io::Error>(response)
    })
    .await??;

    // Then
    assert_eq!(first.instance_id, second.instance_id);
    assert_eq!(first.token, second.token);
    assert!(!format!("{first:?} {supervisor:?}").contains(&first.token));
    assert!(response.starts_with("HTTP/1.1 200 "));
    assert!(response.contains("access-control-allow-origin: http://localhost:1420"));
    supervisor.stop().await?;
    Ok(())
}

#[tokio::test]
async fn supervisor_releases_data_and_rotates_credentials_after_restart() -> TestResult {
    // Given
    let fixture = Fixture::new().await?;
    let mut supervisor = Supervisor::default();
    let first = fixture.start(&mut supervisor).await?;
    let database = fixture.data.join("user.sqlite");
    let pool = sqlx::SqlitePool::connect_with(
        sqlx::sqlite::SqliteConnectOptions::new().filename(&database),
    )
    .await?;
    sqlx::query("INSERT INTO settings (key, value) VALUES ('test_preference', '42')")
        .execute(&pool)
        .await?;
    pool.close().await;
    supervisor.stop().await?;

    // When
    let second = fixture.start(&mut supervisor).await?;

    // Then
    assert_ne!(first.instance_id, second.instance_id);
    assert_ne!(first.token, second.token);
    let pool = sqlx::SqlitePool::connect_with(
        sqlx::sqlite::SqliteConnectOptions::new().filename(&database),
    )
    .await?;
    let saved: String =
        sqlx::query_scalar("SELECT value FROM settings WHERE key = 'test_preference'")
            .fetch_one(&pool)
            .await?;
    assert_eq!(saved, "42");
    pool.close().await;
    supervisor.stop().await?;
    supervisor.stop().await?;
    Ok(())
}

#[tokio::test]
async fn supervisor_can_retry_after_failed_initialization() -> TestResult {
    // Given
    let fixture = Fixture::new().await?;
    let mut supervisor = Supervisor::default();

    // When
    let failure = supervisor
        .start(
            std::path::Path::new(env!("CARGO_BIN_EXE_popcorn-server")),
            &fixture.catalog.with_file_name("missing.sqlite"),
            &fixture.data,
            ORIGIN,
        )
        .await;
    let restarted = fixture.start(&mut supervisor).await?;

    // Then
    assert!(failure.is_err());
    assert!(!restarted.catalog_version.is_empty());
    supervisor.stop().await?;
    Ok(())
}

fn raw_sidecar() -> std::io::Result<Child> {
    Command::new(env!("CARGO_BIN_EXE_popcorn-server"))
        .arg("sidecar")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
}

#[tokio::test]
async fn sidecar_exits_and_releases_data_when_shell_control_pipe_closes() -> TestResult {
    // Given
    let fixture = Fixture::new().await?;
    let mut child = raw_sidecar()?;
    let mut stdin = child.stdin.take().ok_or("missing private stdin")?;
    let initialization = json!({
        "event": "initialize",
        "catalog": fixture.catalog,
        "data_dir": fixture.data,
        "token": TOKEN,
        "origin": ORIGIN,
    });
    stdin
        .write_all(format!("{initialization}\n").as_bytes())
        .await?;
    let stdout = child.stdout.take().ok_or("missing readiness pipe")?;
    let mut stdout = BufReader::new(stdout);
    let mut line = String::new();
    timeout(Duration::from_secs(10), stdout.read_line(&mut line)).await??;
    let ready: Value = serde_json::from_str(&line)?;
    assert_eq!(ready["event"], "ready");
    assert!(!line.contains(TOKEN));

    // When
    drop(stdin);
    let output = timeout(Duration::from_secs(10), child.wait_with_output()).await??;

    // Then
    assert!(output.status.success());
    assert!(!String::from_utf8(output.stderr)?.contains(TOKEN));
    line.clear();
    timeout(Duration::from_secs(3), stdout.read_line(&mut line)).await??;
    assert_eq!(serde_json::from_str::<Value>(&line)?["event"], "stopped");
    let mut supervisor = Supervisor::default();
    fixture.start(&mut supervisor).await?;
    supervisor.stop().await?;
    Ok(())
}

#[tokio::test]
async fn sidecar_rejects_invalid_private_input_without_echoing_secret() -> TestResult {
    // Given
    let mut child = raw_sidecar()?;
    let mut stdin = child.stdin.take().ok_or("missing private stdin")?;

    // When
    stdin
        .write_all(format!("{{\"token\":\"{TOKEN}\",\"event\":\"invalid\"}}\n").as_bytes())
        .await?;
    drop(stdin);
    let output = timeout(Duration::from_secs(10), child.wait_with_output()).await??;

    // Then
    assert!(!output.status.success());
    assert!(output.stdout.is_empty());
    assert!(!String::from_utf8(output.stderr)?.contains(TOKEN));
    Ok(())
}

#[tokio::test]
async fn sidecar_exits_successfully_when_shell_closes_both_private_pipes() -> TestResult {
    // Given: the shell received readiness and then disappeared completely.
    let fixture = Fixture::new().await?;
    let mut child = raw_sidecar()?;
    let mut stdin = child.stdin.take().ok_or("missing private stdin")?;
    let initialization = json!({
        "event": "initialize",
        "catalog": fixture.catalog,
        "data_dir": fixture.data,
        "token": TOKEN,
        "origin": ORIGIN,
    });
    stdin
        .write_all(format!("{initialization}\n").as_bytes())
        .await?;
    let mut stdout = BufReader::new(child.stdout.take().ok_or("missing readiness pipe")?);
    let mut line = String::new();
    timeout(Duration::from_secs(10), stdout.read_line(&mut line)).await??;
    assert_eq!(serde_json::from_str::<Value>(&line)?["event"], "ready");

    // When
    drop(stdout);
    drop(stdin);
    let output = timeout(Duration::from_secs(10), child.wait_with_output()).await??;

    // Then: an undeliverable acknowledgement does not turn cleanup into failure.
    assert!(output.status.success());
    let stderr = String::from_utf8(output.stderr)?;
    assert!(!stderr.contains("\"level\":\"ERROR\""));
    assert!(!stderr.contains(TOKEN));
    let mut supervisor = Supervisor::default();
    fixture.start(&mut supervisor).await?;
    supervisor.stop().await?;
    Ok(())
}

#[cfg(unix)]
#[tokio::test]
async fn supervisor_discards_late_readiness_after_startup_deadline_before_retry() -> TestResult {
    use std::os::unix::fs::PermissionsExt;

    // Given: this child announces readiness only after it receives shutdown.
    // Time is the behavior under test; the child synchronizes through stdin.
    let fixture = Fixture::new().await?;
    let executable = fixture.root.path().join("late-sidecar");
    tokio::fs::write(
        &executable,
        b"#!/bin/sh\nread -r initialize\nread -r shutdown\nprintf '%s\\n' '{\"event\":\"ready\",\"address\":\"127.0.0.1:12345\",\"protocol_version\":\"bootstrap.v1\",\"instance_id\":\"00000000-0000-0000-0000-000000000001\",\"catalog_version\":\"late\"}'\n",
    )
    .await?;
    tokio::fs::set_permissions(&executable, std::fs::Permissions::from_mode(0o700)).await?;
    let mut supervisor = Supervisor::default();

    // When
    let expired = timeout(
        Duration::from_secs(30),
        supervisor.start(&executable, &fixture.catalog, &fixture.data, ORIGIN),
    )
    .await?;
    let current = fixture.start(&mut supervisor).await?;

    // Then: no readiness from the old pipe becomes the new connection.
    assert!(matches!(
        expired,
        Err(popcorn_desktop::SupervisorError::StartupTimeout)
    ));
    assert_ne!(current.catalog_version, "late");
    assert_ne!(
        current.instance_id.to_string(),
        "00000000-0000-0000-0000-000000000001"
    );
    supervisor.stop().await?;
    Ok(())
}
