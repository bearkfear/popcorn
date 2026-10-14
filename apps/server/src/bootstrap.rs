use std::{
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

use crate::Error;

pub use storage::create_catalog;

/// Explicit filesystem locations for a standalone backend.
#[derive(Debug)]
pub struct ServerConfig {
    catalog: PathBuf,
    data_dir: PathBuf,
    token_file: PathBuf,
    port: u16,
}

impl ServerConfig {
    /// Uses an OS-assigned loopback port and the supplied paths.
    #[must_use]
    pub const fn new(catalog: PathBuf, data_dir: PathBuf, token_file: PathBuf) -> Self {
        Self {
            catalog,
            data_dir,
            token_file,
            port: 0,
        }
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
}

impl Backend {
    /// Validates the secret and catalog, locks local data and applies migrations.
    ///
    /// # Errors
    ///
    /// Returns an error for invalid inputs, occupied data, incompatible catalog,
    /// migration failure or a port that cannot be bound.
    pub async fn prepare(config: ServerConfig) -> Result<Self, Error> {
        let token = SessionToken::read(&config.token_file).await?;
        let storage = Storage::open(&config.data_dir, &config.catalog).await?;
        let listener = match TcpListener::bind((Ipv4Addr::LOCALHOST, config.port)).await {
            Ok(listener) => listener,
            Err(error) => {
                storage.close().await;
                return Err(Error::Io(error));
            }
        };
        let address = listener.local_addr()?;
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
            }),
            ready,
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
        self.storage.close().await;
        result
    }
}
