use serde_json::Value;

use super::{Fixture, Running, TOKEN, TestResult, request};

#[tokio::test]
async fn health_reports_ready_instance_when_authenticated() -> TestResult {
    // Given
    let fixture = Fixture::new().await?;
    let server = Running::start(&fixture).await?;
    let address = server.ready.address;
    let headers = format!("Host: {address}\r\nAuthorization: Bearer {TOKEN}\r\n");

    // When
    let response = request(address, &headers).await?;

    // Then
    assert!(response.starts_with("HTTP/1.1 200 "));
    let (_, body) = response
        .split_once("\r\n\r\n")
        .ok_or_else(|| std::io::Error::other("missing HTTP body"))?;
    let health: Value = serde_json::from_str(body)?;
    assert_eq!(health["status"], "ok");
    assert_eq!(health["catalog_version"], server.ready.catalog_version);
    assert_eq!(health["instance_id"], server.ready.instance_id.to_string());
    assert_eq!(address.ip(), std::net::Ipv4Addr::LOCALHOST);
    server.stop().await?;
    Ok(())
}

#[tokio::test]
async fn health_rejects_missing_or_incorrect_credentials() -> TestResult {
    // Given
    let fixture = Fixture::new().await?;
    let server = Running::start(&fixture).await?;
    let address = server.ready.address;
    let cases = [
        format!("Host: {address}\r\n"),
        format!("Host: {address}\r\nAuthorization: Bearer wrong\r\n"),
        format!(
            "Host: {address}\r\nAuthorization: Bearer {TOKEN}\r\nAuthorization: Bearer {TOKEN}\r\n"
        ),
    ];

    for headers in cases {
        // When
        let response = request(address, &headers).await?;
        // Then
        assert!(response.starts_with("HTTP/1.1 401 "));
    }
    server.stop().await?;
    Ok(())
}

#[tokio::test]
async fn health_rejects_foreign_host_or_browser_origin() -> TestResult {
    // Given
    let fixture = Fixture::new().await?;
    let server = Running::start(&fixture).await?;
    let address = server.ready.address;
    let cases = [
        format!("Host: foreign.example\r\nAuthorization: Bearer {TOKEN}\r\n"),
        format!(
            "Host: {address}\r\nOrigin: https://foreign.example\r\nAuthorization: Bearer {TOKEN}\r\n"
        ),
    ];

    for headers in cases {
        // When
        let response = request(address, &headers).await?;
        // Then
        assert!(response.starts_with("HTTP/1.1 403 "));
    }
    server.stop().await?;
    Ok(())
}
