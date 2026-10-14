use popcorn_server::{Backend, Error, create_catalog};
use sqlx::{Connection, sqlite::SqliteConnectOptions};

use super::{Fixture, Running, TestResult};

#[tokio::test]
async fn local_settings_survive_backend_restart_without_changing_catalog() -> TestResult {
    // Given
    let fixture = Fixture::new().await?;
    let before = tokio::fs::read(&fixture.catalog).await?;
    let first = Running::start(&fixture).await?;
    first.stop().await?;
    let options = SqliteConnectOptions::new().filename(fixture.data.join("user.sqlite"));
    let mut connection = sqlx::SqliteConnection::connect_with(&options).await?;
    sqlx::query("INSERT INTO settings (key, value) VALUES (?, ?)")
        .bind("download_directory")
        .bind("\"selected-directory\"")
        .execute(&mut connection)
        .await?;
    connection.close().await?;

    // When
    let restarted = Running::start(&fixture).await?;

    // Then
    let mut connection = sqlx::SqliteConnection::connect_with(&options).await?;
    let setting: String = sqlx::query_scalar("SELECT value FROM settings WHERE key = ?")
        .bind("download_directory")
        .fetch_one(&mut connection)
        .await?;
    assert_eq!(setting, "\"selected-directory\"");
    connection.close().await?;
    restarted.stop().await?;
    assert_eq!(tokio::fs::read(&fixture.catalog).await?, before);
    Ok(())
}

#[tokio::test]
async fn second_backend_is_rejected_while_data_directory_is_owned() -> TestResult {
    // Given
    let fixture = Fixture::new().await?;
    let first = Running::start(&fixture).await?;

    // When
    let second = Backend::prepare(fixture.config()).await;

    // Then
    assert!(matches!(second, Err(Error::DataDirectoryBusy)));
    first.stop().await?;
    Ok(())
}

#[tokio::test]
async fn incompatible_catalog_fails_before_creating_user_database() -> TestResult {
    // Given
    let fixture = Fixture::new().await?;
    let options = SqliteConnectOptions::new().filename(&fixture.catalog);
    let mut connection = sqlx::SqliteConnection::connect_with(&options).await?;
    sqlx::query("PRAGMA user_version = 999")
        .execute(&mut connection)
        .await?;
    connection.close().await?;

    // When
    let backend = Backend::prepare(fixture.config()).await;

    // Then
    assert!(matches!(backend, Err(Error::UnsupportedCatalogSchema(999))));
    assert!(!fixture.data.join("user.sqlite").exists());
    Ok(())
}

#[tokio::test]
async fn missing_catalog_is_not_created_implicitly() -> TestResult {
    // Given
    let fixture = Fixture::new().await?;
    tokio::fs::remove_file(&fixture.catalog).await?;

    // When
    let backend = Backend::prepare(fixture.config()).await;

    // Then
    assert!(matches!(backend, Err(Error::Io(_))));
    assert!(!fixture.catalog.exists());
    assert!(!fixture.data.join("user.sqlite").exists());
    Ok(())
}

#[tokio::test]
async fn catalog_creation_preserves_an_existing_snapshot() -> TestResult {
    // Given
    let fixture = Fixture::new().await?;
    let before = tokio::fs::read(&fixture.catalog).await?;

    // When
    let result = create_catalog(&fixture.catalog).await;

    // Then
    assert!(matches!(result, Err(Error::PublishCatalog(_))));
    assert_eq!(tokio::fs::read(&fixture.catalog).await?, before);
    Ok(())
}

#[tokio::test]
async fn invalid_token_is_rejected_before_creating_user_data() -> TestResult {
    // Given
    let fixture = Fixture::new().await?;
    tokio::fs::write(&fixture.token, "not-a-secret").await?;

    // When
    let backend = Backend::prepare(fixture.config()).await;

    // Then
    assert!(matches!(backend, Err(Error::InvalidToken)));
    assert!(!fixture.data.exists());
    Ok(())
}

#[tokio::test]
async fn user_database_hard_link_to_catalog_is_rejected_without_modifying_snapshot() -> TestResult {
    // Given
    let fixture = Fixture::new().await?;
    let before = tokio::fs::read(&fixture.catalog).await?;
    tokio::fs::create_dir_all(&fixture.data).await?;
    tokio::fs::hard_link(&fixture.catalog, fixture.data.join("user.sqlite")).await?;

    // When
    let backend = Backend::prepare(fixture.config()).await;

    // Then
    assert!(matches!(backend, Err(Error::InvalidUserDatabase)));
    assert_eq!(tokio::fs::read(&fixture.catalog).await?, before);
    Ok(())
}

#[cfg(unix)]
#[tokio::test]
async fn user_database_symlink_to_catalog_is_rejected_without_modifying_snapshot() -> TestResult {
    // Given
    let fixture = Fixture::new().await?;
    let before = tokio::fs::read(&fixture.catalog).await?;
    tokio::fs::create_dir_all(&fixture.data).await?;
    tokio::fs::symlink(&fixture.catalog, fixture.data.join("user.sqlite")).await?;

    // When
    let backend = Backend::prepare(fixture.config()).await;

    // Then
    assert!(matches!(backend, Err(Error::InvalidUserDatabase)));
    assert_eq!(tokio::fs::read(&fixture.catalog).await?, before);
    Ok(())
}
