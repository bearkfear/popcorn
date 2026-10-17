//! Retrieves one title from external metadata or the installed snapshot.

use crate::application::catalog::ports::{MetadataProvider, SnapshotQueries};
use crate::core::catalog::{Cached, CatalogError, TitleData, TitleId};

#[derive(Debug)]
pub(crate) struct GetTitle {
    pub(crate) id: TitleId,
    pub(crate) use_tmdb: bool,
}

pub(crate) async fn handle<M: MetadataProvider, S: SnapshotQueries>(
    metadata: &M,
    snapshot: &S,
    query: GetTitle,
) -> Result<Cached<TitleData>, CatalogError> {
    if query.use_tmdb {
        return metadata.title(query.id).await;
    }
    Ok(Cached {
        data: snapshot.title(query.id).await?,
        stale: false,
    })
}
