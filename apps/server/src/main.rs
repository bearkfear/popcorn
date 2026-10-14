//! Standalone Popcorn backend entry point.

use std::{
    io::{self, Write},
    path::PathBuf,
    process::ExitCode,
};

use clap::{Parser, Subcommand};
use popcorn_server::{Backend, Error, ServerConfig, create_catalog};

#[derive(Debug, Parser)]
#[command(version, about = "Local Popcorn backend foundation")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Debug, Subcommand)]
enum Command {
    /// Create an empty versioned catalog snapshot without replacing an existing file.
    InitCatalog {
        /// Output SQLite snapshot.
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
            let backend =
                Backend::prepare(ServerConfig::new(catalog, data_dir, token_file).with_port(port))
                    .await?;
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
