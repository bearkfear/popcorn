use std::sync::Arc;

use connectrpc::{
    ConnectError, Encodable, ErrorCode, RequestContext, Response, ServiceRequest, ServiceResult,
};
use sqlx::SqlitePool;
use uuid::Uuid;

use popcorn_proto::catalog::popcorn::v1::{
    CatalogService, PlaybackService, PlaybackServiceRegisterMarker, SourceService,
    SourceServiceRegisterMarker, StorageService, StorageServiceRegisterMarker,
};
use popcorn_proto::proto::popcorn::v1::{
    AddSourceRequest, AddSourceResponse, BrowseTitlesRequest, BrowseTitlesResponse, CastMember,
    ClearCacheRequest, ClearCacheResponse, ClearTmdbConfigurationRequest,
    ClearTmdbConfigurationResponse, ConfigureTmdbRequest, ConfigureTmdbResponse, ContentRef,
    Episode, Genre, GetCacheSettingsRequest, GetCacheSettingsResponse, GetPlaybackRequest,
    GetPlaybackResponse, GetTitleRequest, GetTitleResponse, GetTmdbStatusRequest,
    GetTmdbStatusResponse, ListEpisodesRequest, ListEpisodesResponse, ListGenresRequest,
    ListGenresResponse, ListSeasonsRequest, ListSeasonsResponse, ListSourcesRequest,
    ListSourcesResponse, ListTitlesRequest, ListTitlesResponse, PausePlaybackRequest,
    PausePlaybackResponse, RemoveSourceRequest, RemoveSourceResponse, ResumePlaybackRequest,
    ResumePlaybackResponse, SearchTitlesRequest, SearchTitlesResponse, Season,
    SetCacheLimitRequest, SetCacheLimitResponse, StartPlaybackRequest, StartPlaybackResponse,
    StopPlaybackRequest, StopPlaybackResponse, Title, TmdbStatus,
};

use crate::{
    source::{SourceEngine, SourceError},
    tmdb::{self, Tmdb, TmdbError},
};

#[derive(Debug)]
struct Catalog {
    pool: SqlitePool,
    tmdb: Arc<Tmdb>,
}

#[derive(Debug, sqlx::FromRow)]
struct CatalogTitle {
    media_type: i32,
    tmdb_id: u32,
    title: String,
    overview: String,
    release_year: u32,
}

impl From<CatalogTitle> for Title {
    fn from(row: CatalogTitle) -> Self {
        Self {
            content: ContentRef {
                media_type: row.media_type.into(),
                tmdb_id: row.tmdb_id,
                ..Default::default()
            }
            .into(),
            title: row.title,
            overview: row.overview,
            release_year: row.release_year,
            ..Default::default()
        }
    }
}

pub(super) fn router(
    pool: SqlitePool,
    tmdb: Arc<Tmdb>,
    source: Arc<SourceEngine>,
) -> connectrpc::Router {
    connectrpc::Router::new()
        .add_service(Arc::new(Catalog { pool, tmdb }))
        .add_service::<SourceEngine, SourceServiceRegisterMarker>(source.clone())
        .add_service::<SourceEngine, PlaybackServiceRegisterMarker>(source.clone())
        .add_service::<SourceEngine, StorageServiceRegisterMarker>(source)
}

impl From<tmdb::GenreData> for Genre {
    fn from(value: tmdb::GenreData) -> Self {
        Self {
            id: value.id,
            name: value.name,
            ..Default::default()
        }
    }
}

impl From<tmdb::SeasonData> for Season {
    fn from(value: tmdb::SeasonData) -> Self {
        Self {
            season_number: value.season_number,
            name: value.name,
            overview: value.overview,
            poster_url: value.poster_url,
            episode_count: value.episode_count,
            ..Default::default()
        }
    }
}

impl From<tmdb::TitleData> for Title {
    fn from(value: tmdb::TitleData) -> Self {
        Self {
            content: ContentRef {
                media_type: i32::try_from(value.media_type).unwrap_or_default().into(),
                tmdb_id: value.tmdb_id,
                ..Default::default()
            }
            .into(),
            title: value.title,
            overview: value.overview,
            release_year: value.release_year,
            poster_url: value.poster_url,
            backdrop_url: value.backdrop_url,
            vote_average: value.vote_average,
            genres: value.genres.into_iter().map(Genre::from).collect(),
            cast: value
                .cast
                .into_iter()
                .map(|person| CastMember {
                    name: person.name,
                    character: person.character,
                    profile_url: person.profile_url,
                    ..Default::default()
                })
                .collect(),
            runtime_minutes: value.runtime_minutes,
            seasons: value.seasons.into_iter().map(Season::from).collect(),
            ..Default::default()
        }
    }
}

