//! Defines a catalog search and retrieves matching titles from metadata.

use crate::application::catalog::ports::MetadataProvider;
use crate::core::catalog::{Cached, CatalogError, MediaType, Page, SearchQuery, TitlePage};

#[derive(Debug)]
pub(crate) struct SearchTitles {
    pub(crate) media_type: MediaType,
    pub(crate) query: SearchQuery,
    pub(crate) page: Page,
}

pub(crate) async fn handle<M: MetadataProvider>(
    metadata: &M,
    query: SearchTitles,
) -> Result<Cached<TitlePage>, CatalogError> {
    metadata.search(query).await
}
