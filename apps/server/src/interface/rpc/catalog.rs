//! Protobuf catalog service delegating every operation to application use cases.
use std::sync::Arc;

use connectrpc::{Encodable, RequestContext, Response, ServiceRequest, ServiceResult};
use popcorn_proto::catalog::popcorn::v1::CatalogService;
use popcorn_proto::proto::popcorn::v1::{
    BrowseTitlesRequest, BrowseTitlesResponse, ClearTmdbConfigurationRequest,
    ClearTmdbConfigurationResponse, ConfigureTmdbRequest, ConfigureTmdbResponse, Genre,
    GetTitleRequest, GetTitleResponse, GetTmdbStatusRequest, GetTmdbStatusResponse,
    ListEpisodesRequest, ListEpisodesResponse, ListGenresRequest, ListGenresResponse,
    ListSeasonsRequest, ListSeasonsResponse, ListTitlesRequest, ListTitlesResponse,
    SearchTitlesRequest, SearchTitlesResponse, Season, Title, TmdbStatus,
};

use super::{conversions::episode, errors::catalog_error, validation::title_id};
use crate::application::catalog::{
    Catalog,
    commands::{ClearTmdb, ConfigureTmdb},
    ports::{MetadataProvider, SnapshotQueries},
    queries::{BrowseTitles, GetTitle, ListTitles, SearchTitles},
};
use crate::core::catalog::{
    Category, Cursor, EpisodeSelection, MediaType, Page, PageSize, SearchQuery, SeriesId,
};
#[derive(Debug)]
pub(super) struct CatalogRpc<M, S> {
    catalog: Arc<Catalog<M, S>>,
}
impl<M, S> CatalogRpc<M, S> {
    pub(super) const fn new(catalog: Arc<Catalog<M, S>>) -> Self {
        Self { catalog }
    }
}
impl<M: MetadataProvider + 'static, S: SnapshotQueries + 'static> CatalogService
    for CatalogRpc<M, S>
{
    async fn browse_titles<'a>(
        &'a self,
        _context: RequestContext,
        request: ServiceRequest<'_, BrowseTitlesRequest>,
    ) -> ServiceResult<impl Encodable<BrowseTitlesResponse> + Send + use<'a, M, S>> {
        let category =
            Category::parse(request.category.to_i32(), request.genre_id).map_err(catalog_error)?;
        let result = self
            .catalog
            .browse(BrowseTitles {
                category,
                media_type: MediaType::parse(request.media_type.to_i32()).map_err(catalog_error)?,
                page: Page::parse(request.page).map_err(catalog_error)?,
                genre_id: request.genre_id,
            })
            .await
            .map_err(catalog_error)?;
        Response::ok(BrowseTitlesResponse {
            titles: result.data.titles.into_iter().map(Title::from).collect(),
            page: result.data.page,
            total_pages: result.data.total_pages.min(500),
            stale: result.stale,
            ..Default::default()
        })
    }
    async fn search_titles<'a>(
        &'a self,
        _context: RequestContext,
        request: ServiceRequest<'_, SearchTitlesRequest>,
    ) -> ServiceResult<impl Encodable<SearchTitlesResponse> + Send + use<'a, M, S>> {
        let query = SearchQuery::parse(request.query).map_err(catalog_error)?;
        let result = self
            .catalog
            .search(SearchTitles {
                query,
                media_type: MediaType::parse(request.media_type.to_i32()).map_err(catalog_error)?,
                page: Page::parse(request.page).map_err(catalog_error)?,
            })
            .await
            .map_err(catalog_error)?;
        Response::ok(SearchTitlesResponse {
            titles: result.data.titles.into_iter().map(Title::from).collect(),
            page: result.data.page,
            total_pages: result.data.total_pages.min(500),
            stale: result.stale,
            ..Default::default()
        })
    }
    async fn list_genres<'a>(
        &'a self,
        _context: RequestContext,
        request: ServiceRequest<'_, ListGenresRequest>,
    ) -> ServiceResult<impl Encodable<ListGenresResponse> + Send + use<'a, M, S>> {
        let media = MediaType::parse(request.media_type.to_i32()).map_err(catalog_error)?;
        let result = self.catalog.genres(media).await.map_err(catalog_error)?;
        Response::ok(ListGenresResponse {
            genres: result.data.into_iter().map(Genre::from).collect(),
            stale: result.stale,
            ..Default::default()
        })
    }
    async fn list_seasons<'a>(
        &'a self,
        _context: RequestContext,
        request: ServiceRequest<'_, ListSeasonsRequest>,
    ) -> ServiceResult<impl Encodable<ListSeasonsResponse> + Send + use<'a, M, S>> {
        let series = SeriesId::parse(request.series_id).map_err(catalog_error)?;
        let result = self.catalog.seasons(series).await.map_err(catalog_error)?;
        Response::ok(ListSeasonsResponse {
            seasons: result.data.into_iter().map(Season::from).collect(),
            stale: result.stale,
            ..Default::default()
        })
    }
    async fn list_episodes<'a>(
        &'a self,
        _context: RequestContext,
        request: ServiceRequest<'_, ListEpisodesRequest>,
    ) -> ServiceResult<impl Encodable<ListEpisodesResponse> + Send + use<'a, M, S>> {
        let selection = EpisodeSelection::parse(request.series_id, request.season_number)
            .map_err(catalog_error)?;
        let result = self
            .catalog
            .episodes(selection)
            .await
            .map_err(catalog_error)?;
        Response::ok(ListEpisodesResponse {
            episodes: result
                .data
                .into_iter()
                .map(|value| episode(value, request.series_id, request.season_number))
                .collect(),
            stale: result.stale,
            ..Default::default()
        })
    }
    async fn get_tmdb_status<'a>(
        &'a self,
        _context: RequestContext,
        request: ServiceRequest<'_, GetTmdbStatusRequest>,
    ) -> ServiceResult<impl Encodable<GetTmdbStatusResponse> + Send + use<'a, M, S>> {
        let _ = request;
        Response::ok(GetTmdbStatusResponse {
            status: TmdbStatus::from(self.catalog.status().await).into(),
            ..Default::default()
        })
    }
    async fn configure_tmdb<'a>(
        &'a self,
        _context: RequestContext,
        request: ServiceRequest<'_, ConfigureTmdbRequest>,
    ) -> ServiceResult<impl Encodable<ConfigureTmdbResponse> + Send + use<'a, M, S>> {
        let status = self
            .catalog
            .configure(ConfigureTmdb {
                token: request.read_access_token,
                remember: request.remember,
            })
            .await
            .map_err(catalog_error)?;
        Response::ok(ConfigureTmdbResponse {
            status: TmdbStatus::from(status).into(),
            ..Default::default()
        })
    }
    async fn clear_tmdb_configuration<'a>(
        &'a self,
        _context: RequestContext,
        request: ServiceRequest<'_, ClearTmdbConfigurationRequest>,
    ) -> ServiceResult<impl Encodable<ClearTmdbConfigurationResponse> + Send + use<'a, M, S>> {
        let _ = request;
        let status = self.catalog.clear(ClearTmdb).await.map_err(catalog_error)?;
        Response::ok(ClearTmdbConfigurationResponse {
            status: TmdbStatus::from(status).into(),
            ..Default::default()
        })
    }
    async fn list_titles<'a>(
        &'a self,
        _context: RequestContext,
        request: ServiceRequest<'_, ListTitlesRequest>,
    ) -> ServiceResult<impl Encodable<ListTitlesResponse> + Send + use<'a, M, S>> {
        let page_size = PageSize::parse(request.page_size).map_err(catalog_error)?;
        let cursor = Cursor::parse(request.page_token).map_err(catalog_error)?;
        let result = self
            .catalog
            .list(ListTitles { page_size, cursor })
            .await
            .map_err(catalog_error)?;
        Response::ok(ListTitlesResponse {
            titles: result.titles.into_iter().map(Title::from).collect(),
            next_page_token: result.next_cursor.map(Cursor::token).unwrap_or_default(),
            ..Default::default()
        })
    }
    async fn get_title<'a>(
        &'a self,
        _context: RequestContext,
        request: ServiceRequest<'_, GetTitleRequest>,
    ) -> ServiceResult<impl Encodable<GetTitleResponse> + Send + use<'a, M, S>> {
        let request = request.to_owned_message();
        let id = title_id(request.content.as_option())?;
        let result = self
            .catalog
            .title(GetTitle {
                id,
                use_tmdb: request.use_tmdb,
            })
            .await
            .map_err(catalog_error)?;
        Response::ok(GetTitleResponse {
            title: Title::from(result.data).into(),
            stale: result.stale,
            ..Default::default()
        })
    }
}
