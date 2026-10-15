//! Authorized torrent sources, progressive playback sessions and media delivery.

use std::{collections::HashMap, fmt, path::PathBuf, sync::Arc};

use axum::{
    Router,
    body::Body,
    extract::{Path, Query, State},
    http::{HeaderMap, HeaderValue, Method, StatusCode, header},
    response::{IntoResponse, Response},
    routing::get,
};
use librqbit::{
    AddTorrent, AddTorrentOptions, ManagedTorrent, Session, SessionOptions, TorrentStatsState,
};
use serde::Deserialize;
use sqlx::{Row, SqlitePool};
use subtle::ConstantTimeEq as _;
use tokio::{
    io::{AsyncReadExt as _, AsyncSeekExt as _},
    sync::Mutex,
};
use tokio_util::io::ReaderStream;
use uuid::Uuid;

use popcorn_proto::proto::popcorn::v1::{
    CacheSettings, ContentRef, Playback, PlaybackState, Source, SourceFile, SourceState,
    add_source_request::Input as SourceInput,
};

const MAX_TORRENT_BYTES: usize = 10 * 1024 * 1024;
const DEFAULT_CACHE_LIMIT: u64 = 20 * 1024 * 1024 * 1024;
const MIN_CACHE_LIMIT: u64 = 512 * 1024 * 1024;
const MAX_CACHE_LIMIT: u64 = 1024 * 1024 * 1024 * 1024;

#[derive(Debug, thiserror::Error)]
pub(crate) enum SourceError {
    #[error("invalid source request")]
    Invalid,
    #[error("source not found")]
    NotFound,
    #[error("source is in use")]
    InUse,
    #[error("torrent engine unavailable")]
    Unavailable,
    #[error("cache capacity exceeded")]
    Capacity,
    #[error("source database error")]
    Database(#[from] sqlx::Error),
}

struct ActivePlayback {
    source_id: String,
    handle: Arc<ManagedTorrent>,
    file_index: usize,
    file_name: String,
    size: u64,
    credential: String,
}

pub(crate) struct SourceEngine {
    user: SqlitePool,
    download_dir: PathBuf,
    address: String,
    origin: Option<String>,
    session: Mutex<Option<Arc<Session>>>,
    playbacks: Mutex<HashMap<Uuid, ActivePlayback>>,
    idempotency: Mutex<HashMap<String, Uuid>>,
    playback_command: Mutex<()>,
}

impl fmt::Debug for SourceEngine {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("SourceEngine")
            .field("download_dir", &self.download_dir)
            .field("address", &self.address)
            .field("origin", &self.origin)
            .finish_non_exhaustive()
    }
}

impl SourceEngine {
    pub(crate) fn new(
        user: SqlitePool,
        data_dir: &std::path::Path,
        address: String,
        origin: Option<String>,
    ) -> Self {
        Self {
            user,
            download_dir: data_dir.join("downloads"),
            address,
            origin,
            session: Mutex::new(None),
            playbacks: Mutex::new(HashMap::new()),
            idempotency: Mutex::new(HashMap::new()),
            playback_command: Mutex::new(()),
        }
    }

    async fn session(&self) -> Result<Arc<Session>, SourceError> {
        let mut current = self.session.lock().await;
        if let Some(session) = current.as_ref() {
            return Ok(session.clone());
        }
        tokio::fs::create_dir_all(&self.download_dir)
            .await
            .map_err(|_| SourceError::Unavailable)?;
        let mut options = SessionOptions::default();
        if let Some(dht) = options.dht.as_mut() {
            dht.persistence = None;
        }
        options.disable_local_service_discovery = true;
        options.ipv4_only = true;
        options.client_name_and_version = Some(format!(
            "Popcorn/{} rqbit/{}",
            env!("CARGO_PKG_VERSION"),
            librqbit::version()
        ));
        let session = Session::new_with_opts(self.download_dir.clone(), options)
            .await
            .map_err(|_| SourceError::Unavailable)?;
        *current = Some(session.clone());
        drop(current);
        Ok(session)
    }

