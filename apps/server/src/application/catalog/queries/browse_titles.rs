//! Defines catalog browsing criteria and retrieves a cached title page.

use crate::application::catalog::ports::MetadataProvider;
use crate::core::catalog::{Cached, CatalogError, Category, MediaType, Page, TitlePage};

#[derive(Debug)]
pub(crate) struct BrowseTitles {
    pub(crate) media_type: MediaType,
    pub(crate) category: Category,
    pub(crate) page: Page,
    pub(crate) genre_id: u32,
}

pub(crate) async fn handle<M: MetadataProvider>(
    metadata: &M,
    query: BrowseTitles,
) -> Result<Cached<TitlePage>, CatalogError> {
    metadata.browse(query).await
}
