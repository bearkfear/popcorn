//! Retrieves cached episodes for a requested series and season.

use crate::application::catalog::ports::MetadataProvider;
use crate::core::catalog::{Cached, CatalogError, EpisodeData, EpisodeSelection};

#[derive(Debug)]
pub(crate) struct ListEpisodes {
    pub(crate) selection: EpisodeSelection,
}

pub(crate) async fn handle<M: MetadataProvider>(
    metadata: &M,
    query: ListEpisodes,
) -> Result<Cached<Vec<EpisodeData>>, CatalogError> {
    metadata.episodes(query.selection).await
}
