//! TMDB v3 metadata, private credentials and the user's disposable catalog cache.

use std::{
    fmt,
    io::Write as _,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use reqwest::{Client, StatusCode, Url};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use sqlx::SqlitePool;
use tokio::sync::{Mutex, RwLock, Semaphore};
use tokio::time::Instant;

const SHORT_TTL: i64 = 3_600;
const DETAIL_TTL: i64 = 86_400;
const MAX_BODY: usize = 2 * 1024 * 1024;

#[derive(Debug, thiserror::Error)]
pub(crate) enum TmdbError {
    #[error("invalid TMDB configuration")]
    Configuration,
    #[error("invalid TMDB credential")]
    InvalidCredential,
    #[error("TMDB is not configured")]
    NotConfigured,
    #[error("TMDB is unavailable")]
    Unavailable,
    #[error("TMDB title not found")]
    NotFound,
    #[error("TMDB rate limited")]
    RateLimited { retry_after_seconds: u32 },
    #[error("catalog cache database error")]
    Database(#[from] sqlx::Error),
    #[error("credential file I/O error")]
    Io(#[from] std::io::Error),
    #[error("invalid TMDB response")]
    InvalidResponse,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub(crate) struct ConnectionStatus {
    pub(super) configured: bool,
    pub(super) remembered: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub(crate) struct Cached<T> {
    pub(super) data: T,
    pub(super) stale: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub(crate) struct TitlePage {
    pub(super) titles: Vec<TitleData>,
    pub(super) page: u32,
    pub(super) total_pages: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub(crate) struct TitleData {
    pub(super) media_type: u32,
    pub(super) tmdb_id: u32,
    pub(super) title: String,
    pub(super) overview: String,
    pub(super) release_year: u32,
    pub(super) poster_url: String,
    pub(super) backdrop_url: String,
    pub(super) vote_average: f64,
    pub(super) genres: Vec<GenreData>,
    pub(super) cast: Vec<CastData>,
    pub(super) runtime_minutes: u32,
    pub(super) seasons: Vec<SeasonData>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub(crate) struct GenreData {
    pub(super) id: u32,
    pub(super) name: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub(crate) struct CastData {
    pub(super) name: String,
    pub(super) character: String,
    pub(super) profile_url: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub(crate) struct SeasonData {
    pub(super) season_number: u32,
    pub(super) name: String,
    pub(super) overview: String,
    pub(super) poster_url: String,
    pub(super) episode_count: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub(crate) struct EpisodeData {
    pub(super) episode_number: u32,
    pub(super) name: String,
    pub(super) overview: String,
    pub(super) still_url: String,
    pub(super) air_date: String,
    pub(super) runtime_minutes: u32,
}

#[derive(Clone)]
struct Secret(String);

impl fmt::Debug for Secret {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("[REDACTED]")
    }
}

#[derive(Debug)]
struct Credential {
    token: Option<Secret>,
    remembered: bool,
}

#[derive(Debug)]
pub(crate) struct Tmdb {
    user: SqlitePool,
    token_file: PathBuf,
    base_url: Url,
    client: Client,
    credential: RwLock<Credential>,
    generation: AtomicU64,
    publication: Mutex<()>,
    cooldown: Mutex<Option<Instant>>,
    requests: Semaphore,
}

impl Tmdb {
    pub(super) async fn new(
        user: SqlitePool,
        token_file: PathBuf,
        initial_token: Option<String>,
        base_url: &str,
    ) -> Result<Self, TmdbError> {
        let base_url = Url::parse(&format!("{}/", base_url.trim_end_matches('/')))
            .map_err(|_| TmdbError::Configuration)?;
        // Production is HTTPS; HTTP is restricted to local deterministic fixtures.
        if !(base_url.scheme() == "https"
            || (base_url.scheme() == "http"
                && matches!(
                    base_url.host_str(),
                    Some("127.0.0.1" | "[::1]" | "localhost")
                )))
            || !base_url.username().is_empty()
            || base_url.password().is_some()
            || base_url.query().is_some()
            || base_url.fragment().is_some()
        {
            return Err(TmdbError::Configuration);
        }
        let (token, remembered) = match initial_token {
            Some(token) => (Some(parse_secret(&token)?), false),
            None => match tokio::fs::read_to_string(&token_file).await {
                Ok(token) => (Some(parse_secret(&token)?), true),
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => (None, false),
                Err(error) => return Err(error.into()),
            },
        };
        Ok(Self {
            user,
            token_file,
            base_url,
            client: Client::builder()
                .timeout(Duration::from_secs(8))
                .redirect(reqwest::redirect::Policy::none())
                .build()
                .map_err(|_| TmdbError::Configuration)?,
            credential: RwLock::new(Credential { token, remembered }),
            generation: AtomicU64::new(0),
            publication: Mutex::new(()),
            cooldown: Mutex::new(None),
            requests: Semaphore::new(4),
        })
    }

    pub(super) async fn status(&self) -> ConnectionStatus {
        let credential = self.credential.read().await;
        ConnectionStatus {
            configured: credential.token.is_some(),
            remembered: credential.remembered,
        }
    }

    pub(super) async fn configure(
        &self,
        token: &str,
        remember: bool,
    ) -> Result<ConnectionStatus, TmdbError> {
        let generation = {
            let _publication = self.publication.lock().await;
            self.generation
                .fetch_add(1, Ordering::SeqCst)
                .wrapping_add(1)
        };
        let token = parse_secret(token)?;
        let configuration: Configuration = self.http("configuration", &[], &token).await?;
        configuration.validate()?;
        let _publication = self.publication.lock().await;
        if self.generation.load(Ordering::SeqCst) != generation {
            return Ok(self.status().await);
        }
        if remember {
            let path = self.token_file.clone();
            let value = token.0.clone();
            let temporary = tokio::task::spawn_blocking(move || prepare_token(&path, &value))
                .await
                .map_err(|_| TmdbError::Unavailable)??;
            if self.generation.load(Ordering::SeqCst) != generation {
                return Ok(self.status().await);
            }
            tokio::fs::rename(&temporary, &self.token_file).await?;
        } else {
            remove_token(&self.token_file).await?;
        }
        if self.generation.load(Ordering::SeqCst) == generation {
            *self.credential.write().await = Credential {
                token: Some(token),
                remembered: remember,
            };
        }
        Ok(self.status().await)
    }

    pub(super) async fn clear(&self) -> Result<ConnectionStatus, TmdbError> {
        let _publication = self.publication.lock().await;
        self.generation.fetch_add(1, Ordering::SeqCst);
        *self.credential.write().await = Credential {
            token: None,
            remembered: false,
        };
        remove_token(&self.token_file).await?;
        Ok(self.status().await)
    }

    pub(super) async fn list(
        &self,
        media_type: u32,
        category: &str,
        page: u32,
        genre_id: u32,
    ) -> Result<Cached<TitlePage>, TmdbError> {
        let kind = media_path(media_type)?;
        let mut params = vec![("page", page.to_string())];
        if media_type == 1 {
            params.push(("region", "BR".into()));
        }
        let path = if genre_id > 0 {
            params.extend([
                ("with_genres", genre_id.to_string()),
                ("sort_by", "popularity.desc".into()),
                ("include_adult", "false".into()),
            ]);
            format!("discover/{kind}")
        } else {
            let category = match (category, media_type) {
                ("upcoming", 2) => "on_the_air",
                ("popular" | "upcoming" | "top_rated", _) => category,
                _ => return Err(TmdbError::Configuration),
            };
            format!("{kind}/{category}")
        };
        self.cached::<RawPage, _, _>(&path, params, SHORT_TTL, |raw| raw.into_page(media_type))
            .await
    }

    pub(super) async fn search(
        &self,
        media_type: u32,
        query: &str,
        page: u32,
    ) -> Result<Cached<TitlePage>, TmdbError> {
        let path = format!("search/{}", media_path(media_type)?);
        self.cached::<RawPage, _, _>(
            &path,
            vec![
                ("query", query.into()),
                ("page", page.to_string()),
                ("include_adult", "false".into()),
            ],
            SHORT_TTL,
            |raw| raw.into_page(media_type),
        )
        .await
    }

    pub(super) async fn title(
        &self,
        media_type: u32,
        id: u32,
    ) -> Result<Cached<TitleData>, TmdbError> {
        let path = format!("{}/{id}", media_path(media_type)?);
        self.cached::<RawTitle, _, _>(
            &path,
            vec![("append_to_response", "credits".into())],
            DETAIL_TTL,
            |raw| raw.into_title(media_type),
        )
        .await
    }

    pub(super) async fn genres(
        &self,
        media_type: u32,
    ) -> Result<Cached<Vec<GenreData>>, TmdbError> {
        let path = format!("genre/{}/list", media_path(media_type)?);
        self.cached::<RawGenres, _, _>(&path, vec![], SHORT_TTL, |raw| raw.genres)
            .await
    }

    pub(super) async fn seasons(
        &self,
        series_id: u32,
    ) -> Result<Cached<Vec<SeasonData>>, TmdbError> {
        let details = self.title(2, series_id).await?;
        Ok(Cached {
            data: details.data.seasons,
            stale: details.stale,
        })
    }

    pub(super) async fn episodes(
        &self,
        series_id: u32,
        season: u32,
    ) -> Result<Cached<Vec<EpisodeData>>, TmdbError> {
        let path = format!("tv/{series_id}/season/{season}");
        self.cached::<RawEpisodes, _, _>(&path, vec![], DETAIL_TTL, |raw| {
            raw.episodes
                .into_iter()
                .map(RawEpisode::into_episode)
                .collect()
        })
        .await
    }

    async fn cached<R, T, F>(
        &self,
        path: &str,
        mut params: Vec<(&str, String)>,
        ttl: i64,
        map: F,
    ) -> Result<Cached<T>, TmdbError>
    where
        R: DeserializeOwned,
        T: Serialize + DeserializeOwned,
        F: FnOnce(R) -> T,
    {
        let token = self
            .credential
            .read()
            .await
            .token
            .clone()
            .ok_or(TmdbError::NotConfigured)?;
        params.push(("language", "pt-BR".into()));
        params.sort_unstable_by(|a, b| a.0.cmp(b.0));
        let key =
            serde_json::to_string(&(path, &params)).map_err(|_| TmdbError::InvalidResponse)?;
        let stored: Option<(String, i64)> =
            sqlx::query_as("SELECT payload, expires_at FROM catalog_cache WHERE cache_key = ?")
                .bind(&key)
                .fetch_optional(&self.user)
                .await?;
        let now = unix_seconds()?;
        if let Some((payload, expiry)) = &stored
            && *expiry > now
        {
            return Ok(Cached {
                data: serde_json::from_str(payload).map_err(|_| TmdbError::InvalidResponse)?,
                stale: false,
            });
        }
        match self.http::<R>(path, &params, &token).await {
            Ok(raw) => {
                let data = map(raw);
                let payload =
                    serde_json::to_string(&data).map_err(|_| TmdbError::InvalidResponse)?;
                let now = unix_seconds()?;
                sqlx::query(
                    "INSERT INTO catalog_cache(cache_key,payload,expires_at,fetched_at) VALUES(?,?,?,?)
                     ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload,
                     expires_at=excluded.expires_at,fetched_at=excluded.fetched_at",
                ).bind(key).bind(payload).bind(now.saturating_add(ttl)).bind(now)
                    .execute(&self.user).await?;
                Ok(Cached { data, stale: false })
            }
            Err(error @ (TmdbError::Unavailable | TmdbError::RateLimited { .. })) => match stored {
                Some((payload, _)) => Ok(Cached {
                    data: serde_json::from_str(&payload).map_err(|_| TmdbError::InvalidResponse)?,
                    stale: true,
                }),
                None => Err(error),
            },
            Err(error) => Err(error),
        }
    }

    async fn check_cooldown(&self) -> Result<(), TmdbError> {
        if let Some(deadline) = *self.cooldown.lock().await
            && let Some(remaining) = deadline.checked_duration_since(Instant::now())
        {
            return Err(TmdbError::RateLimited {
                retry_after_seconds: u32::try_from(remaining.as_secs().saturating_add(1))
                    .unwrap_or(u32::MAX),
            });
        }
        Ok(())
    }

    async fn http<T: DeserializeOwned>(
        &self,
        path: &str,
        params: &[(&str, String)],
        token: &Secret,
    ) -> Result<T, TmdbError> {
        // The deadline includes semaphore queueing, headers, and the complete body.
        tokio::time::timeout(Duration::from_secs(8), async {
            self.check_cooldown().await?;
            let _permit = self
                .requests
                .acquire()
                .await
                .map_err(|_| TmdbError::Unavailable)?;
            self.check_cooldown().await?;
            let url = self
                .base_url
                .join(path)
                .map_err(|_| TmdbError::Configuration)?;
            let mut response = self
                .client
                .get(url)
                .bearer_auth(&token.0)
                .header("accept", "application/json")
                .query(params)
                .send()
                .await
                .map_err(|_| TmdbError::Unavailable)?;
            match response.status() {
                StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => {
                    return Err(TmdbError::InvalidCredential);
                }
                StatusCode::NOT_FOUND => return Err(TmdbError::NotFound),
                StatusCode::TOO_MANY_REQUESTS => {
                    let retry_after_seconds = response
                        .headers()
                        .get("retry-after")
                        .and_then(|value| value.to_str().ok())
                        .and_then(|value| value.parse::<u32>().ok())
                        .unwrap_or(60)
                        .max(1);
                    let deadline =
                        Instant::now() + Duration::from_secs(u64::from(retry_after_seconds));
                    let mut cooldown = self.cooldown.lock().await;
                    *cooldown = Some(cooldown.map_or(deadline, |current| current.max(deadline)));
                    drop(cooldown);
                    return Err(TmdbError::RateLimited {
                        retry_after_seconds,
                    });
                }
                status if status.is_server_error() => return Err(TmdbError::Unavailable),
                status if !status.is_success() => return Err(TmdbError::InvalidResponse),
                _ => {}
            }
            if response
                .content_length()
                .is_some_and(|length| length > u64::try_from(MAX_BODY).unwrap_or(u64::MAX))
            {
                return Err(TmdbError::InvalidResponse);
            }
            let mut bytes = Vec::new();
            while let Some(chunk) = response.chunk().await.map_err(|_| TmdbError::Unavailable)? {
                if bytes.len().saturating_add(chunk.len()) > MAX_BODY {
                    return Err(TmdbError::InvalidResponse);
                }
                bytes.extend_from_slice(&chunk);
            }
            serde_json::from_slice(&bytes).map_err(|_| TmdbError::InvalidResponse)
        })
        .await
        .map_err(|_| TmdbError::Unavailable)?
    }
}

const fn media_path(media_type: u32) -> Result<&'static str, TmdbError> {
    match media_type {
        1 => Ok("movie"),
        2 => Ok("tv"),
        _ => Err(TmdbError::Configuration),
    }
}

fn parse_secret(value: &str) -> Result<Secret, TmdbError> {
    let value = value.trim();
    if value.is_empty() || value.len() > 4096 || !value.bytes().all(|b| b.is_ascii_graphic()) {
        return Err(TmdbError::InvalidCredential);
    }
    Ok(Secret(value.into()))
}

fn unix_seconds() -> Result<i64, TmdbError> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()
        .and_then(|duration| i64::try_from(duration.as_secs()).ok())
        .ok_or(TmdbError::Unavailable)
}

fn prepare_token(path: &Path, token: &str) -> Result<tempfile::TempPath, std::io::Error> {
    let parent = path
        .parent()
        .ok_or_else(|| std::io::Error::other("missing credential directory"))?;
    let mut file = tempfile::NamedTempFile::new_in(parent)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt as _;
        file.as_file()
            .set_permissions(std::fs::Permissions::from_mode(0o600))?;
    }
    file.write_all(token.as_bytes())?;
    file.as_file().sync_all()?;
    Ok(file.into_temp_path())
}

async fn remove_token(path: &Path) -> Result<(), std::io::Error> {
    match tokio::fs::remove_file(path).await {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    }
}

fn image(path: Option<&str>, size: &str) -> String {
    match path.and_then(|path| path.strip_prefix('/')) {
        Some(name)
            if !name.is_empty()
                && !name.starts_with('.')
                && name
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'_' | b'-' | b'.')) =>
        {
            format!("https://image.tmdb.org/t/p/{size}/{name}")
        }
        _ => String::new(),
    }
}

#[derive(Deserialize)]
struct Configuration {
    images: ImageConfiguration,
}

#[derive(Deserialize)]
struct ImageConfiguration {
    secure_base_url: String,
    poster_sizes: Vec<String>,
    backdrop_sizes: Vec<String>,
    profile_sizes: Vec<String>,
}

impl Configuration {
    fn validate(&self) -> Result<(), TmdbError> {
        if self.images.secure_base_url != "https://image.tmdb.org/t/p/"
            || !self.images.poster_sizes.iter().any(|s| s == "w500")
            || !self.images.backdrop_sizes.iter().any(|s| s == "w780")
            || !self.images.profile_sizes.iter().any(|s| s == "w185")
        {
            return Err(TmdbError::InvalidResponse);
        }
        Ok(())
    }
}

#[derive(Deserialize)]
struct RawPage {
    results: Vec<RawTitle>,
    page: u32,
    total_pages: u32,
}

impl RawPage {
    fn into_page(self, media_type: u32) -> TitlePage {
        TitlePage {
            titles: self
                .results
                .into_iter()
                .map(|title| title.into_title(media_type))
                .collect(),
            page: self.page,
            total_pages: self.total_pages.min(500),
        }
    }
}

#[derive(Deserialize)]
struct RawTitle {
    id: u32,
    title: Option<String>,
    name: Option<String>,
    overview: Option<String>,
    release_date: Option<String>,
    first_air_date: Option<String>,
    poster_path: Option<String>,
    backdrop_path: Option<String>,
    vote_average: Option<f64>,
    genres: Option<Vec<GenreData>>,
    genre_ids: Option<Vec<u32>>,
    credits: Option<RawCredits>,
    runtime: Option<u32>,
    episode_run_time: Option<Vec<u32>>,
    seasons: Option<Vec<RawSeason>>,
}

#[derive(Deserialize)]
struct RawCredits {
    cast: Option<Vec<RawCast>>,
}

#[derive(Deserialize)]
struct RawCast {
    name: Option<String>,
    character: Option<String>,
    profile_path: Option<String>,
}

impl RawTitle {
    fn into_title(self, media_type: u32) -> TitleData {
        let (title, date) = if media_type == 1 {
            (self.title, self.release_date)
        } else {
            (self.name, self.first_air_date)
        };
        TitleData {
            media_type,
            tmdb_id: self.id,
            title: title.unwrap_or_default(),
            overview: self.overview.unwrap_or_default(),
            release_year: date
                .as_deref()
                .and_then(|d| d.get(..4))
                .and_then(|year| year.parse().ok())
                .unwrap_or_default(),
            poster_url: image(self.poster_path.as_deref(), "w500"),
            backdrop_url: image(self.backdrop_path.as_deref(), "w780"),
            vote_average: self.vote_average.unwrap_or_default(),
            genres: self.genres.unwrap_or_else(|| {
                self.genre_ids
                    .unwrap_or_default()
                    .into_iter()
                    .map(|id| GenreData {
                        id,
                        name: String::new(),
                    })
                    .collect()
            }),
            cast: self
                .credits
                .and_then(|credits| credits.cast)
                .unwrap_or_default()
                .into_iter()
                .take(12)
                .map(|cast| CastData {
                    name: cast.name.unwrap_or_default(),
                    character: cast.character.unwrap_or_default(),
                    profile_url: image(cast.profile_path.as_deref(), "w185"),
                })
                .collect(),
            runtime_minutes: self
                .runtime
                .or_else(|| {
                    self.episode_run_time
                        .and_then(|times| times.first().copied())
                })
                .unwrap_or_default(),
            seasons: self
                .seasons
                .unwrap_or_default()
                .into_iter()
                .map(RawSeason::into_season)
                .collect(),
        }
    }
}

#[derive(Deserialize)]
struct RawGenres {
    genres: Vec<GenreData>,
}

#[derive(Deserialize)]
struct RawSeason {
    season_number: u32,
    name: Option<String>,
    overview: Option<String>,
    poster_path: Option<String>,
    episode_count: Option<u32>,
}

impl RawSeason {
    fn into_season(self) -> SeasonData {
        SeasonData {
            season_number: self.season_number,
            name: self.name.unwrap_or_default(),
            overview: self.overview.unwrap_or_default(),
            poster_url: image(self.poster_path.as_deref(), "w500"),
            episode_count: self.episode_count.unwrap_or_default(),
        }
    }
}

#[derive(Deserialize)]
struct RawEpisodes {
    episodes: Vec<RawEpisode>,
}

#[derive(Deserialize)]
struct RawEpisode {
    episode_number: u32,
    name: Option<String>,
    overview: Option<String>,
    still_path: Option<String>,
    air_date: Option<String>,
    runtime: Option<u32>,
}

impl RawEpisode {
    fn into_episode(self) -> EpisodeData {
        EpisodeData {
            episode_number: self.episode_number,
            name: self.name.unwrap_or_default(),
            overview: self.overview.unwrap_or_default(),
            still_url: image(self.still_path.as_deref(), "w500"),
            air_date: self.air_date.unwrap_or_default(),
            runtime_minutes: self.runtime.unwrap_or_default(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        Router,
        body::Body,
        extract::State,
        http::{HeaderMap, Uri},
        response::Response,
        routing::get,
    };
    use serde_json::{Value, json};
    use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
    use std::{
        collections::HashMap,
        sync::{Arc, atomic::AtomicBool},
    };
    use tokio::{net::TcpListener, sync::mpsc, task::JoinHandle};

    type TestResult<T = ()> = Result<T, Box<dyn std::error::Error + Send + Sync>>;

    #[derive(Clone)]
    struct Reply {
        status: StatusCode,
        body: String,
        retry_after: Option<String>,
    }

    impl Reply {
        fn json(value: &Value) -> Self {
            Self {
                status: StatusCode::OK,
                body: value.to_string(),
                retry_after: None,
            }
        }
    }

    struct Request {
        path: String,
        params: HashMap<String, String>,
        authorization: String,
    }

    struct FixtureState {
        replies: RwLock<HashMap<String, Reply>>,
        requests: mpsc::Sender<Request>,
        block: AtomicBool,
        gate: Semaphore,
    }

    async fn handler(
        State(state): State<Arc<FixtureState>>,
        uri: Uri,
        headers: HeaderMap,
    ) -> Response {
        let params = Url::parse(&format!("http://localhost{uri}"))
            .map(|url| {
                url.query_pairs()
                    .map(|(k, v)| (k.into_owned(), v.into_owned()))
                    .collect()
            })
            .unwrap_or_default();
        let authorization = headers
            .get("authorization")
            .and_then(|value| value.to_str().ok())
            .unwrap_or_default()
            .to_owned();
        let request = Request {
            path: uri.path().into(),
            params,
            authorization: authorization.clone(),
        };
        let reply = if authorization == "Bearer invalid" {
            Reply {
                status: StatusCode::UNAUTHORIZED,
                body: "do not expose this secret body".into(),
                retry_after: None,
            }
        } else {
            state
                .replies
                .read()
                .await
                .get(uri.path())
                .cloned()
                .unwrap_or_else(|| Reply {
                    status: StatusCode::NOT_FOUND,
                    body: "{}".into(),
                    retry_after: None,
                })
        };
        if state.requests.send(request).await.is_err() {
            return Response::new(Body::empty());
        }
        if state.block.load(Ordering::SeqCst) {
            match state.gate.acquire().await {
                Ok(permit) => permit.forget(),
                Err(_) => return Response::new(Body::empty()),
            }
        }
        let mut response = Response::new(Body::from(reply.body));
        *response.status_mut() = reply.status;
        if let Some(retry_after) = reply.retry_after
            && let Ok(value) = retry_after.parse()
        {
            response.headers_mut().insert("retry-after", value);
        }
        response
    }

    struct Fixture {
        tmdb: Arc<Tmdb>,
        state: Arc<FixtureState>,
        requests: mpsc::Receiver<Request>,
        server: JoinHandle<std::io::Result<()>>,
        base_url: String,
        _directory: tempfile::TempDir,
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            self.server.abort();
        }
    }

    impl Fixture {
        async fn new(token: Option<&str>) -> TestResult<Self> {
            let directory = tempfile::tempdir()?;
            let pool = SqlitePoolOptions::new()
                .max_connections(4)
                .connect_with(
                    SqliteConnectOptions::new()
                        .filename(directory.path().join("user.sqlite"))
                        .create_if_missing(true),
                )
                .await?;
            sqlx::migrate!("./migrations").run(&pool).await?;
            let (tx, requests) = mpsc::channel(128);
            let state = Arc::new(FixtureState {
                replies: RwLock::new(HashMap::from([(
                    "/3/configuration".into(),
                    Reply::json(&json!({
                        "images": {
                            "secure_base_url": "https://image.tmdb.org/t/p/",
                            "poster_sizes": ["w500"], "backdrop_sizes": ["w780"], "profile_sizes": ["w185"]
                        }
                    })),
                )])),
                requests: tx,
                block: AtomicBool::new(false),
                gate: Semaphore::new(0),
            });
            let listener = TcpListener::bind("127.0.0.1:0").await?;
            let base_url = format!("http://{}/3/", listener.local_addr()?);
            let app = Router::new()
                .fallback(get(handler))
                .with_state(state.clone());
            let server = tokio::spawn(async move { axum::serve(listener, app).await });
            let tmdb = Arc::new(
                Tmdb::new(
                    pool,
                    directory.path().join("tmdb.token"),
                    token.map(str::to_owned),
                    &base_url,
                )
                .await?,
            );
            Ok(Self {
                tmdb,
                state,
                requests,
                server,
                base_url,
                _directory: directory,
            })
        }

        async fn reply(&self, path: &str, value: Value) {
            self.state
                .replies
                .write()
                .await
                .insert(format!("/3/{path}"), Reply::json(&value));
        }

        async fn failure(&self, path: &str, status: StatusCode, retry_after: Option<&str>) {
            self.state.replies.write().await.insert(
                format!("/3/{path}"),
                Reply {
                    status,
                    body: "private upstream error body".into(),
                    retry_after: retry_after.map(str::to_owned),
                },
            );
        }

        async fn request(&mut self) -> TestResult<Request> {
            tokio::time::timeout(Duration::from_secs(3), self.requests.recv())
                .await?
                .ok_or_else(|| std::io::Error::other("fixture request channel closed").into())
        }

        async fn expire(&self) -> TestResult {
            sqlx::query("UPDATE catalog_cache SET expires_at = 0")
                .execute(&self.tmdb.user)
                .await?;
            Ok(())
        }

        async fn reload(&self, initial: Option<&str>) -> Result<Tmdb, TmdbError> {
            Tmdb::new(
                self.tmdb.user.clone(),
                self.tmdb.token_file.clone(),
                initial.map(str::to_owned),
                &self.base_url,
            )
            .await
        }
    }

    fn movie_page() -> Value {
        json!({"results": [{
            "id": 11, "title": "Filme", "overview": null, "release_date": "2026-01-02",
            "poster_path": "/poster.jpg", "backdrop_path": "//evil.test/leak",
            "vote_average": null, "genre_ids": [18]
        }], "page": 2, "total_pages": 900})
    }

    #[tokio::test]
    #[allow(clippy::too_many_lines)]
    async fn movie_tv_lists_search_discover_and_query_identity() -> TestResult {
        let mut f = Fixture::new(Some("valid")).await?;
        for path in [
            "movie/popular",
            "movie/upcoming",
            "movie/top_rated",
            "discover/movie",
            "tv/popular",
            "tv/on_the_air",
            "tv/top_rated",
            "discover/tv",
            "search/movie",
            "search/tv",
        ] {
            f.reply(path, movie_page()).await;
        }
        let page = f.tmdb.list(1, "popular", 2, 0).await?;
        assert!(!page.stale);
        assert_eq!(page.data.page, 2);
        assert_eq!(page.data.total_pages, 500);
        let title = &page.data.titles[0];
        assert_eq!(title.title, "Filme");
        assert_eq!(title.release_year, 2026);
        assert_eq!(title.overview, "");
        assert!(title.vote_average.abs() < f64::EPSILON);
        assert_eq!(
            title.poster_url,
            "https://image.tmdb.org/t/p/w500/poster.jpg"
        );
        assert_eq!(title.backdrop_url, "");
        assert_eq!(title.genres[0].id, 18);
        let request = f.request().await?;
        assert_eq!(request.path, "/3/movie/popular");
        assert_eq!(request.authorization, "Bearer valid");
        assert_eq!(
            request.params,
            HashMap::from([
                ("page".into(), "2".into()),
                ("region".into(), "BR".into()),
                ("language".into(), "pt-BR".into()),
            ])
        );
        for (kind, category, expected) in [
            (1, "upcoming", "movie/upcoming"),
            (1, "top_rated", "movie/top_rated"),
            (2, "popular", "tv/popular"),
            (2, "upcoming", "tv/on_the_air"),
            (2, "top_rated", "tv/top_rated"),
        ] {
            f.tmdb.list(kind, category, 1, 0).await?;
            let request = f.request().await?;
            assert_eq!(request.path, format!("/3/{expected}"));
            assert_eq!(
                request.params.get("language").map(String::as_str),
                Some("pt-BR")
            );
            assert_eq!(request.params.contains_key("region"), kind == 1);
        }
        for kind in [1, 2] {
            f.tmdb.list(kind, "popular", 2, 18).await?;
            let request = f.request().await?;
            assert_eq!(request.path, format!("/3/discover/{}", media_path(kind)?));
            assert_eq!(
                request.params.get("with_genres").map(String::as_str),
                Some("18")
            );
            assert_eq!(
                request.params.get("sort_by").map(String::as_str),
                Some("popularity.desc")
            );
            assert_eq!(
                request.params.get("include_adult").map(String::as_str),
                Some("false")
            );
            f.tmdb.search(kind, "ação & diversão", 2).await?;
            let request = f.request().await?;
            assert_eq!(request.path, format!("/3/search/{}", media_path(kind)?));
            assert_eq!(
                request.params.get("query").map(String::as_str),
                Some("ação & diversão")
            );
            assert_eq!(
                request.params.get("include_adult").map(String::as_str),
                Some("false")
            );
        }
        // Same complete query hits disk, but another page or query is independent.
        f.tmdb.search(2, "ação & diversão", 2).await?;
        assert!(matches!(
            f.requests.try_recv(),
            Err(mpsc::error::TryRecvError::Empty)
        ));
        f.tmdb.search(2, "ação & diversão", 3).await?;
        assert_eq!(
            f.request().await?.params.get("page").map(String::as_str),
            Some("3")
        );
        f.tmdb.search(2, "outro", 2).await?;
        assert_eq!(
            f.request().await?.params.get("query").map(String::as_str),
            Some("outro")
        );
        Ok(())
    }

    #[tokio::test]
    async fn details_cast_genres_seasons_episodes_and_nulls() -> TestResult {
        let mut f = Fixture::new(Some("valid")).await?;
        let cast: Vec<Value> = (0..15)
            .map(|n| {
                json!({
                    "name": format!("Actor {n}"), "character": null, "profile_path": "/profile.jpg"
                })
            })
            .collect();
        f.reply(
            "movie/11",
            json!({
                "id": 11, "title": "Filme", "release_date": null, "runtime": 123,
                "genres": [{"id": 18, "name": "Drama"}], "credits": {"cast": cast}
            }),
        )
        .await;
        let title = f.tmdb.title(1, 11).await?.data;
        assert_eq!(title.runtime_minutes, 123);
        assert_eq!(title.release_year, 0);
        assert_eq!(title.cast.len(), 12);
        assert_eq!(title.cast[0].character, "");
        assert_eq!(
            title.cast[0].profile_url,
            "https://image.tmdb.org/t/p/w185/profile.jpg"
        );
        let request = f.request().await?;
        assert_eq!(
            request.params.get("append_to_response").map(String::as_str),
            Some("credits")
        );
        f.reply(
            "tv/22",
            json!({
                "id": 22, "name": "Série", "first_air_date": "2020-01-01", "episode_run_time": [45],
                "seasons": [{"season_number": 1, "name": null, "overview": null,
                    "poster_path": "/season.jpg", "episode_count": 8}]
            }),
        )
        .await;
        let title = f.tmdb.title(2, 22).await?.data;
        assert_eq!(title.title, "Série");
        assert_eq!(title.media_type, 2);
        assert_eq!(title.release_year, 2020);
        assert_eq!(title.runtime_minutes, 45);
        f.request().await?;
        let seasons = f.tmdb.seasons(22).await?;
        assert_eq!(seasons.data[0].episode_count, 8);
        assert_eq!(seasons.data[0].name, "");
        assert!(matches!(
            f.requests.try_recv(),
            Err(mpsc::error::TryRecvError::Empty)
        ));
        f.reply(
            "tv/22/season/1",
            json!({"episodes": [
                {"episode_number": 1, "name": "Piloto", "overview": null,
                    "still_path": "/still.jpg", "air_date": null, "runtime": null}
            ]}),
        )
        .await;
        let episodes = f.tmdb.episodes(22, 1).await?.data;
        assert_eq!(episodes[0].episode_number, 1);
        assert_eq!(episodes[0].runtime_minutes, 0);
        assert_eq!(episodes[0].air_date, "");
        assert_eq!(
            episodes[0].still_url,
            "https://image.tmdb.org/t/p/w500/still.jpg"
        );
        let request = f.request().await?;
        assert_eq!(request.path, "/3/tv/22/season/1");
        assert_eq!(
            request.params.get("language").map(String::as_str),
            Some("pt-BR")
        );
        for kind in [1, 2] {
            let path = format!("genre/{}/list", media_path(kind)?);
            f.reply(&path, json!({"genres":[{"id":18,"name":"Drama"}]}))
                .await;
            assert_eq!(f.tmdb.genres(kind).await?.data[0].name, "Drama");
            assert_eq!(f.request().await?.path, format!("/3/{path}"));
        }
        let ttls: Vec<i64> = sqlx::query_scalar(
            "SELECT expires_at - fetched_at FROM catalog_cache ORDER BY expires_at - fetched_at",
        )
        .fetch_all(&f.tmdb.user)
        .await?;
        assert_eq!(
            ttls,
            vec![SHORT_TTL, SHORT_TTL, DETAIL_TTL, DETAIL_TTL, DETAIL_TTL]
        );
        Ok(())
    }

    #[tokio::test]
    async fn cache_survives_reload_and_only_transient_failures_serve_stale() -> TestResult {
        let mut f = Fixture::new(Some("valid")).await?;
        f.reply("movie/popular", movie_page()).await;
        f.tmdb.list(1, "popular", 2, 0).await?;
        f.request().await?;
        let reloaded = f.reload(Some("valid")).await?;
        assert!(!reloaded.list(1, "popular", 2, 0).await?.stale);
        assert!(matches!(
            f.requests.try_recv(),
            Err(mpsc::error::TryRecvError::Empty)
        ));
        f.expire().await?;
        f.failure("movie/popular", StatusCode::SERVICE_UNAVAILABLE, None)
            .await;
        let stale = f.tmdb.list(1, "popular", 2, 0).await?;
        assert!(stale.stale);
        assert_eq!(stale.data.titles[0].title, "Filme");
        f.request().await?;
        assert!(matches!(
            f.tmdb.list(1, "popular", 3, 0).await,
            Err(TmdbError::Unavailable)
        ));
        f.request().await?;
        for (status, expected) in [
            (StatusCode::UNAUTHORIZED, "invalid TMDB credential"),
            (StatusCode::FORBIDDEN, "invalid TMDB credential"),
            (StatusCode::NOT_FOUND, "TMDB title not found"),
        ] {
            f.failure("movie/popular", status, None).await;
            let error = f
                .tmdb
                .list(1, "popular", 2, 0)
                .await
                .err()
                .ok_or_else(|| std::io::Error::other("unexpected stale success"))?;
            assert_eq!(error.to_string(), expected);
            assert!(!format!("{error:?}").contains("private upstream"));
            f.request().await?;
        }
        f.server.abort();
        assert!(f.tmdb.list(1, "popular", 2, 0).await?.stale);
        Ok(())
    }

    #[tokio::test]
    async fn credentials_validate_before_replacement_save_reload_override_and_clear() -> TestResult
    {
        let mut f = Fixture::new(None).await?;
        assert!(!f.tmdb.status().await.configured);
        assert!(matches!(
            f.tmdb.genres(1).await,
            Err(TmdbError::NotConfigured)
        ));
        assert!(matches!(
            f.tmdb.configure("invalid", true).await,
            Err(TmdbError::InvalidCredential)
        ));
        assert_eq!(f.request().await?.path, "/3/configuration");
        assert!(!f.tmdb.status().await.configured);
        let status = f.tmdb.configure("valid", true).await?;
        assert!(status.configured && status.remembered);
        assert_eq!(f.request().await?.authorization, "Bearer valid");
        assert_eq!(
            tokio::fs::read_to_string(&f.tmdb.token_file).await?,
            "valid"
        );
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt as _;
            assert_eq!(
                tokio::fs::metadata(&f.tmdb.token_file)
                    .await?
                    .permissions()
                    .mode()
                    & 0o777,
                0o600
            );
        }
        let reloaded = f.reload(None).await?;
        assert!(reloaded.status().await.remembered);
        assert!(format!("{reloaded:?}").contains("[REDACTED]"));
        assert!(!format!("{reloaded:?}").contains("\"valid\""));
        let environment = f.reload(Some("environment")).await?;
        assert!(!environment.status().await.remembered);
        f.reply("genre/movie/list", json!({"genres":[]})).await;
        environment.genres(1).await?;
        assert_eq!(f.request().await?.authorization, "Bearer environment");
        assert!(matches!(
            f.tmdb.configure("invalid", false).await,
            Err(TmdbError::InvalidCredential)
        ));
        f.request().await?;
        assert!(f.tmdb.status().await.remembered);
        assert_eq!(
            tokio::fs::read_to_string(&f.tmdb.token_file).await?,
            "valid"
        );
        let status = f.tmdb.configure("replacement", false).await?;
        assert!(status.configured && !status.remembered);
        f.request().await?;
        assert!(!tokio::fs::try_exists(&f.tmdb.token_file).await?);
        f.tmdb.configure("saved-again", true).await?;
        f.request().await?;
        let status = f.tmdb.clear().await?;
        assert!(!status.configured && !status.remembered);
        assert!(!tokio::fs::try_exists(&f.tmdb.token_file).await?);
        assert!(!f.reload(None).await?.status().await.configured);
        let payloads: Vec<String> = sqlx::query_scalar("SELECT payload FROM catalog_cache")
            .fetch_all(&f.tmdb.user)
            .await?;
        assert!(
            payloads
                .iter()
                .all(|payload| !payload.contains("environment") && !payload.contains("valid"))
        );
        Ok(())
    }

    #[tokio::test]
    async fn rate_limit_cooldown_is_shared_without_retries_and_cached_data_is_stale() -> TestResult
    {
        let mut f = Fixture::new(Some("valid")).await?;
        f.reply("movie/popular", movie_page()).await;
        f.tmdb.list(1, "popular", 2, 0).await?;
        f.request().await?;
        f.expire().await?;
        f.failure("movie/popular", StatusCode::TOO_MANY_REQUESTS, Some("120"))
            .await;
        assert!(f.tmdb.list(1, "popular", 2, 0).await?.stale);
        f.request().await?;
        assert!(matches!(
            f.tmdb.search(2, "series", 1).await,
            Err(TmdbError::RateLimited {
                retry_after_seconds: 1..=120
            })
        ));
        assert!(f.tmdb.list(1, "popular", 2, 0).await?.stale);
        assert!(matches!(
            f.requests.try_recv(),
            Err(mpsc::error::TryRecvError::Empty)
        ));
        *f.tmdb.cooldown.lock().await = Some(Instant::now());
        f.failure("search/tv", StatusCode::TOO_MANY_REQUESTS, Some("30"))
            .await;
        assert!(matches!(
            f.tmdb.search(2, "series", 1).await,
            Err(TmdbError::RateLimited {
                retry_after_seconds: 30
            })
        ));
        f.request().await?;
        Ok(())
    }

    #[tokio::test]
    async fn malformed_oversize_redirect_and_untrusted_images_are_rejected() -> TestResult {
        let mut f = Fixture::new(Some("valid")).await?;
        for body in [
            "not JSON".to_owned(),
            "{}".to_owned(),
            " ".repeat(MAX_BODY + 1),
        ] {
            f.state.replies.write().await.insert(
                "/3/movie/1".into(),
                Reply {
                    status: StatusCode::OK,
                    body,
                    retry_after: None,
                },
            );
            assert!(matches!(
                f.tmdb.title(1, 1).await,
                Err(TmdbError::InvalidResponse)
            ));
            f.request().await?;
        }
        f.failure("movie/1", StatusCode::FOUND, None).await;
        assert!(matches!(
            f.tmdb.title(1, 1).await,
            Err(TmdbError::InvalidResponse)
        ));
        f.request().await?;
        assert!(matches!(
            f.requests.try_recv(),
            Err(mpsc::error::TryRecvError::Empty)
        ));
        for path in [
            "https://evil.test/x",
            "//evil.test/x",
            "/../x",
            "/a/b",
            "/a?key=x",
            "/a#x",
            "/a%2fb",
            "/a\\b",
            "/",
            "/.",
        ] {
            assert_eq!(image(Some(path), "w500"), "");
        }
        f.reply(
            "configuration",
            json!({"images": {
                "secure_base_url": "https://evil.test/t/p/", "poster_sizes":["w500"],
                "backdrop_sizes":["w780"], "profile_sizes":["w185"]
            }}),
        )
        .await;
        assert!(matches!(
            f.tmdb.configure("replacement", true).await,
            Err(TmdbError::InvalidResponse)
        ));
        f.request().await?;
        assert!(!f.tmdb.status().await.remembered);
        Ok(())
    }

    #[tokio::test]
    async fn four_request_limit_cancellation_releases_permits() -> TestResult {
        let mut f = Fixture::new(Some("valid")).await?;
        f.reply("search/movie", movie_page()).await;
        f.state.block.store(true, Ordering::SeqCst);
        let mut tasks = tokio::task::JoinSet::new();
        for page in 1..=4 {
            let tmdb = f.tmdb.clone();
            tasks.spawn(async move { tmdb.search(1, "test", page).await });
        }
        for _ in 0..4 {
            f.request().await?;
        }
        assert_eq!(f.tmdb.requests.available_permits(), 0);
        let queued_was_stale = {
            // Poll the fifth request exactly once: it must queue behind the semaphore.
            let queued = f.tmdb.search(1, "test", 5);
            tokio::pin!(queued);
            let pending = std::future::poll_fn(|cx| {
                std::task::Poll::Ready(queued.as_mut().poll(cx).is_pending())
            })
            .await;
            assert!(pending);
            assert!(matches!(
                f.requests.try_recv(),
                Err(mpsc::error::TryRecvError::Empty)
            ));
            tasks.abort_all();
            while let Some(result) = tasks.join_next().await {
                assert!(result.is_err());
            }
            // Canceled callers release all four client permits without waiting for HTTP bodies.
            assert_eq!(f.tmdb.requests.available_permits(), 4);
            f.state.block.store(false, Ordering::SeqCst);
            f.state.gate.add_permits(4);
            queued.await?.stale
        };
        assert!(!queued_was_stale);
        assert_eq!(
            f.request().await?.params.get("page").map(String::as_str),
            Some("5")
        );
        Ok(())
    }

    #[tokio::test]
    async fn clear_supersedes_inflight_configuration() -> TestResult {
        let mut f = Fixture::new(Some("original")).await?;
        f.state.block.store(true, Ordering::SeqCst);
        let tmdb = f.tmdb.clone();
        let configure = tokio::spawn(async move { tmdb.configure("replacement", true).await });
        assert_eq!(f.request().await?.path, "/3/configuration");
        f.tmdb.clear().await?;
        f.state.gate.add_permits(1);
        let status = configure.await??;
        assert!(!status.configured);
        assert!(!f.tmdb.status().await.configured);
        assert!(!tokio::fs::try_exists(&f.tmdb.token_file).await?);
        Ok(())
    }
}