    async fn active_session(&self) -> Option<Arc<Session>> {
        self.session.lock().await.as_ref().cloned()
    }

    async fn take_session(&self) -> Option<Arc<Session>> {
        self.session.lock().await.take()
    }

    pub(crate) async fn add(
        &self,
        content: ContentRef,
        input: SourceInput,
    ) -> Result<Source, SourceError> {
        validate_content(&content)?;
        let (add, magnet) = match input {
            SourceInput::Magnet(magnet)
                if magnet.len() <= 8192 && magnet.starts_with("magnet:?") =>
            {
                (AddTorrent::from_url(magnet.clone()), Some(magnet))
            }
            SourceInput::TorrentFile(bytes)
                if !bytes.is_empty() && bytes.len() <= MAX_TORRENT_BYTES =>
            {
                (AddTorrent::from_bytes(bytes), None)
            }
            _ => return Err(SourceError::Invalid),
        };
        let response = self
            .session()
            .await?
            .add_torrent(
                add,
                Some(AddTorrentOptions {
                    list_only: true,
                    ..Default::default()
                }),
            )
            .await
            .map_err(|_| SourceError::Unavailable)?;
        let librqbit::AddTorrentResponse::ListOnly(resolved) = response else {
            return Err(SourceError::Unavailable);
        };
        let info_hash = resolved.info_hash.as_string();
        let existing: Option<String> =
            sqlx::query_scalar("SELECT source_id FROM sources WHERE info_hash = ?")
                .bind(&info_hash)
                .fetch_optional(&self.user)
                .await?;
        let source_id = existing.unwrap_or_else(|| Uuid::new_v4().to_string());
        let files: Vec<SourceFile> = resolved
            .info
            .iter_file_details()
            .enumerate()
            .map(|(index, file)| {
                let name = file.filename.to_string();
                SourceFile {
                    file_index: u32::try_from(index).unwrap_or(u32::MAX),
                    likely_media: is_media(&name),
                    name,
                    size_bytes: file.len,
                    ..Default::default()
                }
            })
            .collect();
        let mut transaction = self.user.begin().await?;
        sqlx::query(
            "INSERT INTO sources (source_id, info_hash, magnet, torrent_file, state, created_at)
             VALUES (?, ?, ?, ?, 1, unixepoch())
             ON CONFLICT(info_hash) DO UPDATE SET state = 1",
        )
        .bind(&source_id)
        .bind(&info_hash)
        .bind(magnet)
        .bind(resolved.torrent_bytes.as_ref())
        .execute(&mut *transaction)
        .await?;
        sqlx::query(
            "INSERT OR IGNORE INTO source_bindings
             (source_id, media_type, tmdb_id, season_number, episode_number)
             VALUES (?, ?, ?, ?, ?)",
        )
        .bind(&source_id)
        .bind(content.media_type.to_i32())
        .bind(content.tmdb_id)
        .bind(content.season_number)
        .bind(content.episode_number)
        .execute(&mut *transaction)
        .await?;
        for file in &files {
            sqlx::query(
                "INSERT OR REPLACE INTO source_files
                 (source_id, file_index, name, size_bytes, likely_media) VALUES (?, ?, ?, ?, ?)",
            )
            .bind(&source_id)
            .bind(file.file_index)
            .bind(&file.name)
            .bind(i64::try_from(file.size_bytes).map_err(|_| SourceError::Invalid)?)
            .bind(file.likely_media)
            .execute(&mut *transaction)
            .await?;
        }
        transaction.commit().await?;
        Ok(Source {
            source_id,
            content: content.into(),
            state: SourceState::Ready.into(),
            files,
            ..Default::default()
        })
    }

