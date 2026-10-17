//! Retrieves cached seasons for a requested television series.

use crate::application::catalog::ports::MetadataProvider;
use crate::core::catalog::{Cached, CatalogError, SeasonData, SeriesId};

#[derive(Debug)]
pub(crate) struct ListSeasons {
    pub(crate) series: SeriesId,
}

pub(crate) async fn handle<M: MetadataProvider>(
    metadata: &M,
    query: ListSeasons,
) -> Result<Cached<Vec<SeasonData>>, CatalogError> {
    metadata.seasons(query.series).await
}
