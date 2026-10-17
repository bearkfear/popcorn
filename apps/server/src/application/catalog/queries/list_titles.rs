//! Defines snapshot pagination, its result page and the handler that reads it.

use crate::application::catalog::ports::SnapshotQueries;
use crate::core::catalog::{CatalogError, Cursor, PageSize, TitleData};

#[derive(Debug)]
pub(crate) struct ListTitles {
    pub(crate) page_size: PageSize,
    pub(crate) cursor: Cursor,
}

#[derive(Debug)]
pub(crate) struct SnapshotPage {
    pub(crate) titles: Vec<TitleData>,
    pub(crate) next_cursor: Option<Cursor>,
}

pub(crate) async fn handle<S: SnapshotQueries>(
    snapshot: &S,
    query: ListTitles,
) -> Result<SnapshotPage, CatalogError> {
    snapshot.list(query).await
}
