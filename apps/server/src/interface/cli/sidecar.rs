//! Handles bounded private-pipe initialization and sidecar shutdown messages.

use std::{
    io::{self, Write},
    path::PathBuf,
    time::Duration,
};

use serde::Deserialize;
use tokio::io::{AsyncBufRead, AsyncBufReadExt, AsyncReadExt, BufReader};

use crate::{Backend, Error, ServerConfig};

use super::{emit_ready, with_tmdb_environment};

#[derive(Deserialize)]
#[serde(tag = "event", rename_all = "snake_case", deny_unknown_fields)]
enum Control {
    Initialize {
        catalog: PathBuf,
        data_dir: PathBuf,
        token: String,
        origin: String,
        #[serde(default)]
        web_root: Option<PathBuf>,
        #[serde(default)]
        browser_ticket: Option<String>,
    },
    Shutdown,
}

async fn read_control(reader: &mut (impl AsyncBufRead + Unpin)) -> Result<Option<Control>, Error> {
    let mut frame = Vec::new();
    let length = reader.take(16_385).read_until(b'\n', &mut frame).await?;
    if length == 0 {
        return Ok(None);
    }
    if length > 16_384 || !frame.ends_with(b"\n") {
        return Err(Error::InvalidControlMessage);
    }
    // Parser diagnostics could contain the private credential.
    serde_json::from_slice(&frame)
        .map(Some)
        .map_err(|_| Error::InvalidControlMessage)
}

pub(super) async fn run() -> Result<(), Error> {
    let mut control = BufReader::new(tokio::io::stdin());
    let initialization = tokio::time::timeout(Duration::from_secs(10), read_control(&mut control))
        .await
        .map_err(|_| Error::InitializationTimeout)??;
    let Some(Control::Initialize {
        catalog,
        data_dir,
        token,
        origin,
        web_root,
        browser_ticket,
    }) = initialization
    else {
        return Err(Error::InvalidControlMessage);
    };
    let config = ServerConfig::from_private_channel(catalog, data_dir, token.as_bytes(), origin)?;
    let config = match (web_root, browser_ticket) {
        (Some(root), Some(ticket)) => config.with_browser(root, ticket.as_bytes())?,
        (None, None) => config,
        _ => return Err(Error::InvalidControlMessage),
    };
    let backend = Backend::prepare(with_tmdb_environment(config)?).await?;
    emit_ready(&backend)?;
    backend
        .run(async move {
            match read_control(&mut control).await {
                Ok(Some(Control::Shutdown) | None) => {}
                Ok(Some(Control::Initialize { .. })) | Err(_) => {
                    tracing::warn!("invalid control frame; shutting down sidecar");
                }
            }
        })
        .await?;
    emit_stopped()
}

fn emit_stopped() -> Result<(), Error> {
    let mut stdout = io::stdout().lock();
    match writeln!(stdout, "{{\"event\":\"stopped\"}}").and_then(|()| stdout.flush()) {
        Err(error) if error.kind() == io::ErrorKind::BrokenPipe => {
            tracing::debug!("sidecar control consumer closed before shutdown acknowledgement");
            Ok(())
        }
        result => result.map_err(Error::Io),
    }
}
