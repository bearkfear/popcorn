//! Explicit catalog read requests and snapshot pagination results.
use crate::core::catalog::{
    Category, Cursor, MediaType, Page, PageSize, SearchQuery, TitleData, TitleId,
};
#[derive(Debug)]
pub(crate) struct BrowseTitles {
    pub(crate) media_type: MediaType,
    pub(crate) category: Category,
    pub(crate) page: Page,
    pub(crate) genre_id: u32,
}
#[derive(Debug)]
pub(crate) struct SearchTitles {
    pub(crate) media_type: MediaType,
    pub(crate) query: SearchQuery,
    pub(crate) page: Page,
}
#[derive(Debug)]
pub(crate) struct ListTitles {
    pub(crate) page_size: PageSize,
    pub(crate) cursor: Cursor,
}
#[derive(Debug)]
pub(crate) struct GetTitle {
    pub(crate) id: TitleId,
    pub(crate) use_tmdb: bool,
}
#[derive(Debug)]
pub(crate) struct SnapshotPage {
    pub(crate) titles: Vec<TitleData>,
    pub(crate) next_cursor: Option<Cursor>,
}