    pub(crate) async fn list(&self, content: &ContentRef) -> Result<Vec<Source>, SourceError> {
        validate_content(content)?;
        let rows = sqlx::query(
            "SELECT s.source_id, f.file_index, f.name, f.size_bytes, f.likely_media
             FROM sources s
             JOIN source_bindings b ON b.source_id = s.source_id
             LEFT JOIN source_files f ON f.source_id = s.source_id
             WHERE s.state = 1 AND b.media_type = ? AND b.tmdb_id = ?
               AND b.season_number IS ? AND b.episode_number IS ?
             ORDER BY s.created_at, f.file_index",
        )
        .bind(content.media_type.to_i32())
        .bind(content.tmdb_id)
        .bind(content.season_number)
        .bind(content.episode_number)
        .fetch_all(&self.user)
        .await?;
        let mut sources: Vec<Source> = Vec::new();
        for row in rows {
            let id: String = row.try_get("source_id")?;
            if sources.last().is_none_or(|source| source.source_id != id) {
                sources.push(Source {
                    source_id: id.clone(),
                    content: content.clone().into(),
                    state: SourceState::Ready.into(),
                    ..Default::default()
                });
            }
            if let Some(index) = row.try_get::<Option<i64>, _>("file_index")? {
                let source = sources.last_mut().ok_or(SourceError::Unavailable)?;
                source.files.push(SourceFile {
                    file_index: u32::try_from(index).map_err(|_| SourceError::Invalid)?,
                    name: row.try_get("name")?,
                    size_bytes: u64::try_from(row.try_get::<i64, _>("size_bytes")?)
                        .map_err(|_| SourceError::Invalid)?,
                    likely_media: row.try_get("likely_media")?,
                    ..Default::default()
                });
            }
        }
        Ok(sources)
    }

    pub(crate) async fn remove(&self, source_id: &str) -> Result<(), SourceError> {
        let in_use = self
            .playbacks
            .lock()
            .await
            .values()
            .any(|playback| playback.source_id == source_id);
        if in_use {
            return Err(SourceError::InUse);
        }
        let result = sqlx::query("UPDATE sources SET state = 3 WHERE source_id = ? AND state = 1")
            .bind(source_id)
            .execute(&self.user)
            .await?;
        if result.rows_affected() == 0 {
            return Err(SourceError::NotFound);
        }
        Ok(())
    }

    pub(crate) async fn start(
        &self,
        source_id: &str,
        file_index: u32,
        idempotency_key: &str,
    ) -> Result<Playback, SourceError> {
        if idempotency_key.is_empty() || idempotency_key.len() > 128 {
            return Err(SourceError::Invalid);
        }
        let previous = { self.idempotency.lock().await.get(idempotency_key).copied() };
        if let Some(id) = previous {
            return self.playback(id).await;
        }
        let row = sqlx::query(
            "SELECT s.torrent_file, f.name, f.size_bytes
             FROM sources s JOIN source_files f ON f.source_id = s.source_id
             WHERE s.source_id = ? AND s.state = 1 AND f.file_index = ?",
        )
        .bind(source_id)
        .bind(file_index)
        .fetch_optional(&self.user)
        .await?
        .ok_or(SourceError::NotFound)?;
        let torrent: Vec<u8> = row.try_get("torrent_file")?;
        let file_name: String = row.try_get("name")?;
        let size = u64::try_from(row.try_get::<i64, _>("size_bytes")?)
            .map_err(|_| SourceError::Invalid)?;
        if size > self.cache_limit().await? {
            return Err(SourceError::Capacity);
        }
        let response = self
            .session()
            .await?
            .add_torrent(
                AddTorrent::from_bytes(torrent),
                Some(AddTorrentOptions {
                    only_files: Some(vec![
                        usize::try_from(file_index).map_err(|_| SourceError::Invalid)?,
                    ]),
                    overwrite: true,
                    ..Default::default()
                }),
            )
            .await
            .map_err(|_| SourceError::Unavailable)?;
        let handle = response.into_handle().ok_or(SourceError::Unavailable)?;
        let command = self.playback_command.lock().await;
        let previous = { self.idempotency.lock().await.get(idempotency_key).copied() };
        if let Some(id) = previous {
            drop(command);
            return self.playback(id).await;
        }
        let previous: Vec<ActivePlayback> = self
            .playbacks
            .lock()
            .await
            .drain()
            .map(|(_, playback)| playback)
            .collect();
        self.idempotency.lock().await.clear();
        if let Some(session) = self.active_session().await {
            for active in previous {
                pause_if_live(&session, &active.handle).await?;
            }
        }
        let playback_id = Uuid::new_v4();
        let credential = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
        self.playbacks.lock().await.insert(
            playback_id,
            ActivePlayback {
                source_id: source_id.to_owned(),
                handle,
                file_index: usize::try_from(file_index).map_err(|_| SourceError::Invalid)?,
                file_name,
                size,
                credential,
            },
        );
        self.idempotency
            .lock()
            .await
            .insert(idempotency_key.to_owned(), playback_id);
        drop(command);
        self.playback(playback_id).await
    }

