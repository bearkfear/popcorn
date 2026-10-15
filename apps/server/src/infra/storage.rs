//! Opens local databases and holds the exclusive user-data directory lock.

use std::{
    fs::{File, OpenOptions, TryLockError},
    path::Path,
    time::Duration,
};

use sqlx::{
    SqlitePool,
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions},
};

use crate::{Error, infra::catalog};

#[derive(Debug)]
pub(crate) struct Storage {
    pub(crate) catalog: SqlitePool,
    pub(crate) user: SqlitePool,
    pub(crate) catalog_version: String,
    _directory_lock: File,
}

impl Storage {
    pub(crate) async fn open(data_dir: &Path, catalog_path: &Path) -> Result<Self, Error> {
        tokio::fs::create_dir_all(data_dir).await?;
        let data_dir = tokio::fs::canonicalize(data_dir).await?;
        let catalog_path = tokio::fs::canonicalize(catalog_path).await?;
        if catalog_path.starts_with(&data_dir) {
            return Err(Error::CatalogInDataDirectory);
        }
        let lock_path = data_dir.join(".popcorn.lock");
        let directory_lock =
            tokio::task::spawn_blocking(move || lock_directory(&lock_path)).await??;
        let user_path = data_dir.join("user.sqlite");
        validate_user_path(&user_path, &catalog_path).await?;
        let (catalog, catalog_version) = catalog::open(&catalog_path).await?;
        let user = match open_user(&user_path).await {
            Ok(pool) => pool,
            Err(error) => {
                catalog.close().await;
                return Err(error);
            }
        };
        Ok(Self {
            catalog,
            user,
            catalog_version,
            _directory_lock: directory_lock,
        })
    }

    pub(crate) async fn close(self) {
        self.catalog.close().await;
        self.user.close().await;
    }
}

async fn validate_user_path(user_path: &Path, catalog_path: &Path) -> Result<(), Error> {
    match tokio::fs::symlink_metadata(user_path).await {
        Ok(metadata) => {
            if !metadata.is_file() {
                return Err(Error::InvalidUserDatabase);
            }
            let user_path = user_path.to_path_buf();
            let catalog_path = catalog_path.to_path_buf();
            let aliases = tokio::task::spawn_blocking(move || {
                same_file::is_same_file(user_path, catalog_path)
            })
            .await??;
            if aliases {
                return Err(Error::InvalidUserDatabase);
            }
            Ok(())
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(Error::Io(error)),
    }
}

fn lock_directory(path: &Path) -> Result<File, Error> {
    let file = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(path)?;
    match file.try_lock() {
        Ok(()) => Ok(file),
        Err(TryLockError::WouldBlock) => Err(Error::DataDirectoryBusy),
        Err(TryLockError::Error(error)) => Err(Error::Io(error)),
    }
}

async fn open_user(path: &Path) -> Result<SqlitePool, Error> {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .acquire_timeout(Duration::from_secs(3))
        .connect_with(
            SqliteConnectOptions::new()
                .filename(path)
                .create_if_missing(true)
                .foreign_keys(true)
                .journal_mode(SqliteJournalMode::Wal)
                .busy_timeout(Duration::from_secs(3)),
        )
        .await?;
    match sqlx::migrate!("./migrations").run(&pool).await {
        Ok(()) => Ok(pool),
        Err(error) => {
            pool.close().await;
            Err(Error::Migration(error))
        }
    }
}