impl From<tmdb::ConnectionStatus> for TmdbStatus {
    fn from(value: tmdb::ConnectionStatus) -> Self {
        Self {
            configured: value.configured,
            remembered: value.remembered,
            ..Default::default()
        }
    }
}

fn tmdb_error(error: TmdbError) -> ConnectError {
    let (code, reason) = match error {
        TmdbError::NotConfigured => (ErrorCode::FailedPrecondition, "TMDB_NOT_CONFIGURED"),
        TmdbError::InvalidCredential => (ErrorCode::Unauthenticated, "TMDB_INVALID_CREDENTIAL"),
        TmdbError::Unavailable => (ErrorCode::Unavailable, "TMDB_UNAVAILABLE"),
        TmdbError::NotFound => (ErrorCode::NotFound, "TMDB_NOT_FOUND"),
        TmdbError::RateLimited { .. } => (ErrorCode::ResourceExhausted, "TMDB_RATE_LIMITED"),
        TmdbError::InvalidResponse => (ErrorCode::Unavailable, "TMDB_INVALID_RESPONSE"),
        TmdbError::Configuration | TmdbError::Io(_) => {
            (ErrorCode::FailedPrecondition, "TMDB_CONFIGURATION")
        }
        TmdbError::Database(error) => return database_error(&error),
    };
    ConnectError::new(code, reason)
}

fn media_type(value: i32) -> Result<u32, ConnectError> {
    match value {
        1 => Ok(1),
        2 => Ok(2),
        _ => Err(invalid("media type must be movie or TV")),
    }
}

fn page(value: u32) -> Result<u32, ConnectError> {
    match value {
        0 => Ok(1),
        1..=500 => Ok(value),
        _ => Err(invalid("page must be between 1 and 500")),
    }
}

fn invalid(message: &str) -> ConnectError {
    ConnectError::new(ErrorCode::InvalidArgument, message)
}

fn database_error(error: &sqlx::Error) -> ConnectError {
    tracing::error!(%error, "catalog query failed");
    ConnectError::new(ErrorCode::Internal, "catalog query failed")
}

fn source_error(error: SourceError) -> ConnectError {
    let (code, reason) = match error {
        SourceError::Invalid => (ErrorCode::InvalidArgument, "SOURCE_INVALID"),
        SourceError::NotFound => (ErrorCode::NotFound, "SOURCE_NOT_FOUND"),
        SourceError::InUse => (ErrorCode::FailedPrecondition, "SOURCE_IN_USE"),
        SourceError::Unavailable => (ErrorCode::Unavailable, "SOURCE_UNAVAILABLE"),
        SourceError::Capacity => (ErrorCode::ResourceExhausted, "CACHE_LIMIT"),
        SourceError::Database(error) => return database_error(&error),
    };
    ConnectError::new(code, reason)
}

fn page_cursor(token: &str) -> Result<(i32, u32), ConnectError> {
    if token.is_empty() {
        return Ok((0, 0));
    }
    if token.len() > 32 {
        return Err(invalid("invalid page token"));
    }
    let mut parts = token.split(':');
    let (Some("v1"), Some(media_type), Some(tmdb_id), None) =
        (parts.next(), parts.next(), parts.next(), parts.next())
    else {
        return Err(invalid("invalid page token"));
    };
    let media_type: i32 = media_type
        .parse()
        .map_err(|_| invalid("invalid page token"))?;
    let tmdb_id: u32 = tmdb_id.parse().map_err(|_| invalid("invalid page token"))?;
    if !matches!(media_type, 1 | 2) || tmdb_id == 0 {
        return Err(invalid("invalid page token"));
    }
    Ok((media_type, tmdb_id))
}

