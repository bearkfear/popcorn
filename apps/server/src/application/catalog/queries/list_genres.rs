//! Retrieves cached genres for a requested media type.

use crate::application::catalog::ports::MetadataProvider;
use crate::core::catalog::{Cached, CatalogError, GenreData, MediaType};

#[derive(Debug)]
pub(crate) struct ListGenres {
    pub(crate) media: MediaType,
}

pub(crate) async fn handle<M: MetadataProvider>(
    metadata: &M,
    query: ListGenres,
) -> Result<Cached<Vec<GenreData>>, CatalogError> {
    metadata.genres(query.media).await
}
