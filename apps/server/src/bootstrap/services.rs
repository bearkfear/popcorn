//! Wires catalog use cases to metadata and snapshot infrastructure adapters.

use std::{path::PathBuf, sync::Arc};

use crate::{
    Error,
    infra::{
        catalog::{SqliteSnapshot, tmdb::Tmdb},
        storage::Storage,
    },
};

#[derive(Debug)]
pub(super) struct BackendCatalog {
    pub(super) metadata: Arc<Tmdb>,
    pub(super) snapshot: Arc<SqliteSnapshot>,
}

pub(super) async fn catalog(
    storage: &Storage,
    token_file: PathBuf,
    token: Option<String>,
    base_url: &str,
) -> Result<BackendCatalog, Error> {
    let tmdb = Tmdb::new(storage.user.clone(), token_file, token, base_url)
        .await
        .map_err(|_| Error::TmdbConfiguration)?;
    Ok(BackendCatalog {
        metadata: Arc::new(tmdb),
        snapshot: Arc::new(SqliteSnapshot::new(storage.catalog.clone())),
    })
}
