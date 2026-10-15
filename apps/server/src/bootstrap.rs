use std::{
    fmt,
    future::Future,
    net::{Ipv4Addr, SocketAddr},
    path::PathBuf,
    sync::Arc,
    time::Duration,
};

use serde::Serialize;
use tokio::net::TcpListener;
use uuid::Uuid;

#[path = "api.rs"]
mod api;
#[path = "auth.rs"]
mod auth;
#[path = "storage.rs"]
mod storage;

use api::{AccessPolicy, HealthState};
use auth::SessionToken;
use storage::Storage;

use crate::{Error, source::SourceEngine, tmdb::Tmdb};

pub use storage::create_catalog;

/// Explicit filesystem locations for a standalone backend.
#[derive(Debug)]
pub struct ServerConfig {
    catalog: PathBuf,
    data_dir: PathBuf,
    credential: Credential,
    port: u16,
    origin: Option<String>,
    tmdb_token: Option<TmdbToken>,
    tmdb_api_base: Option<String>,
}

struct TmdbToken(String);

impl fmt::Debug for TmdbToken {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("TmdbToken([REDACTED])")
    }
}

#[derive(Debug)]
enum Credential {
    File(PathBuf),
    Private(SessionToken),
}

impl ServerConfig {
    /// Uses an OS-assigned loopback port and the supplied paths.
    #[must_use]
    pub const fn new(catalog: PathBuf, data_dir: PathBuf, token_file: PathBuf) -> Self {
        Self {
            catalog,
            data_dir,
            credential: Credential::File(token_file),
            port: 0,
            origin: None,
            tmdb_token: None,
            tmdb_api_base: None,
        }
    }

    /// Configures a sidecar using a secret received over its private control pipe.
    ///
    /// # Errors
    ///
    /// Rejects malformed secrets and origins outside the desktop application.
    pub fn from_private_channel(
        catalog: PathBuf,
        data_dir: PathBuf,
        token: &[u8],
        origin: String,
    ) -> Result<Self, Error> {
        if !matches!(
            origin.as_str(),
            "http://localhost:1420"
                | "tauri://localhost"
                | "http://tauri.localhost"
                | "https://tauri.localhost"
        ) {
            return Err(Error::InvalidControlMessage);
        }
        Ok(Self {
            catalog,
            data_dir,
            credential: Credential::Private(SessionToken::parse(token)?),
            port: 0,
            origin: Some(origin),
            tmdb_token: None,
            tmdb_api_base: None,
        })
    }

    /// Supplies a private TMDB read access token, without writing it to disk.
    #[must_use]
    pub fn with_tmdb_token(mut self, token: String) -> Self {
        self.tmdb_token = Some(TmdbToken(token));
        self
    }

    /// Selects a trusted TMDB adapter endpoint for an embedded integration.
    ///
    /// # Errors
    ///
    /// Only the production HTTPS API or loopback HTTP fixture servers are accepted.
    pub fn with_tmdb_api_base(mut self, base: &str) -> Result<Self, Error> {
        let url = reqwest::Url::parse(base).map_err(|_| Error::TmdbConfiguration)?;
        let allowed = matches!(
            (url.scheme(), url.host_str()),
            ("https", Some("api.themoviedb.org"))
                | ("http", Some("127.0.0.1" | "localhost" | "[::1]"))
        );
        if !allowed || !url.username().is_empty() || url.password().is_some() {
            return Err(Error::TmdbConfiguration);
        }
        self.tmdb_api_base = Some(base.to_owned());
        Ok(self)
    }

    /// Selects a loopback port; zero requests an OS-assigned port.
    #[must_use]
    pub const fn with_port(mut self, port: u16) -> Self {
        self.port = port;
        self
    }
}

/// Machine-readable readiness emitted after storage and listener initialization.
#[derive(Debug, Clone, Serialize)]
pub struct Ready {
    /// Bootstrap event discriminator.
    pub event: &'static str,
    /// Bound loopback address.
    pub address: SocketAddr,
    /// Version of this diagnostic bootstrap protocol, not the future Connect API.
    pub protocol_version: &'static str,
    /// Unique process instance identifier.
    pub instance_id: Uuid,
    /// Version of the validated installed catalog.
    pub catalog_version: String,
}