    pub(crate) async fn playback(&self, id: Uuid) -> Result<Playback, SourceError> {
        let (handle, credential, file_name, size) = {
            let playbacks = self.playbacks.lock().await;
            let active = playbacks.get(&id).ok_or(SourceError::NotFound)?;
            let values = (
                active.handle.clone(),
                active.credential.clone(),
                active.file_name.clone(),
                active.size,
            );
            drop(playbacks);
            values
        };
        let stats = handle.stats();
        let playback_state = match stats.state {
            TorrentStatsState::Initializing { paused: true } | TorrentStatsState::Paused => {
                PlaybackState::Paused
            }
            TorrentStatsState::Initializing { paused: false } => PlaybackState::Preparing,
            TorrentStatsState::Live => PlaybackState::Ready,
            TorrentStatsState::Error => PlaybackState::Failed,
        };
        let (download_bytes_per_second, peers) = stats.live.as_ref().map_or((0, 0), |live| {
            (
                live.download_speed.as_bytes(),
                live.snapshot.peer_stats.live,
            )
        });
        Ok(Playback {
            playback_id: id.to_string(),
            state: playback_state.into(),
            media_url: format!("http://{}/media/{id}?token={}", self.address, credential),
            size_bytes: size,
            mime_type: mime_type(&file_name).into(),
            downloaded_bytes: stats.progress_bytes,
            total_bytes: stats.total_bytes,
            download_bytes_per_second,
            peers,
            ..Default::default()
        })
    }

    pub(crate) async fn pause(&self, id: Uuid) -> Result<Playback, SourceError> {
        let command = self.playback_command.lock().await;
        let handle = self.playback_handle(id).await?;
        let session = self
            .active_session()
            .await
            .ok_or(SourceError::Unavailable)?;
        pause_if_live(&session, &handle).await?;
        drop(command);
        self.playback(id).await
    }

    pub(crate) async fn resume(&self, id: Uuid) -> Result<Playback, SourceError> {
        let command = self.playback_command.lock().await;
        let handle = self.playback_handle(id).await?;
        let session = self
            .active_session()
            .await
            .ok_or(SourceError::Unavailable)?;
        if matches!(
            handle.stats().state,
            TorrentStatsState::Paused | TorrentStatsState::Initializing { paused: true }
        ) {
            session
                .unpause(&handle)
                .await
                .map_err(|_| SourceError::Unavailable)?;
        }
        drop(command);
        self.playback(id).await
    }

    async fn playback_handle(&self, id: Uuid) -> Result<Arc<ManagedTorrent>, SourceError> {
        self.playbacks
            .lock()
            .await
            .get(&id)
            .map(|active| active.handle.clone())
            .ok_or(SourceError::NotFound)
    }

