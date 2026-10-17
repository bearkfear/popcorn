//! Configures the TMDB connection and its credential persistence policy.

use crate::application::catalog::ports::MetadataProvider;
use crate::core::catalog::{CatalogError, ConnectionStatus};

#[derive(Debug)]
pub(crate) struct ConfigureTmdb<'a> {
    pub(crate) token: &'a str,
    pub(crate) remember: bool,
}

pub(crate) async fn handle<M: MetadataProvider>(
    metadata: &M,
    command: ConfigureTmdb<'_>,
) -> Result<ConnectionStatus, CatalogError> {
    metadata.configure(command).await
}
