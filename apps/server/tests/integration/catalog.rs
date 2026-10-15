use std::{path::Path, time::Duration};

use popcorn_server::{Backend, ServerConfig};
use sqlx::{SqlitePool, sqlite::SqliteConnectOptions};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpStream,
    process::Command,
    sync::oneshot,
};

use super::{Fixture, Running, TOKEN, TestResult};

const ORIGIN: &str = "http://localhost:1420";

async fn browser_server(fixture: &Fixture) -> TestResult<Running> {
    let config = ServerConfig::from_private_channel(
        fixture.catalog.clone(),
        fixture.data.clone(),
        TOKEN.as_bytes(),
        ORIGIN.into(),
    )?;
    let backend = Backend::prepare(config).await?;
    let ready = backend.ready().clone();
    let (shutdown, signal) = oneshot::channel();
    let task = tokio::spawn(backend.run(async move {
        assert!(signal.await.is_ok());
    }));
    Ok(Running {
        ready,
        shutdown,
        task,
    })
}

async fn sdk_probe(server: &Running, seeded: bool) -> TestResult<std::process::Output> {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let output = tokio::time::timeout(
        Duration::from_secs(30),
        Command::new("bun")
            .arg("run")
            .arg("packages/sdk/tests/catalog-client.ts")
            .env("CATALOG_URL", format!("http://{}", server.ready.address))
            .env("CATALOG_TOKEN", TOKEN)
            .env("CATALOG_ORIGIN", ORIGIN)
            .env("CATALOG_SEEDED", if seeded { "1" } else { "0" })
            .current_dir(root)
            .kill_on_drop(true)
            .output(),
    )
    .await??;
    Ok(output)
}

#[tokio::test]
async fn official_clients_read_empty_snapshot_and_errors() -> TestResult {
    // Given: the default snapshot is honestly empty.
    let fixture = Fixture::new().await?;
    let before = tokio::fs::read(&fixture.catalog).await?;
    let server = browser_server(&fixture).await?;

    // When: official Connect ES clients exercise binary and JSON RPC.
    let result = sdk_probe(&server, false).await;
    server.stop().await?;
    let output = result?;

    // Then: errors are typed, the catalog is empty and the snapshot is untouched.
    assert!(
        output.status.success(),
        "{}\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    assert_eq!(tokio::fs::read(&fixture.catalog).await?, before);
    Ok(())
}

#[tokio::test]
async fn official_clients_read_paginated_snapshot_and_title_details() -> TestResult {
    // Given: synthetic metadata exists only in this temporary test snapshot.
    let fixture = Fixture::new().await?;
    let pool =
        SqlitePool::connect_with(SqliteConnectOptions::new().filename(&fixture.catalog)).await?;
    sqlx::raw_sql(
        "WITH RECURSIVE ids(id) AS (
            SELECT 1 UNION ALL SELECT id + 1 FROM ids WHERE id < 102
         )
         INSERT INTO catalog_contents
         SELECT 1, id, 'Synthetic catalog fixture', 'Integration test only', 2026 FROM ids;
         INSERT INTO catalog_contents VALUES
         (2, 1, 'Synthetic TV fixture', 'Integration test only', 2025),
         (2, 2, 'Synthetic TV fixture', 'Integration test only', 2025);",
    )
    .execute(&pool)
    .await?;
    pool.close().await;
    let before = tokio::fs::read(&fixture.catalog).await?;
    let server = browser_server(&fixture).await?;

    // When: the generated clients read pages and fetch a listed content reference.
    let result = sdk_probe(&server, true).await;
    server.stop().await?;
    let output = result?;

    // Then: deterministic pagination, all fields and error codes survive both codecs.
    assert!(
        output.status.success(),
        "{}\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    assert_eq!(tokio::fs::read(&fixture.catalog).await?, before);
    Ok(())
}

#[tokio::test]
async fn rpc_rejects_multiple_matching_origin_headers() -> TestResult {
    // Given: two separate Origin fields both name the configured desktop.
    let fixture = Fixture::new().await?;
    let server = browser_server(&fixture).await?;
    let address = server.ready.address;
    let message = format!(
        "POST /popcorn.v1.CatalogService/ListTitles HTTP/1.1\r\n\
         Host: {address}\r\nAuthorization: Bearer {TOKEN}\r\n\
         Origin: {ORIGIN}\r\nOrigin: {ORIGIN}\r\n\
         Content-Type: application/json\r\nContent-Length: 2\r\n\
         Connection: close\r\n\r\n{{}}"
    );

    // When: the actual listener receives duplicate headers, not a merged value.
    let result = tokio::time::timeout(Duration::from_secs(3), async {
        let mut stream = TcpStream::connect(address).await?;
        stream.write_all(message.as_bytes()).await?;
        let mut response = String::new();
        stream.read_to_string(&mut response).await?;
        Ok::<_, std::io::Error>(response)
    })
    .await;
    server.stop().await?;

    // Then: duplicates cannot bypass the exact-origin policy.
    assert!(result??.starts_with("HTTP/1.1 403 "));
    Ok(())
}

#[tokio::test]
async fn startup_rejects_legacy_metadata_only_snapshot() -> TestResult {
    // Given: a snapshot with the original metadata-only schema and version.
    let fixture = Fixture::new().await?;
    let pool =
        SqlitePool::connect_with(SqliteConnectOptions::new().filename(&fixture.catalog)).await?;
    sqlx::raw_sql(
        "DROP TABLE catalog_contents;
         DROP TABLE catalog_metadata;
         PRAGMA user_version = 1;
         CREATE TABLE catalog_metadata (
             singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
             schema_version INTEGER NOT NULL CHECK (schema_version = 1),
             catalog_version TEXT NOT NULL CHECK (length(catalog_version) > 0)
         ) STRICT;
         INSERT INTO catalog_metadata VALUES (1, 1, 'foundation-1');",
    )
    .execute(&pool)
    .await?;
    pool.close().await;

    // When: preparation validates the installed snapshot before readiness.
    let result = Backend::prepare(fixture.config()).await;

    // Then: legacy schema cannot announce ready and later fail a catalog RPC.
    assert!(matches!(
        result,
        Err(popcorn_server::Error::UnsupportedCatalogSchema(1))
    ));
    Ok(())
}

#[tokio::test]
async fn startup_rejects_missing_catalog_table_or_column() -> TestResult {
    for damage in [
        "DROP TABLE catalog_contents",
        "ALTER TABLE catalog_contents DROP COLUMN overview",
    ] {
        // Given: the current version claims compatibility but lacks required shape.
        let fixture = Fixture::new().await?;
        let pool = SqlitePool::connect_with(SqliteConnectOptions::new().filename(&fixture.catalog))
            .await?;
        sqlx::query(damage).execute(&pool).await?;
        pool.close().await;

        // When: preparation probes the required columns, even in an empty catalog.
        let result = Backend::prepare(fixture.config()).await;

        // Then: the incomplete snapshot is rejected before a listener is ready.
        assert!(matches!(
            result,
            Err(popcorn_server::Error::Database(sqlx::Error::Database(_)))
        ));
    }
    Ok(())
}
