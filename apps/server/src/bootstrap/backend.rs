//! Composes backend adapters and owns listener and shutdown lifetimes.

use super::{
    Error, ServerConfig,
    config::Credential,
    server,
    services::{self, BackendCatalog},
};
use std::{
    future::Future,
    net::{Ipv4Addr, SocketAddr},
    sync::Arc,
};

use serde::Serialize;
use tokio::net::TcpListener;
use uuid::Uuid;

use crate::{
    application::media::commands::{ShutdownMedia, shutdown_media},
    infra::{
        auth::session_token,
        health::HealthCheck,
        media::{MediaApplication, media_application},
        storage::Storage,
    },
    interface::{self, AccessPolicy, HealthState},
};

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

impl Ready {
    fn new(address: SocketAddr, catalog_version: String) -> Self {
        Self {
            event: "ready",
            address,
            protocol_version: "bootstrap.v1",
            instance_id: Uuid::new_v4(),
            catalog_version,
        }
    }
}

/// Prepared listener and storage; the data lock lasts for this instance.
#[derive(Debug)]
pub struct Backend {
    listener: TcpListener,
    storage: Storage,
    access: Arc<AccessPolicy>,
    ready: Ready,
    catalog: BackendCatalog,
    media: Arc<MediaApplication>,
}

impl Backend {
    /// Validates the secret and catalog, locks local data and applies migrations.
    ///
    /// # Errors
    ///
    /// Returns an error for invalid inputs, occupied data, incompatible catalog,
    /// migration failure or a port that cannot be bound.
    pub async fn prepare(config: ServerConfig) -> Result<Self, Error> {
        let bind = config.bind_address();
        let fallback_port = config.browser.is_some() && config.port == 0;
        let token = match config.credential {
            Credential::File(path) => session_token(&path).await?,
            Credential::Private(token) => token,
        };
        let storage = Storage::open(&config.data_dir, &config.catalog).await?;
        popcorn_diagnostics::init(&config.data_dir.join("logs"), "server")?;
        let catalog = match services::catalog(
            &storage,
            config.data_dir.join("tmdb.token"),
            config.tmdb_token.map(|secret| secret.0),
            config
                .tmdb_api_base
                .as_deref()
                .unwrap_or("https://api.themoviedb.org/3/"),
        )
        .await
        {
            Ok(catalog) => catalog,
            Err(error) => {
                storage.close().await;
                return Err(error);
            }
        };
        let listener = match server::listen(bind, fallback_port).await {
            Ok(listener) => listener,
            Err(error) => {
                storage.close().await;
                return Err(Error::Io(error));
            }
        };
        let address = SocketAddr::from((Ipv4Addr::LOCALHOST, listener.local_addr()?.port()));
        let media = Arc::new(media_application(
            storage.user.clone(),
            &config.data_dir,
            address.to_string(),
            config.browser.is_some(),
        ));
        let ready = Ready::new(address, storage.catalog_version.clone());
        let access = services::access(token, address, config.origin, config.browser);
        popcorn_diagnostics::record(
            "server.ready",
            serde_json::json!({
                "instance_id": ready.instance_id, "protocol": ready.protocol_version,
            }),
        );
        Ok(Self {
            listener,
            storage,
            access,
            ready,
            catalog,
            media,
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
        let media = interface::media::router(self.media.clone(), self.access.clone());
        let rpc = interface::rpc::router(
            Arc::new(crate::application::history::History::new(
                crate::infra::history::SqliteHistory(self.storage.user.clone()),
            )),
            self.catalog.metadata.clone(),
            self.catalog.snapshot.clone(),
            self.media.clone(),
        );
        let app = interface::router(
            HealthState {
                check: HealthCheck::new(self.storage.catalog.clone(), self.storage.user.clone()),
                instance_id: self.ready.instance_id,
                catalog_version: self.ready.catalog_version,
            },
            self.access,
            rpc,
            media,
        );
        let media = self.media.clone();
        let shutdown = async move {
            shutdown.await;
            shutdown_media::handle(media.as_ref(), ShutdownMedia).await;
        };
        let result = server::serve(self.listener, app, shutdown).await;
        popcorn_diagnostics::record(
            "server.stopped",
            serde_json::json!({ "success": result.is_ok() }),
        );
        shutdown_media::handle(self.media.as_ref(), ShutdownMedia).await;
        self.storage.close().await;
        result
    }
}
