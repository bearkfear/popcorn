//! Reads whether the TMDB connection is configured and remembered.

use crate::application::catalog::ports::MetadataProvider;
use crate::core::catalog::ConnectionStatus;

#[derive(Debug)]
pub(crate) struct GetTmdbStatus;

pub(crate) async fn handle<M: MetadataProvider>(
    metadata: &M,
    _query: GetTmdbStatus,
) -> ConnectionStatus {
    metadata.status().await
}
