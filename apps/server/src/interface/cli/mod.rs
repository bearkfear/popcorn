//! Parses standalone commands and selects the standalone or private sidecar adapter.

mod sidecar;
mod standalone;

use std::{
    io::{self, Write},
    path::PathBuf,
};

use clap::{Parser, Subcommand};

use crate::{Backend, Error, ServerConfig, create_catalog};

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

/// Executes the backend command selected by the process arguments.
///
/// # Errors
///
/// Returns failures from input parsing, backend preparation or serving.
pub async fn run() -> Result<(), Error> {
    match Cli::parse().command {
        Command::Sidecar => sidecar::run().await,
        Command::InitCatalog { output } => {
            create_catalog(&output).await?;
            tracing::info!("bootstrap catalog created");
            Ok(())
        }
        Command::Serve {
            catalog,
            data_dir,
            token_file,
            port,
        } => {
            standalone::run(ServerConfig::new(catalog, data_dir, token_file).with_port(port)).await
        }
    }
}

fn with_tmdb_environment(config: ServerConfig) -> Result<ServerConfig, Error> {
    match std::env::var("TMDB_READ_ACCESS_TOKEN") {
        Ok(token) => Ok(config.with_tmdb_token(token)),
        Err(std::env::VarError::NotPresent) => Ok(config),
        Err(std::env::VarError::NotUnicode(_)) => Err(Error::TmdbConfiguration),
    }
}

fn emit_ready(backend: &Backend) -> Result<(), Error> {
    let mut stdout = io::stdout().lock();
    serde_json::to_writer(&mut stdout, backend.ready())?;
    writeln!(stdout)?;
    stdout.flush()?;
    Ok(())
}
