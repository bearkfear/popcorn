//! Catalog use cases coordinate metadata and snapshot boundaries.
pub mod commands;
pub mod ports;
pub mod queries;
use crate::core::catalog::{
    Cached, CatalogError, ConnectionStatus, EpisodeData, EpisodeSelection, GenreData, MediaType,
    SeasonData, SeriesId, TitleData, TitlePage,
};
use commands::{ClearTmdb, ConfigureTmdb};
use ports::{MetadataProvider, SnapshotQueries};
use queries::{BrowseTitles, GetTitle, ListTitles, SearchTitles, SnapshotPage};
use std::sync::Arc;
#[derive(Debug)]
pub(crate) struct Catalog<M, S> {
    metadata: Arc<M>,
    snapshot: S,
}
impl<M: MetadataProvider, S: SnapshotQueries> Catalog<M, S> {
    pub(crate) const fn new(metadata: Arc<M>, snapshot: S) -> Self {
        Self { metadata, snapshot }
    }
    pub(crate) async fn browse(
        &self,
        query: BrowseTitles,
    ) -> Result<Cached<TitlePage>, CatalogError> {
        self.metadata.browse(query).await
    }
    pub(crate) async fn search(
        &self,
        query: SearchTitles,
    ) -> Result<Cached<TitlePage>, CatalogError> {
        self.metadata.search(query).await
    }
    pub(crate) async fn genres(
        &self,
        media: MediaType,
    ) -> Result<Cached<Vec<GenreData>>, CatalogError> {
        self.metadata.genres(media).await
    }
    pub(crate) async fn seasons(
        &self,
        series: SeriesId,
    ) -> Result<Cached<Vec<SeasonData>>, CatalogError> {
        self.metadata.seasons(series).await
    }
    pub(crate) async fn episodes(
        &self,
        selection: EpisodeSelection,
    ) -> Result<Cached<Vec<EpisodeData>>, CatalogError> {
        self.metadata.episodes(selection).await
    }
    pub(crate) async fn status(&self) -> ConnectionStatus {
        self.metadata.status().await
    }
    pub(crate) async fn configure(
        &self,
        command: ConfigureTmdb<'_>,
    ) -> Result<ConnectionStatus, CatalogError> {
        self.metadata.configure(command).await
    }
    pub(crate) async fn clear(
        &self,
        _command: ClearTmdb,
    ) -> Result<ConnectionStatus, CatalogError> {
        self.metadata.clear().await
    }
    pub(crate) async fn list(&self, query: ListTitles) -> Result<SnapshotPage, CatalogError> {
        self.snapshot.list(query).await
    }
    pub(crate) async fn title(&self, query: GetTitle) -> Result<Cached<TitleData>, CatalogError> {
        if query.use_tmdb {
            return self.metadata.title(query.id).await;
        }
        Ok(Cached {
            data: self.snapshot.title(query.id).await?,
            stale: false,
        })
    }
}