    pub(crate) async fn stop(&self, id: Uuid) -> Result<(), SourceError> {
        let command = self.playback_command.lock().await;
        let active = self
            .playbacks
            .lock()
            .await
            .remove(&id)
            .ok_or(SourceError::NotFound)?;
        self.idempotency
            .lock()
            .await
            .retain(|_, value| *value != id);
        if let Some(session) = self.active_session().await {
            pause_if_live(&session, &active.handle).await?;
        }
        drop(command);
        Ok(())
    }

    pub(crate) async fn shutdown(&self) {
        self.playbacks.lock().await.clear();
        if let Some(session) = self.take_session().await {
            session.stop().await;
        }
    }

    pub(crate) async fn cache_settings(&self) -> Result<CacheSettings, SourceError> {
        let path = self.download_dir.clone();
        let used_bytes = tokio::task::spawn_blocking(move || directory_size(&path))
            .await
            .map_err(|_| SourceError::Unavailable)?
            .map_err(|_| SourceError::Unavailable)?;
        Ok(CacheSettings {
            directory: self.download_dir.to_string_lossy().into_owned(),
            limit_bytes: self.cache_limit().await?,
            used_bytes,
            ..Default::default()
        })
    }

    pub(crate) async fn set_cache_limit(
        &self,
        limit_bytes: u64,
    ) -> Result<CacheSettings, SourceError> {
        if !(MIN_CACHE_LIMIT..=MAX_CACHE_LIMIT).contains(&limit_bytes) {
            return Err(SourceError::Invalid);
        }
        sqlx::query(
            "INSERT INTO settings (key, value) VALUES ('cache_limit_bytes', ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        )
        .bind(limit_bytes.to_string())
        .execute(&self.user)
        .await?;
        self.cache_settings().await
    }

    pub(crate) async fn clear_cache(&self) -> Result<CacheSettings, SourceError> {
        let command = self.playback_command.lock().await;
        if !self.playbacks.lock().await.is_empty() {
            return Err(SourceError::InUse);
        }
        if let Some(session) = self.take_session().await {
            session.stop().await;
        }
        match tokio::fs::symlink_metadata(&self.download_dir).await {
            Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_dir() => {
                return Err(SourceError::Unavailable);
            }
            Ok(_) => tokio::fs::remove_dir_all(&self.download_dir)
                .await
                .map_err(|_| SourceError::Unavailable)?,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => return Err(SourceError::Unavailable),
        }
        tokio::fs::create_dir_all(&self.download_dir)
            .await
            .map_err(|_| SourceError::Unavailable)?;
        drop(command);
        self.cache_settings().await
    }

    async fn cache_limit(&self) -> Result<u64, SourceError> {
        let value: Option<String> =
            sqlx::query_scalar("SELECT value FROM settings WHERE key = 'cache_limit_bytes'")
                .fetch_optional(&self.user)
                .await?;
        Ok(value
            .and_then(|value| value.parse().ok())
            .unwrap_or(DEFAULT_CACHE_LIMIT))
    }

    pub(crate) fn media_router(self: &Arc<Self>) -> Router {
        Router::new()
            .route("/media/{playback_id}", get(media))
            .with_state(self.clone())
    }
}

fn directory_size(path: &std::path::Path) -> std::io::Result<u64> {
    let metadata = match std::fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(0),
        Err(error) => return Err(error),
    };
    if metadata.file_type().is_symlink() {
        return Err(std::io::Error::other("cache root cannot be a symlink"));
    }
    if metadata.is_file() {
        return Ok(metadata.len());
    }
    let mut total = 0u64;
    for entry in std::fs::read_dir(path)? {
        let entry = entry?;
        let metadata = std::fs::symlink_metadata(entry.path())?;
        if metadata.file_type().is_symlink() {
            continue;
        }
        total = total.saturating_add(if metadata.is_dir() {
            directory_size(&entry.path())?
        } else {
            metadata.len()
        });
    }
    Ok(total)
}

