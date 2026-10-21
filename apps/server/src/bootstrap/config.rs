//! Defines backend filesystem locations, private credentials and startup options.

use std::{fmt, path::PathBuf};

use crate::{Error, core::auth::SessionToken};

/// Explicit filesystem locations for a standalone backend.
#[derive(Debug)]
pub struct ServerConfig {
    pub(super) catalog: PathBuf,
    pub(super) data_dir: PathBuf,
    pub(super) credential: Credential,
    pub(super) port: u16,
    pub(super) origin: Option<String>,
    pub(super) browser: Option<(PathBuf, SessionToken)>,
    pub(super) tmdb_token: Option<TmdbToken>,
    pub(super) tmdb_api_base: Option<String>,
}

pub(super) struct TmdbToken(pub(super) String);

impl fmt::Debug for TmdbToken {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("TmdbToken([REDACTED])")
    }
}

#[derive(Debug)]
pub(super) enum Credential {
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
            browser: None,
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
            credential: Credential::Private(
                SessionToken::parse(token).map_err(|_| Error::InvalidToken)?,
            ),
            port: 0,
            origin: Some(origin),
            browser: None,
            tmdb_token: None,
            tmdb_api_base: None,
        })
    }

    /// Enables the packaged browser interface with a private launch ticket.
    ///
    /// # Errors
    /// Rejects malformed launch tickets.
    pub fn with_browser(mut self, root: PathBuf, ticket: &[u8]) -> Result<Self, Error> {
        self.browser = Some((
            root,
            SessionToken::parse(ticket).map_err(|_| Error::InvalidToken)?,
        ));
        Ok(self)
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
