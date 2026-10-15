//! Starts backend logging and delegates process input to the CLI adapter.

#![deny(clippy::too_many_lines)]

use std::{io, process::ExitCode};

#[tokio::main]
async fn main() -> ExitCode {
    tracing_subscriber::fmt()
        .json()
        .with_writer(io::stderr)
        .with_max_level(tracing::Level::INFO)
        .init();
    match popcorn_server::run_cli().await {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            tracing::error!(error = %error, "backend command failed");
            ExitCode::FAILURE
        }
    }
}
