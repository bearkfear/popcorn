//! Immutable `SQLite` snapshot lifecycle.

use std::{path::Path, time::Duration};

use sqlx::{
    SqlitePool,
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions},
};

use crate::Error;

const SCHEMA_VERSION: i64 = 2;

pub(crate) async fn open(path: &Path) -> Result<(SqlitePool, String), Error> {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .acquire_timeout(Duration::from_secs(3))
        .connect_with(
            SqliteConnectOptions::new()
                .filename(path)
                .read_only(true)
                .busy_timeout(Duration::from_secs(3)),
        )
        .await?;
    match validate(&pool).await {
        Ok(version) => Ok((pool, version)),
        Err(error) => {
            pool.close().await;
            Err(error)
        }
    }
}

async fn validate(pool: &SqlitePool) -> Result<String, Error> {
    let schema: i64 = sqlx::query_scalar("PRAGMA user_version")
        .fetch_one(pool)
        .await?;
    if schema != SCHEMA_VERSION {
        return Err(Error::UnsupportedCatalogSchema(schema));
    }
    let integrity: String = sqlx::query_scalar("PRAGMA quick_check")
        .fetch_one(pool)
        .await?;
    if integrity != "ok" {
        return Err(Error::InvalidCatalog);
    }
    sqlx::query(
        "SELECT media_type, tmdb_id, title, overview, release_year
         FROM catalog_contents LIMIT 0",
    )
    .execute(pool)
    .await?;
    let rows: Vec<(i64, String)> =
        sqlx::query_as("SELECT schema_version, catalog_version FROM catalog_metadata LIMIT 2")
            .fetch_all(pool)
            .await?;
    match rows.as_slice() {
        [(version, name)] if *version == SCHEMA_VERSION && !name.trim().is_empty() => {
            Ok(name.clone())
        }
        _ => Err(Error::InvalidCatalogMetadata),
    }
}

/// Creates an empty, versioned bootstrap catalog without overwriting a file.
///
/// The snapshot has the catalog schema and version metadata but no content rows.
///
/// # Errors
///
/// Returns an error if the directory, `SQLite` schema or atomic publication fails.
pub async fn create_catalog(output: &Path) -> Result<(), Error> {
    let parent = output
        .parent()
        .filter(|path| !path.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    tokio::fs::create_dir_all(parent).await?;
    let parent = parent.to_path_buf();
    let snapshot =
        tokio::task::spawn_blocking(move || tempfile::NamedTempFile::new_in(parent)).await??;
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .acquire_timeout(Duration::from_secs(3))
        .connect_with(
            SqliteConnectOptions::new()
                .filename(snapshot.path())
                .journal_mode(SqliteJournalMode::Delete),
        )
        .await?;
    let result = sqlx::raw_sql(include_str!("../../../../../resources/catalog.sql"))
        .execute(&pool)
        .await;
    pool.close().await;
    result?;
    let output = output.to_path_buf();
    tokio::task::spawn_blocking(move || snapshot.persist_noclobber(output)).await??;
    Ok(())
}
