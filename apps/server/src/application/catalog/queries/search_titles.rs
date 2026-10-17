//! Defines a catalog search and retrieves matching titles from metadata.

use crate::application::catalog::cached::Cached;
use crate::application::catalog::ports::MetadataProvider;
use crate::application::catalog::title_page::TitlePage;
use crate::core::catalog::{CatalogError, MediaType, Page, SearchQuery};

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
