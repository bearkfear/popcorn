//! Standalone Popcorn backend entry point.

use std::{
    io::{self, Write},
    path::PathBuf,
    process::ExitCode,
};

use clap::{Parser, Subcommand};
use popcorn_server::{Backend, Error, ServerConfig, create_catalog};
use serde::Deserialize;
use tokio::io::{AsyncBufRead, AsyncBufReadExt, AsyncReadExt, BufReader};

#[derive(Debug, Parser)]
#[command(version, about = "Local Popcorn backend foundation")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Debug, Subcommand)]
enum Command {
    /// Run under a desktop shell using a private, newline-delimited JSON stdin pipe.
    Sidecar,
    /// Create an empty versioned catalog snapshot without replacing an existing file.
    InitCatalog {
        /// Output `SQLite` snapshot.
        #[arg(long)]
        output: PathBuf,
    },
    /// Run the local backend using an existing catalog and token file.
    Serve {
        /// Installed, read-only catalog snapshot.
        #[arg(long)]
        catalog: PathBuf,
        /// Persistent user data directory, outside the installation resources.
        #[arg(long)]
        data_dir: PathBuf,
        /// File containing a 64-character hexadecimal secret, not a CLI secret.
        #[arg(long)]
        token_file: PathBuf,
        /// Loopback port; zero chooses a free port.
        #[arg(long, default_value_t = 0)]
        port: u16,
    },
}

#[tokio::main]
async fn main() -> ExitCode {
    tracing_subscriber::fmt()
        .json()
        .with_writer(io::stderr)
        .with_max_level(tracing::Level::INFO)
        .init();
    match execute(Cli::parse()).await {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            tracing::error!(error = %error, "backend command failed");
            ExitCode::FAILURE
        }
    }
}

async fn execute(cli: Cli) -> Result<(), Error> {
    match cli.command {
        Command::Sidecar => run_sidecar().await?,
        Command::InitCatalog { output } => {
            create_catalog(&output).await?;
            tracing::info!("bootstrap catalog created");
        }
        Command::Serve {
            catalog,
            data_dir,
            token_file,
            port,
        } => {
            let config = ServerConfig::new(catalog, data_dir, token_file).with_port(port);
            let backend = Backend::prepare(with_tmdb_environment(config)?).await?;
            #[cfg(unix)]
            let mut interrupt =
                tokio::signal::unix::signal(tokio::signal::unix::SignalKind::interrupt())?;
            #[cfg(unix)]
            let mut terminate =
                tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())?;
            #[cfg(windows)]
            let mut interrupt = tokio::signal::windows::ctrl_c()?;
            let shutdown = async move {
                #[cfg(unix)]
                tokio::select! {
                    _ = interrupt.recv() => {}
                    _ = terminate.recv() => {}
                }
                #[cfg(windows)]
                {
                    interrupt.recv().await;
                }
            };
            {
                let mut stdout = io::stdout().lock();
                serde_json::to_writer(&mut stdout, backend.ready())?;
                writeln!(stdout)?;
                stdout.flush()?;
            }
            tracing::info!(instance_id = %backend.ready().instance_id, "backend ready");
            backend.run(shutdown).await?;
            tracing::info!("backend stopped");
        }
    }
    Ok(())
}

fn with_tmdb_environment(config: ServerConfig) -> Result<ServerConfig, Error> {
    match std::env::var("TMDB_READ_ACCESS_TOKEN") {
        Ok(token) => Ok(config.with_tmdb_token(token)),
        Err(std::env::VarError::NotPresent) => Ok(config),
        Err(std::env::VarError::NotUnicode(_)) => Err(Error::TmdbConfiguration),
    }
}

#[derive(Deserialize)]
#[serde(tag = "event", rename_all = "snake_case", deny_unknown_fields)]
enum Control {
    Initialize {
        catalog: PathBuf,
        data_dir: PathBuf,
        token: String,
        origin: String,
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
    // Do not propagate parser diagnostics: the input contains the session secret.
    serde_json::from_slice(&frame)
        .map(Some)
        .map_err(|_| Error::InvalidControlMessage)
}

async fn run_sidecar() -> Result<(), Error> {
    let mut control = BufReader::new(tokio::io::stdin());
    let initialization = tokio::time::timeout(
        std::time::Duration::from_secs(10),
        read_control(&mut control),
    )
    .await
    .map_err(|_| Error::InitializationTimeout)??;
    let Some(Control::Initialize {
        catalog,
        data_dir,
        token,
        origin,
    }) = initialization
    else {
        return Err(Error::InvalidControlMessage);
    };
    let config = ServerConfig::from_private_channel(catalog, data_dir, token.as_bytes(), origin)?;
    let backend = Backend::prepare(with_tmdb_environment(config)?).await?;
    {
        let mut stdout = io::stdout().lock();
        serde_json::to_writer(&mut stdout, backend.ready())?;
        writeln!(stdout)?;
        stdout.flush()?;
    }
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
    let mut stdout = io::stdout().lock();
    match writeln!(stdout, "{{\"event\":\"stopped\"}}").and_then(|()| stdout.flush()) {
        Err(error) if error.kind() == io::ErrorKind::BrokenPipe => {
            // A lost shell closes both pipes; storage has already shut down.
            tracing::debug!("sidecar control consumer closed before shutdown acknowledgement");
            Ok(())
        }
        result => result.map_err(Error::Io),
    }
}
