//! Verifies persisted redaction, bounded retention and complete concurrent JSONL writes.

use super::DiagnosticLog;
use serde_json::{Value, json};
use std::{fs, sync::Arc};

#[test]
fn credentials_are_removed_but_decoder_failures_remain_readable()
-> Result<(), Box<dyn std::error::Error>> {
    let directory = tempfile::tempdir()?;
    let log = DiagnosticLog::open(directory.path(), "server")?;
    let token = "abcde0123456789abcde0123456789abcde0123456789abcde0123456789abcdef";
    log.record("media.process.exit", json!({ "token": "short-private-value",
        "nested": { "read_access_token": "tmdb-private-value" },
        "stderr": format!("Invalid NAL unit at http://127.0.0.1:1234/media/uuid?token={token}\nAuthorization: Bearer secret-bearer-value"),
        "codec": "h264", "exit_code": 1, "stream_generation": 12,
    }))?;
    log.record("media.error", json!({ "message": "read_access_token='private phrase' and {\"apiKey\":\"another private phrase\"}" }))?;
    let text = fs::read_to_string(directory.path().join("server.jsonl"))?;
    for secret in [
        token,
        "short-private-value",
        "tmdb-private-value",
        "secret-bearer-value",
        "http://127.0.0.1",
        "private phrase",
    ] {
        assert!(!text.contains(secret), "private value was persisted");
    }
    let event: Value = serde_json::from_str(text.lines().next().ok_or("missing log event")?)?;
    assert_eq!(event["data"]["exit_code"], 1);
    assert_eq!(event["data"]["codec"], "h264");
    assert!(
        event["data"]["stderr"]
            .as_str()
            .is_some_and(|s| s.contains("Invalid NAL unit"))
    );
    Ok(())
}

#[test]
fn rotation_retains_recent_complete_events_and_bounds_disk_usage()
-> Result<(), Box<dyn std::error::Error>> {
    let directory = tempfile::tempdir()?;
    let log = DiagnosticLog::open(directory.path(), "server")?;
    log.limit_for_test(700);
    for index in 0..30 {
        log.record(
            "test.event",
            json!({ "index": index, "message": "bounded output" }),
        )?;
    }
    let mut indices = Vec::new();
    let files = fs::read_dir(directory.path())?.collect::<Result<Vec<_>, _>>()?;
    assert!(files.len() <= 4);
    for entry in files {
        assert!(entry.metadata()?.len() <= 700);
        for line in fs::read_to_string(entry.path())?.lines() {
            let value: Value = serde_json::from_str(line)?;
            indices.push(value["data"]["index"].as_u64());
        }
    }
    assert!(indices.contains(&Some(29)));
    assert!(!indices.contains(&Some(0)));
    Ok(())
}

#[test]
fn simultaneous_events_never_interleave_or_lose_complete_lines()
-> Result<(), Box<dyn std::error::Error>> {
    let directory = tempfile::tempdir()?;
    let log = Arc::new(DiagnosticLog::open(directory.path(), "desktop")?);
    std::thread::scope(|scope| {
        for worker in 0..4 {
            let log = &log;
            scope.spawn(move || {
                for index in 0..20 {
                    assert!(
                        log.record("media.sample", json!({"worker":worker,"index":index}))
                            .is_ok()
                    );
                }
            });
        }
    });
    let text = fs::read_to_string(directory.path().join("desktop.jsonl"))?;
    assert_eq!(text.lines().count(), 80);
    for line in text.lines() {
        let _: Value = serde_json::from_str(line)?;
    }
    Ok(())
}

#[test]
fn malformed_destinations_and_oversized_events_fail_without_partial_records()
-> Result<(), Box<dyn std::error::Error>> {
    let directory = tempfile::tempdir()?;
    assert!(DiagnosticLog::open(directory.path(), "../escape").is_err());
    let log = DiagnosticLog::open(directory.path(), "server")?;
    assert!(
        log.record("test.large", json!({ "numbers": vec![12345; 20_000] }))
            .is_err()
    );
    assert!(fs::read_to_string(directory.path().join("server.jsonl"))?.is_empty());
    Ok(())
}

#[test]
fn child_stderr_fixture() {
    if std::env::var_os("POPCORN_DIAGNOSTIC_TEST_CHILD").is_none() {
        return;
    }
    use std::io::Write as _;
    let mut stderr = std::io::stderr().lock();
    assert!(stderr.write_all(&vec![b'x'; 131_072]).is_ok());
    assert!(writeln!(stderr, "\nInvalid NAL unit at http://127.0.0.1:1/media/private?token=short-secret\nAuthorization: Bearer fixture-private-value").is_ok());
    drop(stderr);
    std::process::exit(7);
}

#[tokio::test]
async fn failing_process_is_drained_and_persisted_with_bounded_redacted_stderr()
-> Result<(), Box<dyn std::error::Error>> {
    let directory = tempfile::tempdir()?;
    super::init(directory.path(), "server")?;
    let mut command = tokio::process::Command::new(std::env::current_exe()?);
    command
        .args([
            "--exact",
            "tests::child_stderr_fixture",
            "--nocapture",
            "--skip",
            "http://127.0.0.1:1/private?token=argument-secret",
        ])
        .env("POPCORN_DIAGNOSTIC_TEST_CHILD", "1")
        .stdout(std::process::Stdio::null());
    let context = super::ProcessContext {
        playback_id: uuid::Uuid::new_v4(),
        generation: Some(3),
        tool: "fixture",
    };
    let (mut child, mut log) = super::spawn(command, context)?;
    let status = tokio::time::timeout(std::time::Duration::from_secs(10), child.wait()).await??;
    log.finish(status).await;
    assert_eq!(status.code(), Some(7));
    let text = fs::read_to_string(directory.path().join("server.jsonl"))?;
    assert!(!text.contains("short-secret"));
    assert!(!text.contains("fixture-private-value"));
    assert!(!text.contains("argument-secret"));
    assert!(!text.contains("http://127.0.0.1"));
    let records = text
        .lines()
        .map(serde_json::from_str::<Value>)
        .collect::<Result<Vec<_>, _>>()?;
    let stderr = records
        .iter()
        .find(|r| r["event"] == "media.process.stderr")
        .ok_or("missing stderr record")?;
    assert!(
        stderr["data"]["stderr_bytes"]
            .as_u64()
            .is_some_and(|count| count > 131_072)
    );
    assert_eq!(stderr["data"]["discarded_lines"], 1);
    assert!(
        stderr["data"]["tail"]
            .to_string()
            .contains("Invalid NAL unit")
    );
    assert!(stderr["data"]["tail"].to_string().len() < 16_384);
    let exit = records
        .iter()
        .find(|r| r["event"] == "media.process.exit")
        .ok_or("missing process exit")?;
    assert_eq!(exit["data"]["exit_code"], 7);
    assert_eq!(exit["data"]["stream_generation"], 3);
    Ok(())
}
