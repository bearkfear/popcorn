//! TMDB v3 metadata, private credentials and the user's disposable catalog cache.

pub mod cache;
pub mod catalog;
pub mod client;
pub mod credentials;
pub mod mapping;
pub mod ports;

use std::{
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
    time::Duration,
};

use reqwest::{Client, Url};
use sqlx::SqlitePool;
use tokio::sync::{Mutex, RwLock, Semaphore};
use tokio::time::Instant;

pub(crate) use crate::core::catalog::{
    Cached, CastData, ConnectionStatus, EpisodeData, GenreData, SeasonData, TitleData, TitlePage,
};
use crate::core::catalog::{CatalogError as TmdbError, ReadAccessToken as Secret};
use credentials::{prepare_token, remove_token};
use mapping::Configuration;

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
    pub(crate) async fn new(
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
            Some(token) => (Some(Secret::parse(&token)?), false),
            None => match tokio::fs::read_to_string(&token_file).await {
                Ok(token) => (Some(Secret::parse(&token)?), true),
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

    pub(crate) async fn status(&self) -> ConnectionStatus {
        let credential = self.credential.read().await;
        ConnectionStatus {
            configured: credential.token.is_some(),
            remembered: credential.remembered,
        }
    }

    pub(crate) async fn configure(
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
        let token = Secret::parse(token)?;
        let configuration: Configuration = self.http("configuration", &[], &token).await?;
        configuration.validate()?;
        let _publication = self.publication.lock().await;
        if self.generation.load(Ordering::SeqCst) != generation {
            return Ok(self.status().await);
        }
        if remember {
            let path = self.token_file.clone();
            let value = token.text().to_owned();
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

    pub(crate) async fn clear(&self) -> Result<ConnectionStatus, TmdbError> {
        let _publication = self.publication.lock().await;
        self.generation.fetch_add(1, Ordering::SeqCst);
        *self.credential.write().await = Credential {
            token: None,
            remembered: false,
        };
        remove_token(&self.token_file).await?;
        Ok(self.status().await)
    }
}
