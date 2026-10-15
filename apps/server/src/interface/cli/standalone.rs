//! Serves standalone backend commands and translates operating-system shutdown signals.

use crate::{Backend, Error, ServerConfig};

use super::{emit_ready, with_tmdb_environment};

pub(super) async fn run(config: ServerConfig) -> Result<(), Error> {
    let backend = Backend::prepare(with_tmdb_environment(config)?).await?;
    #[cfg(unix)]
    let mut interrupt = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::interrupt())?;
    #[cfg(unix)]
    let mut terminate = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())?;
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
    emit_ready(&backend)?;
    tracing::info!(instance_id = %backend.ready().instance_id, "backend ready");
    backend.run(shutdown).await?;
    tracing::info!("backend stopped");
    Ok(())
}