async fn pause_if_live(session: &Session, handle: &Arc<ManagedTorrent>) -> Result<(), SourceError> {
    if !matches!(
        handle.stats().state,
        TorrentStatsState::Paused | TorrentStatsState::Initializing { paused: true }
    ) {
        session
            .pause(handle)
            .await
            .map_err(|_| SourceError::Unavailable)?;
    }
    Ok(())
}

#[derive(Deserialize)]
struct MediaQuery {
    token: String,
}

async fn media(
    State(engine): State<Arc<SourceEngine>>,
    Path(playback_id): Path<Uuid>,
    Query(query): Query<MediaQuery>,
    method: Method,
    headers: HeaderMap,
) -> Response {
    match media_response(&engine, playback_id, &query.token, &method, &headers).await {
        Ok(response) => response,
        Err(MediaFailure::Status(status)) => status.into_response(),
        Err(MediaFailure::RangeNotSatisfiable(size)) => {
            let mut response = StatusCode::RANGE_NOT_SATISFIABLE.into_response();
            if let Ok(value) = HeaderValue::from_str(&format!("bytes */{size}")) {
                response.headers_mut().insert(header::CONTENT_RANGE, value);
            }
            response
        }
    }
}

enum MediaFailure {
    Status(StatusCode),
    RangeNotSatisfiable(u64),
}

impl From<StatusCode> for MediaFailure {
    fn from(status: StatusCode) -> Self {
        Self::Status(status)
    }
}

#[allow(clippy::significant_drop_tightening)]
async fn media_response(
    engine: &SourceEngine,
    playback_id: Uuid,
    credential: &str,
    method: &Method,
    headers: &HeaderMap,
) -> Result<Response, MediaFailure> {
    if !matches!(*method, Method::GET | Method::HEAD) {
        return Err(StatusCode::METHOD_NOT_ALLOWED.into());
    }
    if let Some(origin) = headers.get(header::ORIGIN)
        && engine.origin.as_deref().map(str::as_bytes) != Some(origin.as_bytes())
    {
        return Err(StatusCode::FORBIDDEN.into());
    }
    let playbacks = engine.playbacks.lock().await;
    let active = playbacks.get(&playback_id).ok_or(StatusCode::GONE)?;
    if active
        .credential
        .as_bytes()
        .ct_eq(credential.as_bytes())
        .unwrap_u8()
        != 1
    {
        return Err(StatusCode::FORBIDDEN.into());
    }
    let handle = active.handle.clone();
    let file_index = active.file_index;
    let file_name = active.file_name.clone();
    let expected_size = active.size;
    drop(playbacks);
    let mut stream = handle
        .stream(file_index)
        .await
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    let size = stream.len();
    if size != expected_size {
        return Err(StatusCode::SERVICE_UNAVAILABLE.into());
    }
    let range = match parse_range(headers.get(header::RANGE), size) {
        Ok(range) => range,
        Err(StatusCode::RANGE_NOT_SATISFIABLE) => {
            return Err(MediaFailure::RangeNotSatisfiable(size));
        }
        Err(status) => return Err(status.into()),
    };
    let (status, start, length, content_range) = match range {
        Some((start, end)) => (
            StatusCode::PARTIAL_CONTENT,
            start,
            end - start + 1,
            Some(format!("bytes {start}-{end}/{size}")),
        ),
        None => (StatusCode::OK, 0, size, None),
    };
    stream
        .seek(std::io::SeekFrom::Start(start))
        .await
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    let mut response = if *method == Method::HEAD {
        Body::empty().into_response()
    } else {
        Body::from_stream(ReaderStream::new(stream.take(length))).into_response()
    };
    *response.status_mut() = status;
    let response_headers = response.headers_mut();
    response_headers.insert(header::ACCEPT_RANGES, HeaderValue::from_static("bytes"));
    response_headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    response_headers.insert(
        header::CONTENT_LENGTH,
        HeaderValue::from_str(&length.to_string())
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?,
    );
    response_headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static(mime_type(&file_name)),
    );
    if let Some(value) = content_range {
        response_headers.insert(
            header::CONTENT_RANGE,
            HeaderValue::from_str(&value).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?,
        );
    }
    if let Some(origin) = headers.get(header::ORIGIN).cloned() {
        response_headers.insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, origin);
    }
    Ok(response)
}

