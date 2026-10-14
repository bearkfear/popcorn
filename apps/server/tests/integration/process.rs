use std::{process::Stdio, time::Duration};

use serde_json::Value;
use tokio::{io::AsyncBufReadExt, process::Command};

use super::{Fixture, Running, TOKEN, TestResult, request};

#[tokio::test]
async fn executable_announces_readiness_and_releases_data_after_sigterm() -> TestResult {
    terminates_after_readiness("-TERM").await
}

#[tokio::test]
async fn executable_announces_readiness_and_releases_data_after_sigint() -> TestResult {
    terminates_after_readiness("-INT").await
}

async fn terminates_after_readiness(signal: &str) -> TestResult {
    // Given
    let fixture = Fixture::new().await?;
    let mut child = Command::new(env!("CARGO_BIN_EXE_popcorn-server"))
        .arg("serve")
        .arg("--catalog")
        .arg(&fixture.catalog)
        .arg("--data-dir")
        .arg(&fixture.data)
        .arg("--token-file")
        .arg(&fixture.token)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| std::io::Error::other("missing child stdout"))?;
    let mut reader = tokio::io::BufReader::new(stdout);
    let mut line = String::new();
    tokio::time::timeout(Duration::from_secs(10), reader.read_line(&mut line)).await??;
    let event: Value = serde_json::from_str(&line)?;
    assert_eq!(event["event"], "ready");
    assert_eq!(event["protocol_version"], "bootstrap.v1");
    assert!(!line.contains(TOKEN));
    let address = event["address"]
        .as_str()
        .ok_or_else(|| std::io::Error::other("missing listener address"))?
        .parse()?;
    let response = request(
        address,
        &format!("Host: {address}\r\nAuthorization: Bearer {TOKEN}\r\n"),
    )
    .await?;
    assert!(response.starts_with("HTTP/1.1 200 "));
    let pid = child
        .id()
        .ok_or_else(|| std::io::Error::other("missing process ID"))?;

    // When
    let signal = Command::new("kill")
        .args([signal, &pid.to_string()])
        .status()
        .await?;
    assert!(signal.success());
    let output = tokio::time::timeout(Duration::from_secs(10), child.wait_with_output()).await??;

    // Then
    assert!(output.status.success());
    assert!(!String::from_utf8(output.stderr)?.contains(TOKEN));
    let restarted = Running::start(&fixture).await?;
    restarted.stop().await?;
    Ok(())
}

#[tokio::test]
async fn executable_rejects_a_second_process_with_the_same_data_directory() -> TestResult {
    // Given
    let fixture = Fixture::new().await?;
    let first = Running::start(&fixture).await?;
    let mut command = Command::new(env!("CARGO_BIN_EXE_popcorn-server"));
    command
        .arg("serve")
        .arg("--catalog")
        .arg(&fixture.catalog)
        .arg("--data-dir")
        .arg(&fixture.data)
        .arg("--token-file")
        .arg(&fixture.token)
        .kill_on_drop(true);

    // When
    let output = tokio::time::timeout(Duration::from_secs(10), command.output()).await??;

    // Then
    assert!(!output.status.success());
    assert!(output.stdout.is_empty());
    first.stop().await?;
    Ok(())
}