impl CatalogService for Catalog {
    async fn browse_titles<'a>(
        &'a self,
        _context: RequestContext,
        request: ServiceRequest<'_, BrowseTitlesRequest>,
    ) -> ServiceResult<impl Encodable<BrowseTitlesResponse> + Send + use<'a>> {
        let category = match request.category.to_i32() {
            0 | 1 => "popular",
            2 => "upcoming",
            3 => "top_rated",
            _ => return Err(invalid("unknown catalog category")),
        };
        if request.genre_id > 0 && category != "popular" {
            return Err(invalid("genre filtering applies to popular titles"));
        }
        let result = self
            .tmdb
            .list(
                media_type(request.media_type.to_i32())?,
                category,
                page(request.page)?,
                request.genre_id,
            )
            .await
            .map_err(tmdb_error)?;
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
    ) -> ServiceResult<impl Encodable<SearchTitlesResponse> + Send + use<'a>> {
        let query = request.query.trim();
        if query.is_empty() || query.chars().count() > 200 {
            return Err(invalid("query must contain between 1 and 200 characters"));
        }
        let result = self
            .tmdb
            .search(
                media_type(request.media_type.to_i32())?,
                query,
                page(request.page)?,
            )
            .await
            .map_err(tmdb_error)?;
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
    ) -> ServiceResult<impl Encodable<ListGenresResponse> + Send + use<'a>> {
        let result = self
            .tmdb
            .genres(media_type(request.media_type.to_i32())?)
            .await
            .map_err(tmdb_error)?;
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
    ) -> ServiceResult<impl Encodable<ListSeasonsResponse> + Send + use<'a>> {
        if request.series_id == 0 {
            return Err(invalid("series ID is required"));
        }
        let result = self
            .tmdb
            .seasons(request.series_id)
            .await
            .map_err(tmdb_error)?;
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
    ) -> ServiceResult<impl Encodable<ListEpisodesResponse> + Send + use<'a>> {
        if request.series_id == 0 || request.season_number > 10_000 {
            return Err(invalid("valid series ID and season number are required"));
        }
        let result = self
            .tmdb
            .episodes(request.series_id, request.season_number)
            .await
            .map_err(tmdb_error)?;
        Response::ok(ListEpisodesResponse {
            episodes: result
                .data
                .into_iter()
                .map(|episode| Episode {
                    content: ContentRef {
                        media_type: 2.into(),
                        tmdb_id: request.series_id,
                        season_number: Some(request.season_number),
                        episode_number: Some(episode.episode_number),
                        ..Default::default()
                    }
                    .into(),
                    name: episode.name,
                    overview: episode.overview,
                    still_url: episode.still_url,
                    air_date: episode.air_date,
                    runtime_minutes: episode.runtime_minutes,
                    ..Default::default()
                })
                .collect(),
            stale: result.stale,
            ..Default::default()
        })
    }

    async fn get_tmdb_status<'a>(
        &'a self,
        _context: RequestContext,
        _request: ServiceRequest<'_, GetTmdbStatusRequest>,
    ) -> ServiceResult<impl Encodable<GetTmdbStatusResponse> + Send + use<'a>> {
        Response::ok(GetTmdbStatusResponse {
            status: TmdbStatus::from(self.tmdb.status().await).into(),
            ..Default::default()
        })
    }

    async fn configure_tmdb<'a>(
        &'a self,
        _context: RequestContext,
        request: ServiceRequest<'_, ConfigureTmdbRequest>,
    ) -> ServiceResult<impl Encodable<ConfigureTmdbResponse> + Send + use<'a>> {
        let status = self
            .tmdb
            .configure(request.read_access_token, request.remember)
            .await
            .map_err(tmdb_error)?;
        Response::ok(ConfigureTmdbResponse {
            status: TmdbStatus::from(status).into(),
            ..Default::default()
        })
    }

    async fn clear_tmdb_configuration<'a>(
        &'a self,
        _context: RequestContext,
        _request: ServiceRequest<'_, ClearTmdbConfigurationRequest>,
    ) -> ServiceResult<impl Encodable<ClearTmdbConfigurationResponse> + Send + use<'a>> {
        let status = self.tmdb.clear().await.map_err(tmdb_error)?;
        Response::ok(ClearTmdbConfigurationResponse {
            status: TmdbStatus::from(status).into(),
            ..Default::default()
        })
    }

    async fn list_titles<'a>(
        &'a self,
        _context: RequestContext,
        request: ServiceRequest<'_, ListTitlesRequest>,
    ) -> ServiceResult<impl Encodable<ListTitlesResponse> + Send + use<'a>> {
        let page_size = match request.page_size {
            0 => 20,
            1..=100 => request.page_size,
            _ => return Err(invalid("page size must not exceed 100")),
        };
        let (media_type, tmdb_id) = page_cursor(request.page_token)?;
        let mut rows = sqlx::query_as::<_, CatalogTitle>(
            "SELECT media_type, tmdb_id, title, overview, release_year
             FROM catalog_contents
             WHERE (media_type, tmdb_id) > (?, ?)
             ORDER BY media_type, tmdb_id LIMIT ?",
        )
        .bind(media_type)
        .bind(tmdb_id)
        .bind(i64::from(page_size) + 1)
        .fetch_all(&self.pool)
        .await
        .map_err(|error| database_error(&error))?;
        let has_more = rows.len() > usize::try_from(page_size).map_err(|_| invalid("page size"))?;
        if has_more {
            rows.pop();
        }
        let next_page_token = if has_more {
            rows.last()
                .map(|row| format!("v1:{}:{}", row.media_type, row.tmdb_id))
                .unwrap_or_default()
        } else {
            String::new()
        };
        Response::ok(ListTitlesResponse {
            titles: rows.into_iter().map(Title::from).collect(),
            next_page_token,
            ..Default::default()
        })
    }

    async fn get_title<'a>(
        &'a self,
        _context: RequestContext,
        request: ServiceRequest<'_, GetTitleRequest>,
    ) -> ServiceResult<impl Encodable<GetTitleResponse> + Send + use<'a>> {
        let request = request.to_owned_message();
        let content = request
            .content
            .as_option()
            .ok_or_else(|| invalid("content is required"))?;
        let media_type = content.media_type.to_i32();
        if !matches!(media_type, 1 | 2)
            || content.tmdb_id == 0
            || content.season_number.is_some()
            || content.episode_number.is_some()
        {
            return Err(invalid(
                "content must identify a movie or TV title without episode coordinates",
            ));
        }
        if request.use_tmdb {
            let result = self
                .tmdb
                .title(if media_type == 1 { 1 } else { 2 }, content.tmdb_id)
                .await
                .map_err(tmdb_error)?;
            return Response::ok(GetTitleResponse {
                title: Title::from(result.data).into(),
                stale: result.stale,
                ..Default::default()
            });
        }
        let title = sqlx::query_as::<_, CatalogTitle>(
            "SELECT media_type, tmdb_id, title, overview, release_year
             FROM catalog_contents WHERE media_type = ? AND tmdb_id = ?",
        )
        .bind(media_type)
        .bind(content.tmdb_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|error| database_error(&error))?
        .ok_or_else(|| ConnectError::new(ErrorCode::NotFound, "title not found"))?;
        Response::ok(GetTitleResponse {
            title: Title::from(title).into(),
            ..Default::default()
        })
    }
}

