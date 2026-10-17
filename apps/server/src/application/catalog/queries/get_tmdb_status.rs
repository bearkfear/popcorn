//! Reads whether the TMDB connection is configured and remembered.

use crate::application::catalog::connection_status::ConnectionStatus;
use crate::application::catalog::ports::MetadataProvider;

#[derive(Debug)]
pub(crate) struct GetTmdbStatus;

pub(crate) async fn handle<M: MetadataProvider>(
    metadata: &M,
    _query: GetTmdbStatus,
) -> ConnectionStatus {
    metadata.status().await
}
