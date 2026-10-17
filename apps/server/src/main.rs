//! Starts backend logging and delegates process input to the CLI adapter.

#![deny(clippy::too_many_lines)]

use std::process::ExitCode;

#[tokio::main]
async fn main() -> ExitCode {
    tracing_subscriber::fmt()
        .json()
        .with_writer(popcorn_diagnostics::trace_writer)
        .with_max_level(tracing::Level::INFO)
        .init();

    match popcorn_server::run_cli().await {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            let mut causes = Vec::new();
            let mut cause = std::error::Error::source(&error);
            while let Some(error) = cause {
                causes.push(error.to_string());
                if causes.len() >= 8 {
                    break;
                }
                cause = error.source();
            }
            tracing::error!(error = %error, causes = ?causes, "backend command failed");
            ExitCode::FAILURE
        }
    }
}
