//! Reads the sources bound to a requested content identity.

use crate::application::media::{Cache, MediaError, Sources, Transfers, context::MediaContext};
use crate::core::media::{Content, Source};

pub(crate) struct ListSources<'a> {
    pub(crate) content: &'a Content,
}

pub(crate) async fn handle<R: Sources, T: Transfers, C: Cache>(
    context: &MediaContext<R, T, C>,
    query: ListSources<'_>,
) -> Result<Vec<Source>, MediaError> {
    context.sources.list(query.content).await
}
