//! Download cache quota persistence and symlink-aware disk operations.

use std::path::{Path, PathBuf};

use sqlx::SqlitePool;

use crate::{
    application::media::{Cache, MediaError},
    core::media::{CacheSettings, DEFAULT_CACHE_LIMIT},
};

#[derive(Debug)]
pub(crate) struct DiskCache {
    pool: SqlitePool,
    directory: PathBuf,
}

impl DiskCache {
    pub(super) const fn new(pool: SqlitePool, directory: PathBuf) -> Self {
        Self { pool, directory }
    }
}

impl Cache for DiskCache {
    async fn settings(&self) -> Result<CacheSettings, MediaError> {
        let path = self.directory.clone();
        let used_bytes = tokio::task::spawn_blocking(move || directory_size(&path))
            .await
            .map_err(|_| MediaError::Unavailable)?
            .map_err(|_| MediaError::Unavailable)?;
        Ok(CacheSettings {
            directory: self.directory.to_string_lossy().into_owned(),
            limit_bytes: self.limit().await?,
            used_bytes,
        })
    }

    async fn set_limit(&self, bytes: u64) -> Result<(), MediaError> {
        sqlx::query(
            "INSERT INTO settings (key, value) VALUES ('cache_limit_bytes', ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        )
        .bind(bytes.to_string())
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn clear(&self) -> Result<(), MediaError> {
        match tokio::fs::symlink_metadata(&self.directory).await {
            Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_dir() => {
                return Err(MediaError::Unavailable);
            }
            Ok(_) => tokio::fs::remove_dir_all(&self.directory)
                .await
                .map_err(|_| MediaError::Unavailable)?,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => return Err(MediaError::Unavailable),
        }
        tokio::fs::create_dir_all(&self.directory)
            .await
            .map_err(|_| MediaError::Unavailable)?;
        Ok(())
    }

    async fn limit(&self) -> Result<u64, MediaError> {
        let value: Option<String> =
            sqlx::query_scalar("SELECT value FROM settings WHERE key = 'cache_limit_bytes'")
                .fetch_optional(&self.pool)
                .await?;
        Ok(value
            .and_then(|value| value.parse().ok())
            .unwrap_or(DEFAULT_CACHE_LIMIT))
    }
}

fn directory_size(path: &Path) -> std::io::Result<u64> {
    let metadata = match std::fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(0),
        Err(error) => return Err(error),
    };
    if metadata.file_type().is_symlink() {
        return Err(std::io::Error::other("cache root cannot be a symlink"));
    }
    if metadata.is_file() {
        return Ok(metadata.len());
    }
    let mut total = 0u64;
    for entry in std::fs::read_dir(path)? {
        let entry = entry?;
        let metadata = std::fs::symlink_metadata(entry.path())?;
        if metadata.file_type().is_symlink() {
            continue;
        }
        total = total.saturating_add(if metadata.is_dir() {
            directory_size(&entry.path())?
        } else {
            metadata.len()
        });
    }
    Ok(total)
}
