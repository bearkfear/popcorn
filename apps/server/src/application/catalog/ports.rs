//! External metadata and immutable snapshot boundaries.

use super::{
    commands::ConfigureTmdb,
    queries::{BrowseTitles, ListTitles, SearchTitles},
};
use crate::application::catalog::cached::Cached;
use crate::application::catalog::connection_status::ConnectionStatus;
use crate::application::catalog::queries::list_titles::SnapshotPage;
use crate::application::catalog::title_page::TitlePage;
use crate::core::catalog::{
    CatalogError, EpisodeData, EpisodeSelection, GenreData, MediaType, SeasonData, SeriesId,
    TitleData, TitleId,
};
use std::future::Future;

pub(crate) trait MetadataProvider: Send + Sync {
    fn browse(
        &self,
        query: BrowseTitles,
    ) -> impl Future<Output = Result<Cached<TitlePage>, CatalogError>> + Send;
    fn search(
        &self,
        query: SearchTitles,
    ) -> impl Future<Output = Result<Cached<TitlePage>, CatalogError>> + Send;
    fn title(
        &self,
        id: TitleId,
    ) -> impl Future<Output = Result<Cached<TitleData>, CatalogError>> + Send;
    fn genres(
        &self,
        media: MediaType,
    ) -> impl Future<Output = Result<Cached<Vec<GenreData>>, CatalogError>> + Send;
    fn seasons(
        &self,
        series: SeriesId,
    ) -> impl Future<Output = Result<Cached<Vec<SeasonData>>, CatalogError>> + Send;
    fn episodes(
        &self,
        selection: EpisodeSelection,
    ) -> impl Future<Output = Result<Cached<Vec<EpisodeData>>, CatalogError>> + Send;
    fn status(&self) -> impl Future<Output = ConnectionStatus> + Send;
    fn configure(
        &self,
        command: ConfigureTmdb<'_>,
    ) -> impl Future<Output = Result<ConnectionStatus, CatalogError>> + Send;
    fn clear(&self) -> impl Future<Output = Result<ConnectionStatus, CatalogError>> + Send;
}
pub(crate) trait SnapshotQueries: Send + Sync {
    fn list(
        &self,
        query: ListTitles,
    ) -> impl Future<Output = Result<SnapshotPage, CatalogError>> + Send;
    fn title(&self, id: TitleId) -> impl Future<Output = Result<TitleData, CatalogError>> + Send;
}