impl SourceService for SourceEngine {
    async fn add_source<'a>(
        &'a self,
        _context: RequestContext,
        request: ServiceRequest<'_, AddSourceRequest>,
    ) -> ServiceResult<impl Encodable<AddSourceResponse> + Send + use<'a>> {
        let request = request.to_owned_message();
        let content = request
            .content
            .as_option()
            .cloned()
            .ok_or_else(|| invalid("content is required"))?;
        let input = request
            .input
            .ok_or_else(|| invalid("magnet or torrent file is required"))?;
        let source = self.add(content, input).await.map_err(source_error)?;
        Response::ok(AddSourceResponse {
            source: source.into(),
            ..Default::default()
        })
    }

    async fn list_sources<'a>(
        &'a self,
        _context: RequestContext,
        request: ServiceRequest<'_, ListSourcesRequest>,
    ) -> ServiceResult<impl Encodable<ListSourcesResponse> + Send + use<'a>> {
        let request = request.to_owned_message();
        let content = request
            .content
            .as_option()
            .ok_or_else(|| invalid("content is required"))?;
        let sources = self.list(content).await.map_err(source_error)?;
        Response::ok(ListSourcesResponse {
            sources,
            ..Default::default()
        })
    }

    async fn remove_source<'a>(
        &'a self,
        _context: RequestContext,
        request: ServiceRequest<'_, RemoveSourceRequest>,
    ) -> ServiceResult<impl Encodable<RemoveSourceResponse> + Send + use<'a>> {
        if request.source_id.is_empty() {
            return Err(invalid("source ID is required"));
        }
        self.remove(request.source_id).await.map_err(source_error)?;
        Response::ok(RemoveSourceResponse::default())
    }
}