fn parse_range(value: Option<&HeaderValue>, size: u64) -> Result<Option<(u64, u64)>, StatusCode> {
    let Some(value) = value else { return Ok(None) };
    let value = value.to_str().map_err(|_| StatusCode::BAD_REQUEST)?;
    let Some(spec) = value.strip_prefix("bytes=") else {
        return Err(StatusCode::BAD_REQUEST);
    };
    if spec.contains(',') {
        return Ok(None);
    }
    let (start, end) = spec.split_once('-').ok_or(StatusCode::BAD_REQUEST)?;
    if start.is_empty() {
        let suffix = end.parse::<u64>().map_err(|_| StatusCode::BAD_REQUEST)?;
        if suffix == 0 || size == 0 {
            return Err(StatusCode::RANGE_NOT_SATISFIABLE);
        }
        return Ok(Some((size.saturating_sub(suffix), size - 1)));
    }
    let start = start.parse::<u64>().map_err(|_| StatusCode::BAD_REQUEST)?;
    if start >= size {
        return Err(StatusCode::RANGE_NOT_SATISFIABLE);
    }
    let end = if end.is_empty() {
        size - 1
    } else {
        end.parse::<u64>()
            .map_err(|_| StatusCode::BAD_REQUEST)?
            .min(size - 1)
    };
    if end < start {
        return Err(StatusCode::RANGE_NOT_SATISFIABLE);
    }
    Ok(Some((start, end)))
}

fn validate_content(content: &ContentRef) -> Result<(), SourceError> {
    let top_level = content.season_number.is_none() && content.episode_number.is_none();
    let episode = content.season_number.is_some() && content.episode_number.is_some();
    if content.tmdb_id == 0
        || !matches!(content.media_type.to_i32(), 1 | 2)
        || !(top_level || (content.media_type.to_i32() == 2 && episode))
    {
        return Err(SourceError::Invalid);
    }
    Ok(())
}

fn is_media(name: &str) -> bool {
    matches!(
        name.rsplit('.')
            .next()
            .map(str::to_ascii_lowercase)
            .as_deref(),
        Some("mp4" | "m4v" | "mkv" | "webm" | "mov" | "avi")
    )
}

fn mime_type(name: &str) -> &'static str {
    match name
        .rsplit('.')
        .next()
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("mp4" | "m4v") => "video/mp4",
        Some("webm") => "video/webm",
        Some("mov") => "video/quicktime",
        Some("mkv") => "video/x-matroska",
        _ => "application/octet-stream",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn range_parser_covers_player_request_forms() {
        assert_eq!(parse_range(None, 100), Ok(None));
        assert_eq!(
            parse_range(Some(&HeaderValue::from_static("bytes=10-19")), 100),
            Ok(Some((10, 19)))
        );
        assert_eq!(
            parse_range(Some(&HeaderValue::from_static("bytes=10-")), 100),
            Ok(Some((10, 99)))
        );
        assert_eq!(
            parse_range(Some(&HeaderValue::from_static("bytes=-10")), 100),
            Ok(Some((90, 99)))
        );
        assert_eq!(
            parse_range(Some(&HeaderValue::from_static("bytes=0-1,4-5")), 100),
            Ok(None)
        );
        assert_eq!(
            parse_range(Some(&HeaderValue::from_static("bytes=100-")), 100),
            Err(StatusCode::RANGE_NOT_SATISFIABLE)
        );
    }
}
