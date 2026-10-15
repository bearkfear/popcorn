//! Wires catalog use cases to metadata and snapshot infrastructure adapters.

use std::{path::PathBuf, sync::Arc};

use crate::{
    Error,
    application::catalog::Catalog,
    infra::{
        catalog::{SqliteSnapshot, tmdb::Tmdb},
        storage::Storage,
    },
};

pub(super) type BackendCatalog = Catalog<Tmdb, SqliteSnapshot>;

pub(super) async fn catalog(
    storage: &Storage,
    token_file: PathBuf,
    token: Option<String>,
    base_url: &str,
) -> Result<Arc<BackendCatalog>, Error> {
    let tmdb = Tmdb::new(storage.user.clone(), token_file, token, base_url)
        .await
        .map_err(|_| Error::TmdbConfiguration)?;
    Ok(Arc::new(Catalog::new(
        Arc::new(tmdb),
        SqliteSnapshot::new(storage.catalog.clone()),
    )))
}
