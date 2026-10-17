//! Removes the configured TMDB connection and remembered credentials.

use crate::application::catalog::ports::MetadataProvider;
use crate::core::catalog::{CatalogError, ConnectionStatus};

#[derive(Debug)]
pub(crate) struct ClearTmdb;

pub(crate) async fn handle<M: MetadataProvider>(
    metadata: &M,
    _command: ClearTmdb,
) -> Result<ConnectionStatus, CatalogError> {
    metadata.clear().await
}
