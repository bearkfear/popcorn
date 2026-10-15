//! Adapt TMDB operations to the application metadata boundary.
use super::Tmdb;
use crate::application::catalog::{
    commands::ConfigureTmdb,
    ports::MetadataProvider,
    queries::{BrowseTitles, SearchTitles},
};
use crate::core::catalog::{
    Cached, CatalogError, ConnectionStatus, EpisodeData, EpisodeSelection, GenreData, MediaType,
    SeasonData, SeriesId, TitleData, TitleId, TitlePage,
};
impl MetadataProvider for Tmdb {
    async fn browse(&self, q: BrowseTitles) -> Result<Cached<TitlePage>, CatalogError> {
        self.list(
            q.media_type.number(),
            q.category.path(),
            q.page.number(),
            q.genre_id,
        )
        .await
    }
    async fn search(&self, q: SearchTitles) -> Result<Cached<TitlePage>, CatalogError> {
        self.search(q.media_type.number(), q.query.text(), q.page.number())
            .await
    }
    async fn title(&self, id: TitleId) -> Result<Cached<TitleData>, CatalogError> {
        self.title(id.media_type.number(), id.tmdb_id).await
    }
    async fn genres(&self, media: MediaType) -> Result<Cached<Vec<GenreData>>, CatalogError> {
        self.genres(media.number()).await
    }
    async fn seasons(&self, series: SeriesId) -> Result<Cached<Vec<SeasonData>>, CatalogError> {
        self.seasons(series.number()).await
    }
    async fn episodes(
        &self,
        s: EpisodeSelection,
    ) -> Result<Cached<Vec<EpisodeData>>, CatalogError> {
        self.episodes(s.series.number(), s.season).await
    }
    async fn status(&self) -> ConnectionStatus {
        self.status().await
    }
    async fn configure(&self, c: ConfigureTmdb<'_>) -> Result<ConnectionStatus, CatalogError> {
        self.configure(c.token, c.remember).await
    }
    async fn clear(&self) -> Result<ConnectionStatus, CatalogError> {
        self.clear().await
    }
}
