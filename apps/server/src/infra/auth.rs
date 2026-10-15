//! Reads a bounded private token file and delegates validation to the core.

use std::path::Path;

use tokio::io::AsyncReadExt;

use crate::{Error, core::auth::SessionToken};

pub(crate) async fn session_token(path: &Path) -> Result<SessionToken, Error> {
    let mut bytes = Vec::with_capacity(67);
    tokio::fs::File::open(path)
        .await?
        .take(67)
        .read_to_end(&mut bytes)
        .await?;
    let bytes = bytes.strip_suffix(b"\n").unwrap_or(&bytes);
    let bytes = bytes.strip_suffix(b"\r").unwrap_or(bytes);
    SessionToken::parse(bytes).map_err(|_| Error::InvalidToken)
}