/// Prepared listener and storage; the data lock lasts for this instance.
#[derive(Debug)]
pub struct Backend {
    listener: TcpListener,
    storage: Storage,
    access: Arc<AccessPolicy>,
    ready: Ready,
    tmdb: Arc<Tmdb>,
    source: Arc<SourceEngine>,
}

impl Backend {
    /// Validates the secret and catalog, locks local data and applies migrations.
    ///
    /// # Errors
    ///
    /// Returns an error for invalid inputs, occupied data, incompatible catalog,
    /// migration failure or a port that cannot be bound.
    pub async fn prepare(config: ServerConfig) -> Result<Self, Error> {
        let token = match config.credential {
            Credential::File(path) => SessionToken::read(&path).await?,
            Credential::Private(token) => token,
        };
        let storage = Storage::open(&config.data_dir, &config.catalog).await?;
        let Ok(tmdb) = Tmdb::new(
            storage.user.clone(),
            config.data_dir.join("tmdb.token"),
            config.tmdb_token.map(|secret| secret.0),
            config
                .tmdb_api_base
                .as_deref()
                .unwrap_or("https://api.themoviedb.org/3/"),
        )
        .await
        else {
            storage.close().await;
            return Err(Error::TmdbConfiguration);
        };
        let tmdb = Arc::new(tmdb);
        let listener = match TcpListener::bind((Ipv4Addr::LOCALHOST, config.port)).await {
            Ok(listener) => listener,
            Err(error) => {
                storage.close().await;
                return Err(Error::Io(error));
            }
        };
        let address = listener.local_addr()?;
        let source = Arc::new(SourceEngine::new(
            storage.user.clone(),
            &config.data_dir,
            address.to_string(),
            config.origin.clone(),
        ));
        let ready = Ready {
            event: "ready",
            address,
            protocol_version: "bootstrap.v1",
            instance_id: Uuid::new_v4(),
            catalog_version: storage.catalog_version.clone(),
        };
        Ok(Self {
            listener,
            storage,
            access: Arc::new(AccessPolicy {
                token,
                host: address.to_string(),
                origin: config.origin,
            }),
            ready,
            tmdb,
            source,
        })
    }

    /// Returns bootstrap metadata without exposing credentials or paths.
    #[must_use]
    pub const fn ready(&self) -> &Ready {
        &self.ready
    }

    /// Serves authenticated diagnostics until the supplied shutdown signal fires.
    ///
    /// # Errors
    ///
    /// Returns an error if the HTTP server fails. Pools close before the data lock
    /// is released. The caller owns installation and supervision of its signal.
    pub async fn run(
        self,
        shutdown: impl Future<Output = ()> + Send + 'static,
    ) -> Result<(), Error> {
        let app = api::router(
            HealthState {
                catalog: self.storage.catalog.clone(),
                user: self.storage.user.clone(),
                instance_id: self.ready.instance_id,
                catalog_version: self.ready.catalog_version,
                tmdb: self.tmdb,
                source: self.source.clone(),
            },
            self.access,
        );
        let (notified, mut notification) = tokio::sync::oneshot::channel();
        let shutdown = async move {
            shutdown.await;
            if notified.send(()).is_err() {
                tracing::debug!("server finished before shutdown notification");
            }
        };
        let server = axum::serve(self.listener, app)
            .with_graceful_shutdown(shutdown)
            .into_future();
        tokio::pin!(server);
        let result = tokio::select! {
            result = &mut server => result.map_err(Error::Io),
            _ = &mut notification => {
                tokio::time::timeout(Duration::from_secs(5), &mut server)
                    .await
                    .map_err(|_| Error::ShutdownTimeout)
                    .and_then(|result| result.map_err(Error::Io))
            }
        };
        self.source.shutdown().await;
        self.storage.close().await;
        result
    }
}