impl PlaybackService for SourceEngine {
    async fn start_playback<'a>(
        &'a self,
        _context: RequestContext,
        request: ServiceRequest<'_, StartPlaybackRequest>,
    ) -> ServiceResult<impl Encodable<StartPlaybackResponse> + Send + use<'a>> {
        let playback = self
            .start(
                request.source_id,
                request.file_index,
                request.idempotency_key,
            )
            .await
            .map_err(source_error)?;
        Response::ok(StartPlaybackResponse {
            playback: playback.into(),
            ..Default::default()
        })
    }

    async fn get_playback<'a>(
        &'a self,
        _context: RequestContext,
        request: ServiceRequest<'_, GetPlaybackRequest>,
    ) -> ServiceResult<impl Encodable<GetPlaybackResponse> + Send + use<'a>> {
        let id = Uuid::parse_str(request.playback_id)
            .map_err(|_| invalid("valid playback ID is required"))?;
        let playback = self.playback(id).await.map_err(source_error)?;
        Response::ok(GetPlaybackResponse {
            playback: playback.into(),
            ..Default::default()
        })
    }

    async fn stop_playback<'a>(
        &'a self,
        _context: RequestContext,
        request: ServiceRequest<'_, StopPlaybackRequest>,
    ) -> ServiceResult<impl Encodable<StopPlaybackResponse> + Send + use<'a>> {
        let id = Uuid::parse_str(request.playback_id)
            .map_err(|_| invalid("valid playback ID is required"))?;
        self.stop(id).await.map_err(source_error)?;
        Response::ok(StopPlaybackResponse::default())
    }

    async fn pause_playback<'a>(
        &'a self,
        _context: RequestContext,
        request: ServiceRequest<'_, PausePlaybackRequest>,
    ) -> ServiceResult<impl Encodable<PausePlaybackResponse> + Send + use<'a>> {
        let id = Uuid::parse_str(request.playback_id)
            .map_err(|_| invalid("valid playback ID is required"))?;
        let playback = self.pause(id).await.map_err(source_error)?;
        Response::ok(PausePlaybackResponse {
            playback: playback.into(),
            ..Default::default()
        })
    }

    async fn resume_playback<'a>(
        &'a self,
        _context: RequestContext,
        request: ServiceRequest<'_, ResumePlaybackRequest>,
    ) -> ServiceResult<impl Encodable<ResumePlaybackResponse> + Send + use<'a>> {
        let id = Uuid::parse_str(request.playback_id)
            .map_err(|_| invalid("valid playback ID is required"))?;
        let playback = self.resume(id).await.map_err(source_error)?;
        Response::ok(ResumePlaybackResponse {
            playback: playback.into(),
            ..Default::default()
        })
    }
}

impl StorageService for SourceEngine {
    async fn get_cache_settings<'a>(
        &'a self,
        _context: RequestContext,
        _request: ServiceRequest<'_, GetCacheSettingsRequest>,
    ) -> ServiceResult<impl Encodable<GetCacheSettingsResponse> + Send + use<'a>> {
        let settings = self.cache_settings().await.map_err(source_error)?;
        Response::ok(GetCacheSettingsResponse {
            settings: settings.into(),
            ..Default::default()
        })
    }

    async fn set_cache_limit<'a>(
        &'a self,
        _context: RequestContext,
        request: ServiceRequest<'_, SetCacheLimitRequest>,
    ) -> ServiceResult<impl Encodable<SetCacheLimitResponse> + Send + use<'a>> {
        let settings = self
            .set_cache_limit(request.limit_bytes)
            .await
            .map_err(source_error)?;
        Response::ok(SetCacheLimitResponse {
            settings: settings.into(),
            ..Default::default()
        })
    }

    async fn clear_cache<'a>(
        &'a self,
        _context: RequestContext,
        _request: ServiceRequest<'_, ClearCacheRequest>,
    ) -> ServiceResult<impl Encodable<ClearCacheResponse> + Send + use<'a>> {
        let settings = self.clear_cache().await.map_err(source_error)?;
        Response::ok(ClearCacheResponse {
            settings: settings.into(),
            ..Default::default()
        })
    }
}
